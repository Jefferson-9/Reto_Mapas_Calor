"""Cálculos puros de analítica: rangos de leyenda, agregación por nivel y puntaje de potencial (sección 6.4)."""

from decimal import Decimal

from modules.cartera.services.indicadores import agregar, tendencia

PALETA_SECUENCIAL = ["#fde7b0", "#f8c46a", "#ef9a3a", "#d9631f", "#a8351a"]
VARIABLES_POTENCIAL = ["penetracion_baja", "hogares", "crecimiento", "prospectos", "mora_baja"]
INDICADORES = ["total_socios", "total_creditos", "monto_cartera", "creditos_atrasados", "saldo_vencido", "tasa_morosidad", "penetracion_pct"]


def rangos_leyenda(valores, clases=5, paleta=PALETA_SECUENCIAL):
    """Cortes por cuantiles (únicos y crecientes). La misma lista alimenta la expresión `step` del mapa y la leyenda."""
    vals = sorted(float(v) for v in valores if v is not None)
    if not vals:
        return []
    if vals[0] == vals[-1]:
        return [{"desde": vals[0], "hasta": vals[-1], "color": paleta[len(paleta) // 2]}]
    cortes = []
    for i in range(1, clases):
        q = vals[min(len(vals) - 1, int(round(i * (len(vals) - 1) / clases)))]
        if not cortes or q > cortes[-1]:
            cortes.append(q)
    limites = [vals[0], *[c for c in cortes if vals[0] < c < vals[-1]], vals[-1]]
    paso = len(paleta) / max(1, len(limites) - 1)
    return [{"desde": limites[i], "hasta": limites[i + 1], "color": paleta[min(len(paleta) - 1, int(i * paso))]} for i in range(len(limites) - 1)]


def agregar_por_nivel(jer, hojas, filas_por_zona, nivel, padre_id=None):
    """Zonas del nivel pedido (en ámbito) con indicadores sumando sus hojas en ámbito. Sin hojas con datos → None."""
    hogares = {z: jer.por_id[z]["hogares_estimados"] for z in hojas if z in jer.por_id}
    destino = {}
    for h in hojas:
        cadena = [h, *jer.ancestros(h)]
        objetivo = next((z for z in cadena if jer.por_id[z]["tipo_zona"] == nivel), None)
        if objetivo is None:
            continue
        if padre_id is not None and padre_id not in cadena:
            continue
        destino.setdefault(objetivo, []).append(h)
    out = []
    for zid, hs in destino.items():
        filas = [filas_por_zona[h] for h in hs if h in filas_por_zona]
        out.append({"zona_id": zid, "hojas": hs, "indicadores": agregar(filas, hogares) if filas else None})
    return out


def comparar_valores(serie):
    """serie: lista [(periodo, valor|None)] ordenada. Diferencias y tendencia entre períodos consecutivos (RF-010.02/03/04)."""
    pasos = []
    for (p0, v0), (p1, v1) in zip(serie, serie[1:]):
        dif = None if v0 is None or v1 is None else Decimal(str(v1)) - Decimal(str(v0))
        pasos.append({"desde": p0, "hasta": p1, "diferencia": None if dif is None else str(dif), "tendencia": tendencia(v0, v1),
                      "falta_informacion": v0 is None or v1 is None})
    return pasos


def normalizar(valores):
    """Min-máx a [0, 1] entre las zonas del mismo nivel y ámbito. Valores iguales → 0.5 (sin diferenciación)."""
    presentes = [v for v in valores.values() if v is not None]
    if not presentes:
        return {k: None for k in valores}
    lo, hi = min(presentes), max(presentes)
    return {k: (None if v is None else (0.5 if hi == lo else (v - lo) / (hi - lo))) for k, v in valores.items()}


def puntajes(crudos, pesos, bandas):
    """crudos: {zona: {penetracion, hogares, crecimiento, prospectos, mora}}. Devuelve {zona: {puntaje, banda, variables}}.

    puntaje = Σ(peso × variable) / Σ(pesos de las variables disponibles). No es un modelo predictivo entrenado.
    """
    zonas = list(crudos)
    norm = {
        "penetracion_baja": {z: (None if v is None else 1 - v) for z, v in normalizar({z: crudos[z]["penetracion"] for z in zonas}).items()},
        "hogares": normalizar({z: crudos[z]["hogares"] for z in zonas}),
        "crecimiento": normalizar({z: crudos[z]["crecimiento"] for z in zonas}),
        "prospectos": normalizar({z: crudos[z]["prospectos"] for z in zonas}),
        "mora_baja": {z: (None if v is None else 1 - v) for z, v in normalizar({z: crudos[z]["mora"] for z in zonas}).items()},
    }
    alto, medio = float(bandas["alto"]), float(bandas["medio"])
    out = {}
    for z in zonas:
        num = den = 0.0
        variables = {}
        for var, w in pesos.items():
            w = float(w)
            v = norm[var][z]
            variables[var] = {"normalizado": None if v is None else round(v, 4), "peso": w, "sin_datos": v is None}
            if v is not None and w > 0:
                num += w * v
                den += w
        if den == 0:
            out[z] = {"puntaje": None, "banda": "sin_datos", "variables": variables}
            continue
        s = num / den
        out[z] = {"puntaje": round(s, 4), "banda": "alto" if s >= alto else ("medio" if s >= medio else "bajo"), "variables": variables}
    return out
