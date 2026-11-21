import pytest

from modules.auditoria.models import HistorialCambios
from modules.clasificacion.models import PrioridadZona, VersionCriterio
from modules.clasificacion.services.reglas import evaluar, validar_version

CATS = [
    {"nombre": "Seguimiento", "color_hex": "#C8341C", "prioridad": 1, "frecuencia_visita_dias": 7, "reglas": [{"variable": "tasa_morosidad", "operador": ">=", "umbral": 10}]},
    {"nombre": "Oportunidad", "color_hex": "#E8920C", "prioridad": 2, "reglas": [{"variable": "penetracion_pct", "operador": "<", "umbral": 3}]},
    {"nombre": "Consolidada", "color_hex": "#2E9E6B", "prioridad": 3, "reglas": [{"variable": "penetracion_pct", "operador": "entre", "umbral": [3, 100]}]},
]


def test_validacion_detecta_inconsistencias():
    malas = [
        {"nombre": "Sin reglas", "color_hex": "#000000", "prioridad": 1, "reglas": []},
        {"nombre": "Contradictoria", "color_hex": "#000000", "prioridad": 1,
         "reglas": [{"variable": "tasa_morosidad", "operador": ">", "umbral": 10}, {"variable": "tasa_morosidad", "operador": "<", "umbral": 5}]},
        {"nombre": "Entre", "color_hex": "#zzzzzz", "prioridad": 3, "reglas": [{"variable": "x", "operador": "entre", "umbral": [9, 1]}]},
    ]
    errores, _ = validar_version(malas)
    textos = " ".join(e["mensaje"] for e in errores)
    assert "no tiene reglas" in textos and "se contradicen" in textos and "repetida" in textos
    assert "Color no válido" in textos and "Variable no permitida" in textos


def test_solapamiento_es_advertencia_no_error():
    cats = [dict(c, reglas=[dict(r) for r in c["reglas"]]) for c in CATS]
    cats[1]["reglas"] = [{"variable": "penetracion_pct", "operador": "<", "umbral": 50}]
    errores, adv = validar_version(cats)
    assert not errores and adv


def test_evaluacion_primera_que_cumple_y_sin_datos():
    cats = [dict(c, id=i, reglas=[dict(r) for r in c["reglas"]]) for i, c in enumerate(CATS)]
    validar_version(cats)
    cat, exp = evaluar({"tasa_morosidad": 12, "penetracion_pct": 1}, cats)
    assert cat["nombre"] == "Seguimiento" and exp["evaluadas"][0]["cumple"]
    cat, exp = evaluar({"tasa_morosidad": None, "penetracion_pct": None}, cats)
    assert cat is None and exp["evaluadas"][0]["reglas"][0]["sin_datos"]


@pytest.mark.django_db
class TestFlujoCriterios:
    def test_sin_version_aprobada_informa(self, api, datos):
        d = api("jefe").get("/api/v1/clasificacion/?periodo=2026-10").json()["data"]
        assert d["version"] is None and "no es posible clasificar" in d["mensaje"]

    def test_definir_aprobar_unica_vigente_y_recalcular(self, api, datos):
        met = api("metodologia")
        assert api("oficial").post("/api/v1/criterios/", {"categorias": CATS}, format="json").status_code == 403
        r = met.post("/api/v1/criterios/", {"nota": "v1", "categorias": CATS}, format="json")
        assert r.status_code == 201 and r.json()["data"]["estado"] == "pendiente"
        v1 = r.json()["data"]["id"]
        assert met.post(f"/api/v1/criterios/{v1}/aprobar/").status_code == 200
        v2 = met.post("/api/v1/criterios/", {"nota": "v2", "categorias": CATS[:2] + [dict(CATS[2], prioridad=4)]}, format="json").json()["data"]["id"]
        met.post(f"/api/v1/criterios/{v2}/aprobar/")
        estados = dict(VersionCriterio.objects.values_list("id", "estado"))
        assert estados[v1] == "anterior" and estados[v2] == "vigente"
        assert PrioridadZona.objects.filter(version_criterio_id=v1).exists() and PrioridadZona.objects.filter(version_criterio_id=v2).exists()
        assert HistorialCambios.objects.filter(accion="criterios_aprobados").count() == 2
        d = api("jefe").get("/api/v1/clasificacion/?periodo=2026-10").json()["data"]
        # ámbito MATRIZ; B2 (penetración 1 % → Oportunidad, prioridad 2) antes que B1 (Consolidada)
        assert [i["zona"]["codigo"] for i in d["items"]] == ["B2", "B1"]
        assert d["items"][1]["categoria"]["nombre"] == "Consolidada"
        assert d["items"][0]["orden_atencion"] == 1
        exp = api("jefe").get(f"/api/v1/clasificacion/zonas/{datos['zonas']['B1'].id}/?periodo=2026-10").json()["data"]
        assert exp["explicacion"]["evaluadas"] and exp["explicacion"]["indicadores"]["tasa_morosidad"] == "6.25"

    def test_version_inconsistente_no_se_guarda(self, api, datos):
        r = api("metodologia").post("/api/v1/criterios/", {"categorias": [dict(CATS[0], reglas=[])]}, format="json")
        assert r.status_code == 400 and r.json()["error"]["code"] == "CRITERIOS_INCONSISTENTES"
        assert not VersionCriterio.objects.exists()
