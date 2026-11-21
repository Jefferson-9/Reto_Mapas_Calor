"""Gestión de límites geográficos (CU-05): GeoJSON → vista previa de cambios → confirmación transaccional."""

import json

from core.exceptions import DomainError, NoEncontrado
from core.repositories.base import EventoAuditoria
from modules.cartera.services.mapeo import mapear

NIVEL = {"provincia": 1, "canton": 2, "parroquia": 3, "barrio": 4}
SINONIMOS_TIPO = {"cantón": "canton", "sector": "barrio", "barrio o sector": "barrio"}


class ServicioLimites:
    def __init__(self, cargas, esquemas, territorio, datos, indicadores, auditoria, uow, parametros, almacen, reloj,
                 al_cambiar_limites=(), al_recalcular=()):
        self.cargas = cargas
        self.esquemas = esquemas
        self.territorio = territorio
        self.datos = datos
        self.indicadores = indicadores
        self.auditoria = auditoria
        self.uow = uow
        self.parametros = parametros
        self.almacen = almacen
        self.reloj = reloj
        self.al_cambiar_limites = list(al_cambiar_limites)
        self.al_recalcular = list(al_recalcular)

    def _auditar(self, actor, accion, detalle, carga_id, nuevo=None):
        self.auditoria.registrar(EventoAuditoria(
            categoria="geografia", accion=accion, entidad_afectada=f"CargaDatos#{carga_id}", detalle=detalle,
            usuario_id=actor.id, username=actor.username, valor_nuevo=nuevo,
        ))

    def _fallar(self, carga, errores, actor):
        self.cargas.actualizar(carga["id"], {"estado": "fallida", "mensaje": "Archivo de límites rechazado; se conservan las divisiones vigentes.",
                                             "resumen": {"errores": errores[:100]}})
        self._auditar(actor, "limites_rechazados", f"Archivo de límites rechazado ({len(errores)} errores)", carga["id"], {"errores": errores[:20]})
        self.almacen.eliminar(carga["ruta_archivo"])
        raise DomainError("LIMITES_INVALIDOS", "El archivo de límites está incompleto o no puede interpretarse. "
                          "Se conservan las divisiones vigentes.", [{"campo": e["codigo"], "mensaje": e["motivo"]} for e in errores[:50]])

    def subir(self, archivo, nombre, actor):
        if not nombre.lower().endswith((".geojson", ".json")):
            raise DomainError("VALIDACION", "El archivo debe ser GeoJSON (.geojson o .json).", [{"campo": "archivo", "mensaje": "Extensión no admitida."}])
        ruta, sha, _ = self.almacen.guardar(archivo, "geojson", self.parametros.valor("max_mb_carga") * 1024 * 1024)
        with self.uow.atomic():
            carga = self.cargas.crear({"nombre_archivo": nombre[:160], "ruta_archivo": ruta, "hash_archivo": sha, "tipo": "limites",
                                       "usuario_id": actor.id, "estado": "validando"})
        try:
            data = json.loads(self.almacen.leer_todo(ruta).decode("utf-8-sig"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._fallar(carga, [{"codigo": "archivo", "motivo": "El archivo no es JSON válido en UTF-8"}], actor)
        if not isinstance(data, dict) or data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list) or not data["features"]:
            self._fallar(carga, [{"codigo": "archivo", "motivo": "Se esperaba un GeoJSON FeatureCollection con al menos una zona"}], actor)
        campos = self.esquemas.vigente("limites")["campos"]
        claves = sorted({k for f in data["features"] if isinstance(f, dict) for k in (f.get("properties") or {})})
        m = mapear(claves, campos)
        if m["faltantes"]:
            self._fallar(carga, [{"codigo": "propiedades", "motivo": "Faltan propiedades obligatorias: " + ", ".join(m["faltantes"])}], actor)
        zonas, errores = self._validar(data["features"], m["mapeo"])
        if errores:
            self._fallar(carga, errores, actor)
        resumen = self._comparar(zonas)
        self.cargas.guardar_staging(carga["id"], [
            {"numero_fila": i + 1, "clasificacion": "valido", "datos": z, "fila_raw": {"codigo": z["codigo"], "nombre": z["nombre"]}, "motivos": []}
            for i, z in enumerate(zonas)
        ])
        self.cargas.actualizar(carga["id"], {"estado": "requiere_revision", "leidos": len(zonas), "resumen": resumen,
                                             "mensaje": "Revise los cambios y confirme para reemplazar las divisiones vigentes."})
        return self.obtener(carga["id"])

    def _validar(self, features, mapeo):
        zonas, errores, codigos = [], [], set()
        for i, f in enumerate(features):
            props = (f or {}).get("properties") or {}
            z = {campo: (str(props.get(col)).strip() if props.get(col) is not None else "") for campo, col in mapeo.items()}
            cod = z.get("codigo") or f"#{i + 1}"
            tipo = z.get("tipo_zona", "").lower()
            tipo = SINONIMOS_TIPO.get(tipo, tipo)
            if not z.get("codigo") or not z.get("nombre"):
                errores.append({"codigo": cod, "motivo": "Falta código o nombre"})
            if tipo not in NIVEL:
                errores.append({"codigo": cod, "motivo": "Tipo de zona no válido (provincia, cantón, parroquia, barrio o sector)"})
            if cod in codigos:
                errores.append({"codigo": cod, "motivo": "Código repetido en el archivo"})
            codigos.add(cod)
            ok, motivo = self.territorio.validar_geometria(f.get("geometry"))
            if not ok:
                errores.append({"codigo": cod, "motivo": motivo})
            hog = z.get("hogares_estimados", "")
            if hog and not hog.isdigit():
                errores.append({"codigo": cod, "motivo": "Hogares estimados no es un entero"})
            zonas.append({"codigo": z.get("codigo", ""), "nombre": z.get("nombre", "")[:120], "tipo_zona": tipo,
                          "zona_superior_codigo": z.get("zona_superior_codigo") or None, "hogares_estimados": int(hog) if hog.isdigit() else None,
                          "fuente_oficial": z.get("fuente_oficial", "")[:200], "agencia_codigo": z.get("agencia_codigo") or None,
                          "geometria": f.get("geometry")})
        por_codigo = {z["codigo"]: z for z in zonas}
        for z in zonas:
            if z["tipo_zona"] not in NIVEL:
                continue
            sup = z["zona_superior_codigo"]
            if z["tipo_zona"] == "provincia":
                continue
            padre = por_codigo.get(sup) or (self.territorio.zona_por_codigo(sup) if sup else None)
            if not padre:
                errores.append({"codigo": z["codigo"], "motivo": "Zona superior inexistente o no indicada"})
            elif NIVEL.get(padre["tipo_zona"], 0) != NIVEL[z["tipo_zona"]] - 1:
                errores.append({"codigo": z["codigo"], "motivo": "La zona superior no corresponde al nivel inmediato"})
        return zonas, errores

    def _comparar(self, zonas):
        actuales = {z["codigo"]: z for z in self.territorio.arbol()}
        nuevas, modificadas, sin_cambio = [], [], []
        for z in zonas:
            a = actuales.get(z["codigo"])
            if not a:
                nuevas.append(z["codigo"])
                continue
            sup = a["zona_superior_id"] and next((x["codigo"] for x in actuales.values() if x["id"] == a["zona_superior_id"]), None)
            iguales = (a["nombre"] == z["nombre"] and a["tipo_zona"] == z["tipo_zona"] and (sup or None) == z["zona_superior_codigo"]
                       and a["hogares_estimados"] == z["hogares_estimados"] and self.territorio.geometria_igual(z["codigo"], z["geometria"]))
            (sin_cambio if iguales else modificadas).append(z["codigo"])
        presentes = {z["codigo"] for z in zonas}
        ausentes = [c for c in actuales if c not in presentes]
        return {"nuevas": nuevas, "modificadas": modificadas, "sin_cambio": sin_cambio, "ausentes": ausentes,
                "conteo": {"nuevas": len(nuevas), "modificadas": len(modificadas), "sin_cambio": len(sin_cambio), "ausentes": len(ausentes)}}

    def obtener(self, carga_id):
        c = self.cargas.obtener(carga_id)
        if not c or c["tipo"] != "limites":
            raise NoEncontrado()
        c.pop("ruta_archivo", None)
        return c

    def listar(self, cursor, tamano):
        page = self.cargas.listar({"tipo": "limites"}, cursor, tamano)
        for c in page["items"]:
            c.pop("ruta_archivo", None)
        return page

    def confirmar(self, carga_id, retirar_ausentes, actor):
        with self.uow.atomic():
            carga = self.cargas.bloquear(carga_id)
            if not carga or carga["tipo"] != "limites":
                raise NoEncontrado()
            if carga["estado"] != "requiere_revision":
                raise DomainError("ESTADO_INVALIDO", "La carga de límites no está lista para confirmarse.")
            zonas = [f["datos"] for lote in self.cargas.iterar_staging(carga_id, "valido", 1000) for f in lote]
            creadas = actualizadas = 0
            for z in sorted(zonas, key=lambda x: NIVEL[x["tipo_zona"]]):
                _, nueva = self.territorio.upsert_zona(z)
                creadas += nueva
                actualizadas += not nueva
            retiradas = self.territorio.retirar_zonas(carga["resumen"]["ausentes"]) if retirar_ausentes else 0
            reasignadas = self.territorio.reasignar_ubicaciones()
            self.datos.sincronizar_zonas()
            for cb in self.al_cambiar_limites:
                cb()
            periodos = self.indicadores.periodos()
            self.indicadores.recalcular(periodos, None)
            for cb in self.al_recalcular:
                cb(periodos)
            resumen = {**carga["resumen"], "aplicado": {"creadas": creadas, "actualizadas": actualizadas, "retiradas": retiradas, "ubicaciones_reasignadas": reasignadas}}
            self.cargas.borrar_staging(carga_id, ["valido"])
            self.cargas.actualizar(carga_id, {"estado": "completada", "cargados": len(zonas), "confirmada_en": self.reloj(), "resumen": resumen,
                                              "mensaje": "Divisiones geográficas actualizadas."})
            self._auditar(actor, "limites_actualizados", f"Límites actualizados: {creadas} nuevas, {actualizadas} actualizadas, {retiradas} retiradas",
                          carga_id, resumen["aplicado"])
        self.almacen.eliminar(carga["ruta_archivo"])
        return self.obtener(carga_id)

    def cancelar(self, carga_id, actor):
        with self.uow.atomic():
            carga = self.cargas.bloquear(carga_id)
            if not carga or carga["tipo"] != "limites" or carga["estado"] != "requiere_revision":
                raise DomainError("ESTADO_INVALIDO", "No se puede cancelar esta carga.")
            self.cargas.borrar_staging(carga_id, ["valido"])
            self.cargas.actualizar(carga_id, {"estado": "cancelada", "mensaje": "Cancelada; se conservan las divisiones vigentes."})
            self._auditar(actor, "limites_cancelados", "Carga de límites cancelada", carga_id)
        self.almacen.eliminar(carga["ruta_archivo"])
        return self.obtener(carga_id)
