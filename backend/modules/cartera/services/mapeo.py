"""Mapeo de columnas del archivo contra el esquema vigente (alias normalizados + ajuste manual)."""

from core.utils.texto import normalizar_encabezado


def mapear(encabezados, campos, mapeo_manual=None):
    """Devuelve {mapeo: {campo: encabezado}, faltantes: [campo], no_reconocidas: [encabezado]}."""
    mapeo_manual = mapeo_manual or {}
    normal = {normalizar_encabezado(h): h for h in encabezados}
    mapeo = {}
    usados = set()
    for c in campos:
        manual = mapeo_manual.get(c["campo"])
        if manual and manual in encabezados:
            mapeo[c["campo"]] = manual
            usados.add(manual)
            continue
        for candidato in [c["campo"], *c.get("alias", []), c.get("etiqueta", "")]:
            h = normal.get(normalizar_encabezado(candidato))
            if h and h not in usados:
                mapeo[c["campo"]] = h
                usados.add(h)
                break
    faltantes = [c["campo"] for c in campos if c["requerido"] and c["campo"] not in mapeo]
    no_reconocidas = [h for h in encabezados if h not in usados]
    return {"mapeo": mapeo, "faltantes": faltantes, "no_reconocidas": no_reconocidas}
