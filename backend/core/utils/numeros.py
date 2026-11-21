from decimal import ROUND_HALF_UP, Decimal

DOS = Decimal("0.01")


def redondear(valor, q=DOS):
    if valor is None:
        return None
    return Decimal(valor).quantize(q, rounding=ROUND_HALF_UP)


def razon_pct(numerador, denominador):
    """numerador / denominador × 100 redondeado a 2 decimales; None si el denominador es 0 o nulo."""
    if denominador in (None, 0) or Decimal(denominador) == 0 or numerador is None:
        return None
    return redondear(Decimal(numerador) / Decimal(denominador) * 100)
