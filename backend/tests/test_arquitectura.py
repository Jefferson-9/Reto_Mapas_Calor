"""Comprobaciones automáticas de las reglas de capas y dependencias (sección 4)."""

import ast
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MODULOS = RAIZ / "modules"
PROHIBIDOS_EN_SERVICIOS = ("django.db", "rest_framework", "django.http", "django.contrib.gis.db")

# Dependencias permitidas entre módulos (sección 4.2); auditoria es transversal y no se importa directamente.
PERMITIDAS = {
    "usuarios": set(),
    "territorio": set(),
    "auditoria": set(),
    "cartera": {"territorio"},
    "clasificacion": {"cartera", "territorio"},
    "campo": {"territorio", "clasificacion", "cartera"},
    "analitica": {"territorio", "cartera", "clasificacion", "campo"},
    "reportes": {"territorio", "cartera", "clasificacion", "campo", "analitica"},
}


def _imports(path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for nodo in ast.walk(tree):
        if isinstance(nodo, ast.Import):
            for a in nodo.names:
                yield a.name
        elif isinstance(nodo, ast.ImportFrom) and nodo.module:
            yield nodo.module


def test_servicios_no_importan_orm_http_ni_modelos():
    violaciones = []
    for archivo in MODULOS.glob("*/services/*.py"):
        for imp in _imports(archivo):
            if imp.startswith(PROHIBIDOS_EN_SERVICIOS) or imp.endswith(".models") or ".models." in imp:
                violaciones.append(f"{archivo.relative_to(RAIZ)} importa {imp}")
    for archivo in (RAIZ / "core").glob("*.py"):
        if archivo.name in ("parametros.py",):
            for imp in _imports(archivo):
                if imp.startswith(PROHIBIDOS_EN_SERVICIOS) or imp.endswith(".models"):
                    violaciones.append(f"{archivo.relative_to(RAIZ)} importa {imp}")
    assert not violaciones, "\n".join(violaciones)


def test_dependencias_entre_modulos_sin_ciclos():
    violaciones = []
    for modulo, permitidas in PERMITIDAS.items():
        for archivo in (MODULOS / modulo).rglob("*.py"):
            if "tests" in archivo.parts or "migrations" in archivo.parts:
                continue
            for imp in _imports(archivo):
                if imp.startswith("modules."):
                    destino = imp.split(".")[1]
                    if destino != modulo and destino not in permitidas:
                        violaciones.append(f"{archivo.relative_to(RAIZ)} → {imp}")
    assert not violaciones, "\n".join(violaciones)


def test_core_no_depende_de_modulos():
    violaciones = []
    for archivo in (RAIZ / "core").rglob("*.py"):
        if "management" in archivo.parts or "tests" in archivo.parts or archivo.name == "views.py":
            continue
        for imp in _imports(archivo):
            if imp.startswith("modules."):
                violaciones.append(f"{archivo.relative_to(RAIZ)} → {imp}")
    assert not violaciones, "\n".join(violaciones)
