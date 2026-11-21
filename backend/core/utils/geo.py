"""Conversión centralizada entre latitud/longitud (formularios, CSV) y GeoJSON [lng, lat]."""

from decimal import Decimal, InvalidOperation

ECUADOR_BBOX = {"lat_min": -5.1, "lat_max": 1.5, "lng_min": -81.1, "lng_max": -75.1}


def latlng_a_geojson(lat, lng):
    return {"type": "Point", "coordinates": [float(lng), float(lat)]}


def geojson_a_latlng(geom):
    if not isinstance(geom, dict) or geom.get("type") != "Point":
        raise ValueError("Se esperaba una geometría GeoJSON de tipo Point")
    coords = geom.get("coordinates") or []
    if len(coords) < 2:
        raise ValueError("Coordenadas incompletas")
    lng, lat = coords[0], coords[1]
    return float(lat), float(lng)


def contar_decimales(texto):
    s = str(texto).strip()
    if "." not in s:
        return 0
    return len(s.split(".", 1)[1].rstrip())


def parsear_coordenada(valor):
    try:
        d = Decimal(str(valor).strip().replace(",", "."))
    except (InvalidOperation, AttributeError):
        return None
    if not d.is_finite():
        return None
    return d


def validar_coordenadas(lat_txt, lng_txt, decimales_minimos=4):
    """Devuelve (lat, lng, motivos). Si hay motivos, la ubicación no es válida (RF-004.03)."""
    motivos = []
    if lat_txt in (None, "") or lng_txt in (None, ""):
        return None, None, ["Sin coordenadas"]
    lat, lng = parsear_coordenada(lat_txt), parsear_coordenada(lng_txt)
    if lat is None or lng is None:
        return None, None, ["Coordenadas no numéricas"]
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return None, None, ["Coordenadas fuera de rango"]
    if not (ECUADOR_BBOX["lat_min"] <= lat <= ECUADOR_BBOX["lat_max"] and ECUADOR_BBOX["lng_min"] <= lng <= ECUADOR_BBOX["lng_max"]):
        motivos.append("Ubicación fuera de Ecuador")
    if min(contar_decimales(lat_txt), contar_decimales(lng_txt)) < decimales_minimos:
        motivos.append(f"Precisión insuficiente (mínimo {decimales_minimos} decimales)")
    return float(lat), float(lng), motivos


def validar_bbox(texto, max_grados=2.0):
    """bbox 'minLng,minLat,maxLng,maxLat' validado; limita el área para no devolver todo."""
    try:
        parts = [float(x) for x in str(texto).split(",")]
    except ValueError:
        return None
    if len(parts) != 4:
        return None
    min_lng, min_lat, max_lng, max_lat = parts
    if not (-180 <= min_lng < max_lng <= 180 and -90 <= min_lat < max_lat <= 90):
        return None
    if (max_lng - min_lng) > max_grados or (max_lat - min_lat) > max_grados:
        return None
    return min_lng, min_lat, max_lng, max_lat
