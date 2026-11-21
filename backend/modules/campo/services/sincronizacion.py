"""Modo campo sin conexión (Fase 8): paquete de consulta y sincronización por lotes de la cola de salida.

Reglas:
- El paquete solo contiene información del propio oficial y agregada por zona (sin datos individuales de socios).
- Cada elemento del lote se revalida como si se enviara en línea (permisos, ámbito, ubicación dentro de una zona,
  zona aún asignada, interruptores) y se responde por elemento: un rechazo no bloquea a los demás.
- La idempotencia la dan los `client_uuid` (reintentar nunca duplica).
"""

import datetime
import logging

from core.exceptions import DomainError, FuncionDeshabilitada
from core.repositories.base import EventoAuditoria

logger = logging.getLogger("coac.api")

TIPOS = {"prospecto": "prospectos.registrar", "ruta": "rutas.gestionar", "visita": "visitas.registrar"}
MAX_LOTE = 50
# Tolerancia «baja»: polígonos livianos para guardar en el dispositivo
DETALLE_POLIGONOS = "baja"


class ServicioSincronizacion:
    def __init__(self, campo, clasificacion, territorio, auditoria, uow, parametros, reloj):
        self.campo = campo
        self.clasificacion = clasificacion
        self.territorio = territorio
        self.auditoria = auditoria
        self.uow = uow
        self.parametros = parametros
        self.reloj = reloj

    def _exigir_modo_offline(self):
        if not self.parametros.valor("habilitar_modo_offline"):
            raise FuncionDeshabilitada("El modo campo sin conexión no está habilitado.", "MODO_OFFLINE_DESHABILITADO")

    # ---------- Paquete de consulta para el dispositivo ----------
    def paquete(self, actor, ambito, periodo):
        """Última foto que el dispositivo puede consultar sin conexión: mis zonas (con explicación), polígonos simplificados y rutas."""
        self._exigir_modo_offline()
        ahora = self.reloj()
        horas = self.parametros.valor("horas_ventana_offline")
        mis = self.campo.mis_zonas(actor.id, periodo) if actor.tiene_permiso("zonas.propias") else {"periodo": periodo, "items": []}
        ids = [i["zona"]["id"] for i in mis["items"]]
        for i in mis["items"]:
            try:
                # Misma forma que GET /clasificacion/zonas/{id}/ (reglas evaluadas con indicadores agregados de la zona)
                i["explicacion"] = self.clasificacion.explicacion(i["zona"]["id"], periodo, ambito)
            except DomainError:
                i["explicacion"] = None
        geoms = self.territorio.geometrias(ids, DETALLE_POLIGONOS)
        features = []
        for i in mis["items"]:
            zid = i["zona"]["id"]
            if zid in geoms:
                cat = i["categoria"]
                features.append({"type": "Feature", "id": zid, "geometry": geoms[zid], "properties": {
                    "id": zid, "codigo": i["zona"]["codigo"], "nombre": i["zona"]["nombre"],
                    "categoria": cat["nombre"] if cat else None, "categoria_color": cat["color_hex"] if cat else None}})
        rutas = self.campo.rutas(actor) if actor.tiene_permiso("rutas.gestionar") else []
        return {
            "generado_en": ahora,
            "vence_en": ahora + datetime.timedelta(hours=horas),
            "horas_ventana_offline": horas,
            "minutos_inactividad": self.parametros.valor("minutos_inactividad_sesion"),
            "periodo": periodo,
            "mis_zonas": mis,
            "poligonos": {"type": "FeatureCollection", "features": features},
            "rutas": rutas,
            "interruptores": {"habilitar_registro_visitas": bool(self.parametros.valor("habilitar_registro_visitas"))},
            "decimales_minimos_coordenada": self.parametros.valor("decimales_minimos_coordenada"),
        }

    # ---------- Sincronización por lotes ----------
    def _procesar(self, item, actor, ambito, periodo):
        tipo, datos = item["tipo"], dict(item["datos"])
        datos["client_uuid"] = item["client_uuid"]
        if item.get("client_created_at"):
            datos["client_created_at"] = item["client_created_at"]
        if not actor.tiene_permiso(TIPOS[tipo]):
            raise DomainError("SIN_PERMISO", "No tiene permiso para este registro.", status=403)
        if tipo == "prospecto":
            return self.campo.registrar_prospecto(datos, ambito, actor)
        if tipo == "ruta":
            return self.campo.crear_ruta(datos, actor, datos.get("periodo") or periodo)
        return self.campo.registrar_visita(datos, actor)

    def sincronizar(self, items, actor, ambito, periodo):
        """Procesa en orden FIFO; cada elemento en su propio punto de guardado. Devuelve el resultado por elemento."""
        resultados = []
        cont = {"recibidos": len(items), "creados": 0, "duplicados": 0, "rechazados": 0, "errores": 0}
        for item in items:
            base = {"client_uuid": item["client_uuid"], "tipo": item["tipo"]}
            if item.get("rechazo"):
                # Rechazo de forma detectado por la vista (datos mal formados)
                cont["rechazados"] += 1
                resultados.append({**base, "estado": "rechazado", **item["rechazo"]})
                continue
            try:
                with self.uow.atomic():
                    recurso, nuevo = self._procesar(item, actor, ambito, periodo)
            except DomainError as e:
                cont["rechazados"] += 1
                resultados.append({**base, "estado": "rechazado", "codigo": e.code, "mensaje": e.message, "detalles": e.details})
                continue
            except Exception:  # error inesperado: el cliente reintentará más tarde (no se pierde el elemento)
                logger.exception("Error al sincronizar un elemento de la cola sin conexión")
                cont["errores"] += 1
                resultados.append({**base, "estado": "error", "codigo": "ERROR_INTERNO", "mensaje": "No se pudo procesar; se reintentará."})
                continue
            cont["creados" if nuevo else "duplicados"] += 1
            resultados.append({**base, "estado": "sincronizado", "duplicado": not nuevo, "id": recurso["id"]})
        horas = sorted(str(i["client_created_at"]) for i in items if i.get("client_created_at"))
        with self.uow.atomic():
            self.auditoria.registrar(EventoAuditoria(
                categoria="campo", accion="sincronizacion_offline", entidad_afectada=f"Usuario#{actor.id}",
                detalle=(f"Sincronización sin conexión: {cont['recibidos']} recibidos, {cont['creados']} creados, "
                         f"{cont['duplicados']} ya existentes, {cont['rechazados']} rechazados, {cont['errores']} con error"),
                usuario_id=actor.id, username=actor.username,
                valor_nuevo={**cont, "client_created_desde": horas[0] if horas else None, "client_created_hasta": horas[-1] if horas else None,
                             "servidor": self.reloj().isoformat()},
            ))
        return {"resultados": resultados, "contadores": cont}
