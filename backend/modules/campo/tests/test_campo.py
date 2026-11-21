import uuid

import pytest

from core.models import ParametroSistema
from modules.campo.models import AsignacionZonaOficial, PosibleSocio, Visita


@pytest.fixture
def asignado(datos):
    u, z = datos["usuarios"], datos["zonas"]
    AsignacionZonaOficial.objects.create(oficial=u["oficial"], zona=z["B1"], asignado_por=u["jefe"])
    return datos


@pytest.mark.django_db
class TestAsignaciones:
    def test_jefe_asigna_en_su_ambito_y_no_fuera(self, api, datos):
        z, u = datos["zonas"], datos["usuarios"]
        r = api("jefe").post("/api/v1/asignaciones/", {"oficial_id": u["oficial"].id, "zona_ids": [z["B1"].id, z["B2"].id]}, format="json")
        assert r.status_code == 201 and len(r.json()["data"]["items"]) == 2
        r = api("jefe").post("/api/v1/asignaciones/", {"oficial_id": u["oficial"].id, "zona_ids": [z["B3"].id]}, format="json")
        assert r.status_code == 400 and r.json()["error"]["code"] == "ZONA_FUERA_DE_AMBITO"
        r = api("jefe").post("/api/v1/asignaciones/", {"oficial_id": u["oficialsur"].id, "zona_ids": [z["B1"].id]}, format="json")
        assert r.status_code == 403
        asig = AsignacionZonaOficial.objects.filter(activa=True).first()
        assert api("jefesur").delete(f"/api/v1/asignaciones/{asig.id}/").status_code == 404
        assert api("jefe").delete(f"/api/v1/asignaciones/{asig.id}/").status_code == 200
        assert api("oficial").post("/api/v1/asignaciones/", {"oficial_id": 1, "zona_ids": [1]}, format="json").status_code == 403

    def test_mis_zonas_solo_asignadas(self, api, asignado):
        d = api("oficial").get("/api/v1/mis-zonas/?periodo=2026-10").json()["data"]
        assert [i["zona"]["codigo"] for i in d["items"]] == ["B1"] and d["items"][0]["indicadores"]["tasa_morosidad"] == "6.25"


@pytest.mark.django_db
class TestProspectos:
    def test_registra_con_validacion_de_zona_y_es_idempotente(self, api, asignado):
        cli = api("oficial")
        cu = str(uuid.uuid4())
        datos = {"nombre_negocio": "Tienda", "latitud": "-3.990500", "longitud": "-79.210500", "client_uuid": cu}
        r1 = cli.post("/api/v1/prospectos/", datos, format="json")
        r2 = cli.post("/api/v1/prospectos/", datos, format="json")
        assert r1.status_code == 201 and r2.status_code == 200 and r1.json()["data"]["id"] == r2.json()["data"]["id"]
        assert PosibleSocio.objects.count() == 1
        r3 = cli.post("/api/v1/prospectos/", {"nombre_negocio": "X", "latitud": "-3.990600", "longitud": "-79.210600"}, format="json",
                      HTTP_IDEMPOTENCY_KEY=cu)
        assert r3.status_code == 200 and PosibleSocio.objects.count() == 1

    @pytest.mark.parametrize("lat,lng,codigo", [("-3.99", "-79.21", "VALIDACION"), ("-3.700000", "-79.700000", "FUERA_DE_ZONA"),
                                                ("-4.030000", "-79.200000", "FUERA_DE_AMBITO")])
    def test_rechaza_ubicaciones_imprecisas_fuera_de_zona_o_ambito(self, api, asignado, lat, lng, codigo):
        r = api("oficial").post("/api/v1/prospectos/", {"nombre_negocio": "N", "latitud": lat, "longitud": lng}, format="json")
        assert r.status_code == 400 and r.json()["error"]["code"] == codigo

    def test_roles_sin_autorizacion_no_registran(self, api, asignado):
        for rol in ("gerencia", "supervisor", "metodologia", "admin"):
            assert api(rol).post("/api/v1/prospectos/", {"nombre_negocio": "N"}, format="json").status_code == 403


@pytest.mark.django_db
class TestRutasYVisitas:
    def test_ruta_solo_con_zonas_asignadas_y_orden_sugerido(self, api, asignado):
        cli, z = api("oficial"), asignado["zonas"]
        r = cli.post("/api/v1/rutas/", {"nombre": "R", "fecha_prevista": "2026-11-25", "zona_ids": [z["B2"].id]}, format="json")
        assert r.status_code == 400 and r.json()["error"]["code"] == "ZONA_NO_ASIGNADA"
        r = cli.post("/api/v1/rutas/", {"nombre": "R", "fecha_prevista": "2026-11-25", "zona_ids": [z["B1"].id], "orden_sugerido": True}, format="json")
        assert r.status_code == 201 and r.json()["data"]["detalles"][0]["orden"] == 1
        ruta = cli.get(f"/api/v1/rutas/{r.json()['data']['id']}/").json()["data"]
        assert ruta["detalles"][0]["geometria"]["type"] in ("Polygon", "MultiPolygon")
        assert api("jefesur").get(f"/api/v1/rutas/{ruta['id']}/").status_code == 404

    def test_visitas_bloqueadas_si_no_estan_habilitadas(self, api, asignado):
        r = api("oficial").post("/api/v1/visitas/", {"zona_id": asignado["zonas"]["B1"].id}, format="json")
        assert r.status_code == 403 and r.json()["error"]["code"] == "VISITAS_DESHABILITADAS"
        assert api("supervisor").get("/api/v1/seguimiento/?desde=2026-11-01&hasta=2026-11-30").status_code == 403

    def test_visitas_habilitadas_validacion_seguimiento_y_advertencia(self, api, asignado):
        ParametroSistema.objects.update(habilitar_registro_visitas=True)
        cli, z = api("oficial"), asignado["zonas"]
        ruta = cli.post("/api/v1/rutas/", {"nombre": "R", "fecha_prevista": "2026-11-10", "zona_ids": [z["B1"].id]}, format="json").json()["data"]
        r = cli.post("/api/v1/visitas/", {"zona_id": z["B1"].id, "realizada": True}, format="json")
        assert r.status_code == 400 and {"fecha_visita", "resultado"} <= {d["campo"] for d in r.json()["error"]["details"]}
        r = cli.post("/api/v1/visitas/", {"zona_id": z["B1"].id, "realizada": False, "fecha_visita": "2026-11-10"}, format="json")
        assert r.status_code == 400 and r.json()["error"]["details"][0]["campo"] == "motivo_no_realizada"
        r = cli.post("/api/v1/visitas/", {"zona_id": z["B1"].id, "ruta_id": ruta["id"], "fecha_visita": "2026-11-10", "resultado": "interes"}, format="json")
        assert r.status_code == 201 and Visita.objects.get().ruta_id == ruta["id"]
        s = api("supervisor").get("/api/v1/seguimiento/?desde=2026-11-01&hasta=2026-11-30").json()["data"]
        assert s["previstas"] == 1 and s["realizadas"] == 1 and s["porcentaje"] == 100.0
        ad = api("supervisor").get(f"/api/v1/seguimiento/zonas/{z['B1'].id}/antes-despues/?antes=2026-09&despues=2026-10").json()["data"]
        assert "no demuestran" in ad["advertencia"]
