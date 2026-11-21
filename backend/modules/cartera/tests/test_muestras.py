"""Los archivos de ejemplo de seed/samples se procesan como documenta su LEEME."""

from pathlib import Path

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

MUESTRAS = Path(__file__).resolve().parents[3] / "seed" / "samples"


def _subir(cli, nombre, tipo):
    archivo = SimpleUploadedFile(nombre, (MUESTRAS / nombre).read_bytes(), content_type="text/csv")
    return cli.post("/api/v1/cargas/", {"archivo": archivo, "tipo": tipo, "periodo": "2026-11"}, format="multipart")


@pytest.mark.django_db
def test_socios_con_errores_se_clasifican(api):
    d = _subir(api("admin"), "socios_con_errores.csv", "socios").json()["data"]
    assert d["faltantes"] == []  # alias y separador «;» reconocidos
    assert (d["resumen"]["validos"], d["observados"], d["rechazados"]) == (1, 6, 1)


@pytest.mark.django_db
def test_columna_faltante_requiere_mapeo(api):
    d = _subir(api("admin"), "socios_columna_faltante.csv", "socios").json()["data"]
    assert d["faltantes"] == ["codigo_socio"] and "id_cliente" in d["columnas_archivo"]
