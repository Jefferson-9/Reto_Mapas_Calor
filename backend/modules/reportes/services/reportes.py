"""Reportes por zona (CU-19): CSV y PDF reales con metadatos, ámbito aplicado en la consulta y bloqueo de reportes vacíos."""

from core.exceptions import DomainError
from core.repositories.base import EventoAuditoria
from core.utils.periodos import es_periodo

TIPOS = {
    "socios": ("Reporte de socios por zona", [("total_socios", "Socios"), ("hogares", "Hogares estimados"), ("penetracion_pct", "Penetración (%)")]),
    "creditos": ("Reporte de créditos por zona", [("total_creditos", "Créditos activos"), ("monto_cartera", "Monto de cartera (USD)")]),
    "pagos_atrasados": ("Reporte de pagos atrasados por zona", [("creditos_atrasados", "Créditos con pagos atrasados"),
                                                               ("saldo_vencido", "Saldo vencido (USD)"), ("tasa_morosidad", "Tasa de morosidad (%)")]),
    "clasificacion": ("Reporte de clasificación de zonas", []),
}
NIVELES = {"provincia": "Provincia", "canton": "Cantón", "parroquia": "Parroquia", "barrio": "Barrio o sector"}


def _fmt(v):
    return "Sin datos" if v is None else v


class ServicioReportes:
    def __init__(self, consultas, clasificacion, territorio, repos, auditoria, reloj, exportadores=None):
        self.consultas = consultas
        self.clasificacion = clasificacion
        self.territorio = territorio
        self.repos = repos
        self.auditoria = auditoria
        self.reloj = reloj
        if exportadores is None:
            from modules.reportes.exportadores import EXPORTADORES

            exportadores = EXPORTADORES
        self.exportadores = exportadores

    def generar(self, tipo, nivel, periodo, formato, padre_id, ambito, actor):
        errores = []
        if tipo not in TIPOS:
            errores.append({"campo": "tipo", "mensaje": "Tipo de reporte no válido."})
        if nivel not in NIVELES:
            errores.append({"campo": "nivel", "mensaje": "Nivel geográfico no válido."})
        if not es_periodo(periodo or ""):
            errores.append({"campo": "periodo", "mensaje": "Período no válido (AAAA-MM)."})
        if formato not in self.exportadores:
            errores.append({"campo": "formato", "mensaje": "Formato no disponible (CSV o PDF)."})
        if errores:
            raise DomainError("VALIDACION", "Revise los filtros del reporte.", errores)
        titulo, cols = TIPOS[tipo]
        if tipo == "clasificacion":
            columnas, filas = self._clasificacion(periodo, ambito)
            nivel = "barrio"
        else:
            columnas, filas = self._indicadores(cols, periodo, nivel, padre_id, ambito)
        if not filas:
            # RF-019.05
            raise DomainError("REPORTE_VACIO", "No existen datos para los filtros seleccionados; no se generó un reporte vacío.", status=404)
        ahora = self.reloj()
        ultima = self.repos["cargas"].ultima_carga_en(periodo)
        padre = self.territorio.jerarquia().por_id.get(padre_id) if padre_id else None
        filtros = f"Tipo: {tipo}; nivel: {NIVELES[nivel]}; período: {periodo}" + (f"; dentro de: {padre['nombre']}" if padre else "")
        ambito_txt = "Toda la cooperativa" if ambito.agencia_id is None and ambito.zonas_asignadas is None else "Ámbito del usuario (agencia o zonas asignadas)"
        reporte = {
            "titulo": f"{titulo} — COAC Padre Julián Lorente",
            "metadatos": [("Fecha de generación", ahora.astimezone().strftime("%Y-%m-%d %H:%M")), ("Filtros aplicados", filtros),
                          ("Ámbito", ambito_txt), ("Última carga de datos", ultima.astimezone().strftime("%Y-%m-%d %H:%M") if ultima else "Sin cargas"),
                          ("Generado por", actor.username)],
            "notas": ["«Sin datos» indica ausencia de información; no equivale a cero.",
                      "Indicadores calculados con definiciones operativas provisionales (pendientes de validación institucional)."],
            "columnas": columnas, "filas": filas,
        }
        contenido = self.exportadores[formato].generar(reporte)
        self.auditoria.registrar(EventoAuditoria(
            categoria="reportes", accion="reporte_generado", entidad_afectada=f"Reporte:{tipo}", detalle=f"Reporte {tipo} ({formato.upper()}) generado",
            usuario_id=actor.id, username=actor.username, valor_nuevo={"tipo": tipo, "nivel": nivel, "periodo": periodo, "formato": formato, "filas": len(filas)},
        ))
        nombre = f"reporte_{tipo}_{nivel}_{periodo}.{self.exportadores[formato].extension}"
        return {"contenido": contenido, "content_type": self.exportadores[formato].content_type, "nombre": nombre}

    def _indicadores(self, cols, periodo, nivel, padre_id, ambito):
        items, cursor = [], None
        while True:
            page = self.consultas.indicadores_por_zona(ambito, periodo, nivel, padre_id, "nombre", False, None, cursor, 100)
            items += page["items"]
            if not page["has_more"]:
                break
            cursor = page["next_cursor"]
        con_datos = [i for i in items if not i["sin_datos"]]
        if not con_datos:
            return [], []
        columnas = ["Código", "Zona"] + [c[1] for c in cols]
        filas = []
        for i in items:
            ind = i["indicadores"] or {}
            vals = [i["zona"]["hogares_estimados"] if k == "hogares" else ind.get(k) for k, _ in cols]
            filas.append([i["zona"]["codigo"], i["zona"]["nombre"], *[_fmt(v) for v in vals]])
        return columnas, filas

    def _clasificacion(self, periodo, ambito):
        data = self.clasificacion.clasificacion(periodo, ambito)
        if not data["version"]:
            raise DomainError("SIN_CRITERIOS_VIGENTES", "No existe una versión de criterios aprobada: no es posible clasificar las zonas.", status=409)
        columnas = ["Orden", "Código", "Zona", "Categoría", "Frecuencia de visita (días)", "Tasa de morosidad (%)", "Penetración (%)"]
        filas = []
        for it in data["items"]:
            ind = it["indicadores"] or {}
            cat = it["categoria"]
            filas.append([it["orden_atencion"], it["zona"]["codigo"], it["zona"]["nombre"], cat["nombre"] if cat else "Sin clasificar",
                          _fmt(cat["frecuencia_visita_dias"] if cat else None), _fmt(ind.get("tasa_morosidad")), _fmt(ind.get("penetracion_pct"))])
        return columnas, filas
