from decimal import Decimal

import pytest

from core.exceptions import DomainError
from core.pagination import decode_cursor, encode_cursor
from core.security.privacy import cedula_hash, cedula_mascara
from core.utils.geo import geojson_a_latlng, latlng_a_geojson, validar_bbox, validar_coordenadas
from core.utils.numeros import razon_pct, redondear
from core.utils.periodos import fin_de_periodo, periodo_anterior, sumar_meses
from core.utils.texto import nombre_archivo_seguro, normalizar_encabezado


def test_conversion_latlng_geojson_ida_y_vuelta():
    g = latlng_a_geojson(-3.9968, -79.2018)
    assert g == {"type": "Point", "coordinates": [-79.2018, -3.9968]}  # GeoJSON usa [lng, lat]
    assert geojson_a_latlng(g) == (-3.9968, -79.2018)
    with pytest.raises(ValueError):
        geojson_a_latlng({"type": "Polygon", "coordinates": []})


@pytest.mark.parametrize("lat,lng,ok", [
    ("-3.996800", "-79.201800", True), ("", "", False), ("abc", "-79.2", False), ("-95", "-79.2", False),
    ("-3.99", "-79.20", False), ("40.4168", "-3.7038", False),
])
def test_validar_coordenadas(lat, lng, ok):
    la, lo, motivos = validar_coordenadas(lat, lng, 4)
    assert (la is not None and not motivos) == ok


def test_bbox_valida_y_limita_area():
    assert validar_bbox("-79.25,-4.05,-79.15,-3.95") == (-79.25, -4.05, -79.15, -3.95)
    assert validar_bbox("-80,-5,-75,0", 2.0) is None
    assert validar_bbox("1,2,3") is None and validar_bbox("x,y,z,w") is None


def test_periodos():
    assert sumar_meses("2026-11", 2) == "2027-01"
    assert periodo_anterior("2026-01") == "2025-12"
    assert str(fin_de_periodo("2026-02")) == "2026-02-28"


def test_razon_y_redondeo_mitad_hacia_arriba():
    assert razon_pct(1, 0) is None and razon_pct(None, 10) is None
    assert razon_pct(1, 8) == Decimal("12.50")
    assert redondear(Decimal("2.345")) == Decimal("2.35")


def test_cedula_hash_y_mascara():
    assert cedula_hash("110-458-7236") == cedula_hash("1104587236") != ""
    assert cedula_mascara("1104587236") == "******7236"


def test_normalizacion_de_encabezados_y_nombres_seguros():
    assert normalizar_encabezado("  Cédula de Identidad ") == "cedula_de_identidad"
    assert nombre_archivo_seguro("../../etc/passwd") == "passwd"
    assert nombre_archivo_seguro("..oculto.csv") == "oculto.csv"


def test_cursor_ida_y_vuelta_y_cursor_invalido():
    c = encode_cursor(["2026-10-01T00:00:00", 15])
    assert decode_cursor(c, 2) == ["2026-10-01T00:00:00", 15]
    with pytest.raises(DomainError):
        decode_cursor("no-es-cursor", 2)
