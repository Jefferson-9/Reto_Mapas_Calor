"""Planificación y seguimiento de visitas (CU-13 a CU-18)."""

import datetime
import uuid

from core.exceptions import DomainError, FuncionDeshabilitada, NoEncontrado, SinPermiso
from core.repositories.base import EventoAuditoria
from core.utils.geo import validar_coordenadas

RESULTADOS = {"socio_captado", "credito_colocado", "pago_comprometido", "interes", "sin_interes"}
ADVERTENCIA_CAUSALIDAD = ("Los cambios observados entre los períodos no demuestran por sí solos que se deban a las visitas: "
                          "otros factores (económicos, estacionales o de gestión) pueden influir.")


def _uuid(valor):
    if not valor:
        return None
    try:
        return uuid.UUID(str(valor))
    except ValueError:
        raise DomainError("VALIDACION", "Identificador de cliente no válido.", [{"campo": "client_uuid", "mensaje": "Debe ser un UUID."}]) from None


def _horas_cliente(datos):
    """Hora de creación en el dispositivo (registros sin conexión); la hora del servidor es la del propio evento de auditoría."""
    c = datos.get("client_created_at")
    return {"client_created_at": c.isoformat() if hasattr(c, "isoformat") else str(c)} if c else {}


class ServicioCampo:
    def __init__(self, repo, territorio, territorio_repo, clasificacion, indicadores_repo, auditoria, uow, parametros, reloj):
        self.repo = repo
        self.territorio = territorio
        self.territorio_repo = territorio_repo
        self.clasificacion = clasificacion
        self.indicadores = indicadores_repo
        self.auditoria = auditoria
        self.uow = uow
        self.parametros = parametros
        self.reloj = reloj

    def _auditar(self, actor, accion, entidad, detalle, nuevo=None, anterior=None):
        self.auditoria.registrar(EventoAuditoria(categoria="campo", accion=accion, entidad_afectada=entidad, detalle=detalle,
                                                 usuario_id=actor.id, username=actor.username, valor_nuevo=nuevo, valor_anterior=anterior))

    def sincronizar_zonas_prospectos(self):
        return self.repo.sincronizar_zonas_prospectos()

    # ---------- CU-14: asignaciones ----------
    def _oficiales_en_ambito(self, actor):
        return set(self.repo.oficiales_de_agencia(actor.agencia_id))

    def asignaciones(self, actor, oficial_id=None):
        """RF-014.02: el jefe ve las zonas asignadas a cada oficial de su agencia."""
        oficiales = self._oficiales_en_ambito(actor)
        if oficial_id is not None:
            if oficial_id not in oficiales:
                raise NoEncontrado()
            oficiales = {oficial_id}
        return self.repo.asignaciones(oficiales)

    def asignar(self, oficial_id, zona_ids, ambito, actor):
        of = self.repo.oficial(oficial_id)
        if not of or not of["activo"] or not of["es_oficial"]:
            raise DomainError("VALIDACION", "Seleccione un oficial de crédito activo.", [{"campo": "oficial_id", "mensaje": "Oficial no válido."}])
        if actor.agencia_id is not None and of["agencia_id"] != actor.agencia_id:
            raise SinPermiso("El oficial no pertenece a su agencia.")
        if not zona_ids:
            raise DomainError("VALIDACION", "Seleccione al menos una zona.", [{"campo": "zona_ids", "mensaje": "Obligatorio."}])
        hojas = self.territorio.hojas_en_ambito(ambito)
        fuera = [z for z in zona_ids if z not in hojas]
        if fuera:
            # RF-014.04
            raise DomainError("ZONA_FUERA_DE_AMBITO", "Hay zonas fuera de su ámbito de responsabilidad; no se asignó ninguna.",
                              [{"campo": "zona_ids", "mensaje": f"Zona {z} fuera de ámbito"} for z in fuera])
        with self.uow.atomic():
            nuevas = self.repo.crear_asignaciones(oficial_id, list(dict.fromkeys(zona_ids)), actor.id)
            if nuevas:
                self._auditar(actor, "zonas_asignadas", f"Oficial#{oficial_id}", f"{len(nuevas)} zonas asignadas a {of['nombre']}", {"zonas": nuevas})
        return self.repo.asignaciones({oficial_id})

    def retirar(self, asig_id, actor):
        a = self.repo.asignacion(asig_id)
        if not a or not a["activa"] or a["oficial_id"] not in self._oficiales_en_ambito(actor):
            raise NoEncontrado()
        with self.uow.atomic():
            self.repo.retirar_asignacion(asig_id, actor.id, self.reloj())
            self._auditar(actor, "zona_retirada", f"Oficial#{a['oficial_id']}", f"Zona «{a['zona']}» retirada de {a['oficial']}", None, {"zona_id": a["zona_id"]})
        return {"retirada": True}

    # ---------- CU-15: zonas asignadas priorizadas ----------
    def mis_zonas(self, oficial_id, periodo):
        """RF-015.01/02/04: solo sus zonas asignadas, por prioridad, con categoría, indicadores y frecuencia de visita."""
        zonas = set(self.repo.zonas_activas(oficial_id))
        jer = self.territorio.jerarquia()
        hojas = set()
        for z in zonas:
            if z in jer.por_id:
                hojas |= jer.hojas_de(z)
        cats = self.clasificacion.categorias_de(periodo, hojas)
        inds = {i["zona_id"]: i for i in self.indicadores.leer([periodo], hojas)}
        items = []
        for zid in hojas:
            z = jer.por_id[zid]
            cat = cats.get(zid)
            ind = inds.get(zid)
            items.append({
                "zona": {"id": zid, "codigo": z["codigo"], "nombre": z["nombre"], "centroide": z["centroide"]},
                "categoria": {"id": cat["id"], "nombre": cat["nombre"], "color_hex": cat["color_hex"], "prioridad": cat["prioridad"]} if cat else None,
                "frecuencia_visita_dias": cat["frecuencia_visita_dias"] if cat else None,
                "indicadores": {k: (None if ind is None or ind[k] is None else str(ind[k])) for k in
                                ("total_socios", "total_creditos", "monto_cartera", "creditos_atrasados", "tasa_morosidad", "penetracion_pct")} if ind else None,
                "sin_datos": ind is None,
            })
        items.sort(key=lambda i: (i["categoria"]["prioridad"] if i["categoria"] else 10**6,
                                  -float(i["indicadores"]["tasa_morosidad"]) if i["indicadores"] and i["indicadores"]["tasa_morosidad"] else 0,
                                  i["zona"]["nombre"]))
        for n, i in enumerate(items, 1):
            i["orden"] = n
        return {"periodo": periodo, "items": items}

    def lista_de_oficial(self, oficial_id, periodo, actor):
        """RF-015.05: el jefe consulta la lista priorizada de cada oficial de su agencia."""
        if oficial_id not in self._oficiales_en_ambito(actor):
            raise NoEncontrado()
        return self.mis_zonas(oficial_id, periodo)

    # ---------- CU-13: posibles socios ----------
    def registrar_prospecto(self, datos, ambito, actor):
        cu = _uuid(datos.get("client_uuid"))
        if cu:
            previo = self.repo.prospecto_por_uuid(cu)
            if previo:
                if previo["registrado_por_id"] != actor.id:
                    raise DomainError("CONFLICTO_IDEMPOTENCIA", "El identificador ya fue usado por otro usuario.", status=409)
                return previo, False
        errores = []
        if not (datos.get("nombre_negocio") or "").strip():
            errores.append({"campo": "nombre_negocio", "mensaje": "Indique el nombre o referencia del negocio."})
        lat, lng, motivos = validar_coordenadas(datos.get("latitud"), datos.get("longitud"), self.parametros.valor("decimales_minimos_coordenada"))
        if lat is None or motivos:
            errores.append({"campo": "ubicacion", "mensaje": (motivos or ["Ubicación no válida"])[0] + ". Marque un punto más preciso en el mapa."})
        if errores:
            raise DomainError("VALIDACION", "Revise los datos del posible socio.", errores)
        zona = self.territorio_repo.zona_de_punto(lat, lng)
        if not zona:
            raise DomainError("FUERA_DE_ZONA", "La ubicación no se encuentra dentro de una zona registrada.",
                              [{"campo": "ubicacion", "mensaje": "Fuera de las zonas vigentes"}])
        if zona["id"] not in self.territorio.hojas_en_ambito(ambito):
            raise DomainError("FUERA_DE_AMBITO", "La ubicación está fuera de su ámbito de responsabilidad.",
                              [{"campo": "ubicacion", "mensaje": f"Zona «{zona['nombre']}» fuera de su ámbito"}])
        with self.uow.atomic():
            ub = self.territorio_repo.crear_ubicaciones([{"latitud": str(lat), "longitud": str(lng), "direccion": datos.get("direccion", ""), "zona_id": zona["id"]}])[0]
            p = self.repo.crear_prospecto({
                "client_uuid": cu, "client_created_at": datos.get("client_created_at"), "nombre_negocio": datos["nombre_negocio"].strip()[:160],
                "referencia": (datos.get("referencia") or "")[:200], "actividad": (datos.get("actividad") or "")[:120], "ubicacion_id": ub,
                "zona_id": zona["id"], "observacion": (datos.get("observacion") or "")[:500], "registrado_por_id": actor.id,
            })
            self._auditar(actor, "prospecto_registrado", f"PosibleSocio#{p['id']}", f"Posible socio registrado en «{zona['nombre']}»",
                          {"zona_id": zona["id"], "actividad": p["actividad"], **_horas_cliente(datos)})
        return p, True

    def prospectos(self, ambito, filtros, cursor, tamano):
        return self.repo.listar_prospectos(self.territorio.hojas_en_ambito(ambito), filtros, cursor, tamano)

    # ---------- CU-16: rutas ----------
    def sugerir_orden(self, zona_ids, periodo):
        cats = self.clasificacion.categorias_de(periodo, zona_ids)
        inds = {i["zona_id"]: i for i in self.indicadores.leer([periodo], zona_ids)}
        return sorted(zona_ids, key=lambda z: (cats[z]["prioridad"] if cats.get(z) else 10**6,
                                               -float(inds[z]["tasa_morosidad"]) if z in inds and inds[z]["tasa_morosidad"] is not None else 0))

    def _validar_zonas_ruta(self, zona_ids, actor):
        if not zona_ids:
            raise DomainError("VALIDACION", "Agregue al menos una zona a la ruta.", [{"campo": "zona_ids", "mensaje": "Obligatorio."}])
        if len(set(zona_ids)) != len(zona_ids):
            raise DomainError("VALIDACION", "La ruta tiene zonas repetidas.", [{"campo": "zona_ids", "mensaje": "Zonas repetidas."}])
        asignadas = set(self.repo.zonas_activas(actor.id))
        fuera = [z for z in zona_ids if z not in asignadas]
        if fuera:
            # RF-016.05
            raise DomainError("ZONA_NO_ASIGNADA", "La ruta incluye zonas que no están asignadas a usted.",
                              [{"campo": "zona_ids", "mensaje": f"Zona {z} no asignada"} for z in fuera])

    def crear_ruta(self, datos, actor, periodo):
        cu = _uuid(datos.get("client_uuid"))
        if cu:
            previa = self.repo.ruta_por_uuid(cu)
            if previa:
                if previa["oficial_id"] != actor.id:
                    raise DomainError("CONFLICTO_IDEMPOTENCIA", "El identificador ya fue usado por otro usuario.", status=409)
                return previa, False
        zona_ids = list(datos.get("zona_ids") or [])
        self._validar_zonas_ruta(zona_ids, actor)
        if datos.get("orden_sugerido"):
            zona_ids = self.sugerir_orden(zona_ids, periodo)
        errores = []
        if not (datos.get("nombre") or "").strip():
            errores.append({"campo": "nombre", "mensaje": "Indique un nombre para la ruta."})
        if not datos.get("fecha_prevista"):
            errores.append({"campo": "fecha_prevista", "mensaje": "Indique la fecha prevista."})
        if errores:
            raise DomainError("VALIDACION", "Revise los datos de la ruta.", errores)
        with self.uow.atomic():
            r = self.repo.crear_ruta({"client_uuid": cu, "client_created_at": datos.get("client_created_at"), "nombre": datos["nombre"].strip()[:120],
                                      "oficial_id": actor.id, "fecha_prevista": datos["fecha_prevista"]}, zona_ids)
            self._auditar(actor, "ruta_creada", f"RutaVisita#{r['id']}", f"Ruta «{r['nombre']}» con {len(zona_ids)} zonas para {r['fecha_prevista']}",
                          {"zonas": zona_ids, "fecha_prevista": r["fecha_prevista"], **_horas_cliente(datos)})
        return r, True

    def _ruta_visible(self, ruta_id, actor):
        r = self.repo.ruta(ruta_id)
        if not r:
            raise NoEncontrado()
        if r["oficial_id"] == actor.id:
            return r
        if (actor.tiene_permiso("seguimiento.ver") or actor.tiene_permiso("zonas.asignar")) and r["oficial_id"] in self._oficiales_en_ambito(actor):
            return r
        raise NoEncontrado()

    def ruta(self, ruta_id, actor, detalle_geometria=True):
        r = self._ruta_visible(ruta_id, actor)
        if detalle_geometria:
            geoms = self.territorio.geometrias([d["zona_id"] for d in r["detalles"]], "media")
            for d in r["detalles"]:
                d["geometria"] = geoms.get(d["zona_id"])
        return r

    def rutas(self, actor, oficial_id=None):
        if oficial_id is not None and oficial_id != actor.id:
            if oficial_id not in self._oficiales_en_ambito(actor) or not (actor.tiene_permiso("seguimiento.ver") or actor.tiene_permiso("zonas.asignar")):
                raise NoEncontrado()
            return self.repo.rutas({oficial_id})
        if actor.tiene_permiso("rutas.gestionar"):
            return self.repo.rutas({actor.id})
        return self.repo.rutas(self._oficiales_en_ambito(actor))

    def actualizar_ruta(self, ruta_id, datos, actor, periodo):
        r = self.repo.ruta(ruta_id)
        if not r or r["oficial_id"] != actor.id:
            raise NoEncontrado()
        cambios, zona_ids = {}, None
        if "nombre" in datos:
            cambios["nombre"] = (datos["nombre"] or "").strip()[:120] or r["nombre"]
        if "fecha_prevista" in datos and datos["fecha_prevista"]:
            cambios["fecha_prevista"] = datos["fecha_prevista"]
        if "activa" in datos:
            cambios["activa"] = bool(datos["activa"])
        if "zona_ids" in datos:
            zona_ids = list(datos["zona_ids"])
            self._validar_zonas_ruta(zona_ids, actor)
            if datos.get("orden_sugerido"):
                zona_ids = self.sugerir_orden(zona_ids, periodo)
        with self.uow.atomic():
            nueva = self.repo.actualizar_ruta(ruta_id, cambios, zona_ids)
            self._auditar(actor, "ruta_actualizada", f"RutaVisita#{ruta_id}", f"Ruta «{nueva['nombre']}» actualizada",
                          {"zonas": [d["zona_id"] for d in nueva["detalles"]], **{k: v for k, v in cambios.items()}},
                          {"zonas": [d["zona_id"] for d in r["detalles"]]})
        return nueva

    # ---------- CU-17 / CU-18 (condicionados) ----------
    def _exigir_visitas_habilitadas(self):
        if not self.parametros.valor("habilitar_registro_visitas"):
            raise FuncionDeshabilitada("El registro de visitas no está habilitado: requiere la aprobación de la cooperativa.", "VISITAS_DESHABILITADAS")

    def registrar_visita(self, datos, actor):
        self._exigir_visitas_habilitadas()
        cu = _uuid(datos.get("client_uuid"))
        if cu:
            previa = self.repo.visita_por_uuid(cu)
            if previa:
                if previa["oficial_id"] != actor.id:
                    raise DomainError("CONFLICTO_IDEMPOTENCIA", "El identificador ya fue usado por otro usuario.", status=409)
                return previa, False
        realizada = datos.get("realizada", True)
        errores = []
        if not datos.get("fecha_visita"):
            errores.append({"campo": "fecha_visita", "mensaje": "Indique la fecha de la visita."})
        elif datos["fecha_visita"] > (self.reloj().date() + datetime.timedelta(days=1)):
            errores.append({"campo": "fecha_visita", "mensaje": "La fecha de la visita no puede ser futura."})
        if realizada and datos.get("resultado") not in RESULTADOS:
            errores.append({"campo": "resultado", "mensaje": "Indique el resultado de la visita."})
        if not realizada and not (datos.get("motivo_no_realizada") or "").strip():
            errores.append({"campo": "motivo_no_realizada", "mensaje": "Indique el motivo por el que no se realizó."})
        if not datos.get("zona_id"):
            errores.append({"campo": "zona_id", "mensaje": "Seleccione la zona visitada."})
        if errores:
            raise DomainError("VALIDACION", "Revise los datos de la visita.", errores)
        if datos["zona_id"] not in set(self.repo.zonas_activas(actor.id)):
            raise DomainError("ZONA_NO_ASIGNADA", "La zona no está asignada a usted.")
        ruta_id = datos.get("ruta_id")
        if ruta_id:
            r = self.repo.ruta(ruta_id)
            if not r or r["oficial_id"] != actor.id or datos["zona_id"] not in [d["zona_id"] for d in r["detalles"]]:
                raise DomainError("VALIDACION", "La ruta no corresponde a la zona o al oficial.", [{"campo": "ruta_id", "mensaje": "Ruta no válida."}])
        with self.uow.atomic():
            v = self.repo.crear_visita({
                "client_uuid": cu, "client_created_at": datos.get("client_created_at"), "zona_id": datos["zona_id"], "oficial_id": actor.id,
                "ruta_id": ruta_id, "fecha_visita": datos["fecha_visita"], "realizada": realizada,
                "resultado": datos.get("resultado", "") if realizada else "", "motivo_no_realizada": (datos.get("motivo_no_realizada") or "")[:300] if not realizada else "",
                "observaciones": (datos.get("observaciones") or "")[:500],
            })
            self._auditar(actor, "visita_registrada" if realizada else "visita_no_realizada", f"Visita#{v['id']}",
                          f"Visita en «{v['zona']}» ({'realizada' if realizada else 'no realizada'})", {"resultado": v["resultado"], "ruta_id": ruta_id, **_horas_cliente(datos)})
        return v, True

    def visitas(self, actor, filtros, cursor, tamano):
        self._exigir_visitas_habilitadas()
        oficiales = {actor.id} if actor.tiene_permiso("visitas.registrar") else self._oficiales_en_ambito(actor)
        return self.repo.listar_visitas(oficiales, filtros, cursor, tamano)

    def seguimiento(self, actor, oficial_id, desde, hasta):
        """RF-018.02/03/06: previstas vs realizadas y zonas pendientes, solo en el ámbito del supervisor."""
        self._exigir_visitas_habilitadas()
        oficiales = self._oficiales_en_ambito(actor)
        if oficial_id is not None:
            if oficial_id not in oficiales:
                raise NoEncontrado()
            oficiales = {oficial_id}
        data = self.repo.previstas_y_realizadas(oficiales, desde, hasta)
        hechas = {(v["ruta_id"], v["zona_id"]) for v in data["visitas"] if v["realizada"]}
        hechas_zona = {(v["oficial_id"], v["zona_id"]) for v in data["visitas"] if v["realizada"]}
        pendientes, realizadas = [], 0
        for p in data["previstas"]:
            if (p["ruta_id"], p["zona_id"]) in hechas or (p["oficial_id"], p["zona_id"]) in hechas_zona:
                realizadas += 1
            else:
                pendientes.append(p)
        total = len(data["previstas"])
        return {"desde": desde, "hasta": hasta, "previstas": total, "realizadas": realizadas,
                "porcentaje": round(realizadas / total * 100, 2) if total else None, "pendientes": pendientes,
                "visitas_registradas": len(data["visitas"]),
                "no_realizadas": sum(1 for v in data["visitas"] if not v["realizada"])}

    def antes_despues(self, zona_id, periodo_antes, periodo_despues, ambito):
        """RF-018.04/05: indicadores de la zona antes y después, con advertencia obligatoria de no causalidad."""
        self._exigir_visitas_habilitadas()
        if zona_id not in self.territorio.hojas_en_ambito(ambito):
            raise NoEncontrado()
        filas = {i["periodo"]: i for i in self.indicadores.leer([periodo_antes, periodo_despues], [zona_id])}
        claves = ("total_socios", "total_creditos", "monto_cartera", "creditos_atrasados", "saldo_vencido", "tasa_morosidad", "penetracion_pct")
        comp = []
        for k in claves:
            a = filas.get(periodo_antes, {}).get(k)
            d = filas.get(periodo_despues, {}).get(k)
            comp.append({"indicador": k, "antes": None if a is None else str(a), "despues": None if d is None else str(d),
                         "diferencia": None if a is None or d is None else str(d - a)})
        return {"zona_id": zona_id, "periodo_antes": periodo_antes, "periodo_despues": periodo_despues, "comparacion": comp,
                "falta_informacion": [p for p in (periodo_antes, periodo_despues) if p not in filas], "advertencia": ADVERTENCIA_CAUSALIDAD}
