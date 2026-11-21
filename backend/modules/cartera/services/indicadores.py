"""Indicadores por zona y período (sección 6.1).

Las funciones `calcular_*` y `agregar` son puras; el servicio orquesta el recálculo selectivo.
"""

from decimal import Decimal

from core.utils.numeros import razon_pct, redondear

SUMABLES = ["total_socios", "total_creditos", "monto_cartera", "creditos_atrasados", "saldo_vencido"]


def calcular_razones(comp, hogares):
    """tasa_morosidad = saldo_vencido / monto_cartera × 100; penetracion = socios / hogares × 100 (None = «Sin datos»)."""
    return {
        "tasa_morosidad": razon_pct(comp["saldo_vencido"], comp["monto_cartera"]),
        "penetracion_pct": razon_pct(comp["total_socios"], hogares) if hogares else None,
    }


def agregar(filas, hogares_por_zona):
    """Suma componentes de varias zonas hoja y RECALCULA las razones (nunca promedia razones).

    Si alguna zona incluida no tiene hogares estimados, la penetración agregada es None.
    """
    if not filas:
        return None
    total = {k: (Decimal(0) if k in ("monto_cartera", "saldo_vencido") else 0) for k in SUMABLES}
    hogares, hogares_completos = 0, True
    for f in filas:
        for k in SUMABLES:
            total[k] += f[k] if not isinstance(total[k], Decimal) else Decimal(f[k])
        h = hogares_por_zona.get(f["zona_id"])
        if h is None:
            hogares_completos = False
        else:
            hogares += h
    total["monto_cartera"] = redondear(total["monto_cartera"])
    total["saldo_vencido"] = redondear(total["saldo_vencido"])
    total.update(calcular_razones(total, hogares if hogares_completos and hogares > 0 else None))
    return total


def tendencia(anterior, actual, tolerancia=Decimal("0")):
    """aumentó / disminuyó / se mantuvo; None si falta alguno de los dos valores (RF-010.04)."""
    if anterior is None or actual is None:
        return None
    dif = Decimal(str(actual)) - Decimal(str(anterior))
    if abs(dif) <= tolerancia:
        return "se_mantuvo"
    return "aumento" if dif > 0 else "disminuyo"


class ServicioIndicadores:
    def __init__(self, repo, territorio_repo, cargas_repo, parametros, reloj):
        self.repo = repo
        self.territorio = territorio_repo
        self.cargas = cargas_repo
        self.parametros = parametros
        self.reloj = reloj

    def periodos(self):
        return self.repo.periodos()

    def recalcular(self, periodos, zona_ids=None):
        """Recalcula solo los períodos y zonas afectados. Devuelve los períodos recalculados."""
        periodos = sorted({p for p in periodos if p})
        if not periodos:
            return []
        zonas = {z["id"]: z for z in self.territorio.arbol(incluir_no_vigentes=True)}
        ids = sorted({z for z in (zona_ids if zona_ids is not None else zonas) if z})
        if zona_ids is None:
            ids = sorted(set(ids) | set(self.repo.zonas_con_datos()))
        dias_min = self.parametros.valor("dias_atraso_minimo")
        ultimas = {p: self.cargas.ultima_carga_en(p) for p in periodos}
        filas = []
        for comp in self.repo.componentes(periodos, ids, dias_min):
            hog = zonas.get(comp["zona_id"], {}).get("hogares_estimados")
            filas.append({
                **comp,
                "monto_cartera": redondear(comp["monto_cartera"]),
                "saldo_vencido": redondear(comp["saldo_vencido"]),
                **calcular_razones(comp, hog),
                "ultima_carga_at": ultimas[comp["periodo"]],
            })
        self.repo.reemplazar(periodos, ids, filas)
        return periodos
