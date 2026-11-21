"""Criterios de clasificación (CU-11) y consulta de clasificación y prioridad de zonas (CU-12)."""

from core.exceptions import DomainError, NoEncontrado
from core.repositories.base import EventoAuditoria
from modules.clasificacion.services.reglas import evaluar, validar_version


def _orden(item):
    """Atención requerida: prioridad de categoría; dentro de ella, mayor morosidad y menor penetración primero."""
    ind = item.get("indicadores") or {}
    mora = float(ind["tasa_morosidad"]) if ind.get("tasa_morosidad") is not None else -1
    pen = float(ind["penetracion_pct"]) if ind.get("penetracion_pct") is not None else 1e9
    return (item["nivel_prioridad"] if item["nivel_prioridad"] is not None else 10**6, -mora, pen, item["zona"]["nombre"])


class ServicioClasificacion:
    def __init__(self, repo, indicadores_repo, territorio, auditoria, uow, reloj):
        self.repo = repo
        self.indicadores = indicadores_repo
        self.territorio = territorio
        self.auditoria = auditoria
        self.uow = uow
        self.reloj = reloj

    def _auditar(self, actor, accion, detalle, version, nuevo=None, anterior=None):
        self.auditoria.registrar(EventoAuditoria(
            categoria="criterios", accion=accion, entidad_afectada=f"VersionCriterio#{version['id']}", detalle=detalle,
            usuario_id=actor.id, username=actor.username, valor_anterior=anterior, valor_nuevo=nuevo,
        ))

    def versiones(self):
        return self.repo.versiones()

    def vigente(self):
        return self.repo.vigente()

    def validar(self, categorias):
        errores, advertencias = validar_version([dict(c, reglas=[dict(r) for r in c.get("reglas", [])]) for c in categorias])
        return {"valida": not errores, "errores": errores, "advertencias": advertencias}

    def crear_version(self, nota, categorias, actor):
        """RF-011.01/02: se guarda como pendiente de aprobación solo si pasa la validación de consistencia."""
        cats = [dict(c, reglas=[dict(r) for r in c.get("reglas", [])]) for c in categorias]
        errores, advertencias = validar_version(cats)
        if errores:
            raise DomainError("CRITERIOS_INCONSISTENTES", "La versión tiene errores que deben corregirse antes de guardarla.", errores)
        with self.uow.atomic():
            v = self.repo.crear_version(nota or "", cats, actor.id)
            self._auditar(actor, "criterios_definidos", f"Versión {v['version']} de criterios definida (pendiente de aprobación)", v,
                          {"categorias": v["categorias"], "nota": v["nota"]})
        return {**v, "advertencias": advertencias}

    def aprobar(self, version_id, actor):
        """RF-011.03/04/05: única versión vigente, recálculo de la clasificación y conservación de las anteriores."""
        with self.uow.atomic():
            v = self.repo.version(version_id, bloquear=True)
            if not v:
                raise NoEncontrado()
            if v["estado"] != "pendiente":
                raise DomainError("ESTADO_INVALIDO", "Solo se pueden aprobar versiones pendientes.")
            anterior = self.repo.vigente()
            if anterior:
                self.repo.cambiar_estado(anterior["id"], "anterior")
            self.repo.cambiar_estado(version_id, "vigente", aprobado_por_id=actor.id, aprobado_en=self.reloj())
            periodos = self.indicadores.periodos()
            self._recalcular(self.repo.version(version_id), periodos)
            self._auditar(actor, "criterios_aprobados", f"Versión {v['version']} aprobada y vigente; clasificación recalculada en {len(periodos)} períodos",
                          v, {"estado": "vigente"}, {"vigente_anterior": anterior["version"] if anterior else None})
        return self.repo.version(version_id)

    def rechazar(self, version_id, motivo, actor):
        if not (motivo or "").strip():
            raise DomainError("VALIDACION", "Indique el motivo del rechazo.", [{"campo": "motivo", "mensaje": "Obligatorio."}])
        with self.uow.atomic():
            v = self.repo.version(version_id, bloquear=True)
            if not v:
                raise NoEncontrado()
            if v["estado"] != "pendiente":
                raise DomainError("ESTADO_INVALIDO", "Solo se pueden rechazar versiones pendientes.")
            self.repo.cambiar_estado(version_id, "rechazada", motivo_rechazo=motivo.strip()[:300])
            self._auditar(actor, "criterios_rechazados", f"Versión {v['version']} rechazada", v, {"motivo": motivo.strip()[:300]})
        return self.repo.version(version_id)

    def recalcular_periodos(self, periodos):
        v = self.repo.vigente()
        if v:
            self._recalcular(v, periodos)

    def _recalcular(self, version, periodos):
        cats = version["categorias"]
        for periodo in periodos:
            filas = []
            for ind in self.indicadores.leer([periodo], None):
                cat, explicacion = evaluar(ind, cats)
                explicacion["indicadores"] = {k: (None if ind[k] is None else str(ind[k])) for k in
                                              ("total_socios", "total_creditos", "monto_cartera", "creditos_atrasados", "saldo_vencido", "tasa_morosidad", "penetracion_pct")}
                filas.append({"zona_id": ind["zona_id"], "categoria_id": cat["id"] if cat else None,
                              "nivel_prioridad": cat["prioridad"] if cat else None, "motivo_explicacion": explicacion})
            self.repo.reemplazar_prioridades(version["id"], periodo, filas)

    def clasificacion(self, periodo, ambito, categoria_id=None, tipo_zona=None):
        """RF-012.01/03/04/05 — zonas del ámbito con su categoría, ordenadas por atención requerida."""
        v = self.repo.vigente()
        if not v:
            return {"version": None, "mensaje": "No existe una versión de criterios aprobada: no es posible clasificar las zonas.", "items": []}
        jer = self.territorio.jerarquia()
        hojas = self.territorio.hojas_en_ambito(ambito, jer)
        cats = {c["id"]: c for c in v["categorias"]}
        items = []
        for p in self.repo.prioridades(v["id"], periodo, hojas):
            if categoria_id is not None and p["categoria_id"] != categoria_id:
                continue
            z = jer.por_id.get(p["zona_id"])
            if not z:
                continue
            cat = cats.get(p["categoria_id"])
            items.append({
                "zona": {"id": z["id"], "codigo": z["codigo"], "nombre": z["nombre"], "tipo_zona": z["tipo_zona"],
                         "ruta": " › ".join(x["nombre"] for x in jer.ruta(z["id"])[1:-1])},
                "categoria": {"id": cat["id"], "nombre": cat["nombre"], "color_hex": cat["color_hex"], "prioridad": cat["prioridad"],
                              "frecuencia_visita_dias": cat["frecuencia_visita_dias"]} if cat else None,
                "nivel_prioridad": p["nivel_prioridad"],
                "indicadores": p["motivo_explicacion"].get("indicadores"),
            })
        items.sort(key=_orden)
        for i, it in enumerate(items, 1):
            it["orden_atencion"] = i
        sin_clasificar = sum(1 for i in items if i["categoria"] is None)
        return {"version": {"id": v["id"], "version": v["version"], "aprobado_en": v["aprobado_en"], "aprobado_por": v["aprobado_por"]},
                "categorias": v["categorias"], "periodo": periodo, "items": items, "sin_clasificar": sin_clasificar}

    def explicacion(self, zona_id, periodo, ambito):
        """RF-012.02 / RF-015.03 — indicadores y reglas que explican la categoría de la zona."""
        v = self.repo.vigente()
        if not v:
            raise DomainError("SIN_CRITERIOS_VIGENTES", "No existe una versión de criterios aprobada.", status=409)
        if zona_id not in self.territorio.hojas_en_ambito(ambito):
            raise NoEncontrado()
        filas = self.repo.prioridades(v["id"], periodo, [zona_id])
        if not filas:
            return {"zona_id": zona_id, "periodo": periodo, "sin_datos": True, "mensaje": "Sin datos para el período seleccionado."}
        p = filas[0]
        cat = next((c for c in v["categorias"] if c["id"] == p["categoria_id"]), None)
        return {"zona_id": zona_id, "periodo": periodo, "sin_datos": False, "version": v["version"], "categoria": cat,
                "explicacion": p["motivo_explicacion"], "calculado_en": p["calculado_en"]}

    def categorias_de(self, periodo, zona_ids):
        """Mapa zona → categoría vigente (para mapas, rutas y reportes)."""
        v = self.repo.vigente()
        if not v:
            return {}
        cats = {c["id"]: c for c in v["categorias"]}
        return {p["zona_id"]: cats.get(p["categoria_id"]) for p in self.repo.prioridades(v["id"], periodo, zona_ids)}
