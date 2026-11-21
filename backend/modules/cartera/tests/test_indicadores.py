from decimal import Decimal

import pytest

from modules.cartera.models import IndicadorZonaPeriodo
from modules.cartera.services.indicadores import agregar, calcular_razones, tendencia
from modules.cartera.services.mapeo import mapear
from modules.cartera.services.validacion import validar_pago


def test_agregar_suma_componentes_y_recalcula_razones():
    filas = [
        {"zona_id": 1, "total_socios": 10, "total_creditos": 5, "monto_cartera": Decimal("1000"), "creditos_atrasados": 1, "saldo_vencido": Decimal("100")},
        {"zona_id": 2, "total_socios": 30, "total_creditos": 5, "monto_cartera": Decimal("9000"), "creditos_atrasados": 0, "saldo_vencido": Decimal("0")},
    ]
    t = agregar(filas, {1: 100, 2: 100})
    # 100/10000 = 1 %, no el promedio de 10 % y 0 % (5 %)
    assert t["tasa_morosidad"] == Decimal("1.00")
    assert t["penetracion_pct"] == Decimal("20.00")
    assert agregar(filas, {1: 100, 2: None})["penetracion_pct"] is None  # sin hogares → «Sin datos»


def test_razones_con_denominador_cero_son_nulas():
    r = calcular_razones({"saldo_vencido": Decimal(0), "monto_cartera": Decimal(0), "total_socios": 3}, None)
    assert r == {"tasa_morosidad": None, "penetracion_pct": None}


def test_tendencia():
    assert tendencia(1, 2) == "aumento" and tendencia(2, 1) == "disminuyo" and tendencia(2, 2) == "se_mantuvo"
    assert tendencia(None, 2) is None


def test_mapeo_por_alias_normalizados():
    campos = [{"campo": "cedula", "etiqueta": "Cédula", "requerido": True, "alias": ["identificacion"]},
              {"campo": "nombre", "etiqueta": "Nombre", "requerido": True, "alias": []}]
    m = mapear(["Identificación", "NOMBRE ", "extra"], campos)
    assert m["mapeo"] == {"cedula": "Identificación", "nombre": "NOMBRE "} and m["faltantes"] == [] and m["no_reconocidas"] == ["extra"]


def test_validar_pago_periodo_distinto_y_valores():
    ctx = {"creditos_db": {"K1": {}}, "periodo": "2026-10", "vistos": set()}
    campos = [{"campo": c, "etiqueta": c, "requerido": True, "tipo_dato": "texto"} for c in ("codigo_credito", "periodo", "valor_pagado", "valor_pendiente", "dias_atraso")]
    r = validar_pago({"codigo_credito": "K1", "periodo": "2026-09", "valor_pagado": "10", "valor_pendiente": "0", "dias_atraso": "0"}, campos, ctx).cerrar()
    assert r.clasificacion == "observado"
    r = validar_pago({"codigo_credito": "K1", "periodo": "2026-10", "valor_pagado": "-1", "valor_pendiente": "0", "dias_atraso": "x"}, campos, ctx).cerrar()
    assert r.clasificacion == "rechazado" and len(r.rechazos) == 2


@pytest.mark.django_db
def test_indicadores_precalculados_por_zona(datos):
    b1 = IndicadorZonaPeriodo.objects.get(zona=datos["zonas"]["B1"], periodo="2026-10")
    assert (b1.total_socios, b1.total_creditos, b1.creditos_atrasados) == (4, 4, 1)
    assert b1.saldo_vencido == Decimal("250.00") and b1.tasa_morosidad == Decimal("6.25") and b1.penetracion_pct == Decimal("4.00")
    b3 = IndicadorZonaPeriodo.objects.get(zona=datos["zonas"]["B3"], periodo="2026-10")
    assert b3.penetracion_pct is None  # sin hogares estimados
    assert IndicadorZonaPeriodo.objects.get(zona=datos["zonas"]["B1"], periodo="2026-09").creditos_atrasados == 0
