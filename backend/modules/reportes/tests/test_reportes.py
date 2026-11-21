import pytest

from core.models import ParametroSistema
from modules.auditoria.models import HistorialCambios

URL = "/api/v1/reportes/"


@pytest.mark.django_db
class TestReportes:
    def test_csv_con_metadatos_y_solo_el_ambito(self, api, datos):
        r = api("jefe").post(URL, {"tipo": "pagos_atrasados", "nivel": "barrio", "periodo": "2026-10", "formato": "csv"}, format="json")
        assert r.status_code == 200 and r["Content-Type"].startswith("text/csv")
        texto = r.content.decode("utf-8-sig")
        assert "Fecha de generación" in texto and "Filtros aplicados" in texto and "Última carga de datos" in texto
        assert "B1" in texto and "B2" in texto and "B3" not in texto
        assert HistorialCambios.objects.filter(accion="reporte_generado").exists()

    def test_pdf_real(self, api, datos):
        r = api("gerencia").post(URL, {"tipo": "creditos", "nivel": "parroquia", "periodo": "2026-10", "formato": "pdf"}, format="json")
        assert r.status_code == 200 and r.content[:4] == b"%PDF"

    def test_reporte_vacio_se_bloquea_y_permisos(self, api, datos):
        r = api("gerencia").post(URL, {"tipo": "socios", "nivel": "barrio", "periodo": "2025-01", "formato": "csv"}, format="json")
        assert r.status_code == 404 and r.json()["error"]["code"] == "REPORTE_VACIO"
        assert api("oficial").post(URL, {"tipo": "socios", "periodo": "2026-10"}, format="json").status_code == 403

    def test_clasificacion_sin_criterios(self, api, datos):
        r = api("gerencia").post(URL, {"tipo": "clasificacion", "periodo": "2026-10", "formato": "csv"}, format="json")
        assert r.status_code == 409


@pytest.mark.django_db
class TestPotencial:
    def test_deshabilitado_por_defecto_e_informa_motivo(self, api, datos):
        e = api("gerencia").get("/api/v1/potencial/estado/").json()["data"]
        assert e["habilitado"] is False and e["motivos"]
        assert api("gerencia").get("/api/v1/potencial/").status_code == 403
        assert api("admin").post("/api/v1/analisis/ejecutar/", {"periodo": "2026-10", "nivel": "barrio"}, format="json").status_code == 403

    def test_habilitado_valida_datos_suficientes_y_versiona(self, api, datos):
        ParametroSistema.objects.update(habilitar_analisis_predictivo=True)
        adm = api("admin")
        r = adm.post("/api/v1/analisis/ejecutar/", {"periodo": "2026-10", "nivel": "barrio"}, format="json")
        assert r.status_code == 400 and r.json()["error"]["code"] == "SIN_CONFIGURACION"
        pesos = {"penetracion_baja": "3", "hogares": "1", "crecimiento": "2", "prospectos": "2", "mora_baja": "2"}
        assert adm.post("/api/v1/analisis/configuracion/", {"pesos": pesos, "min_periodos": 3}, format="json").status_code == 200
        r = adm.post("/api/v1/analisis/ejecutar/", {"periodo": "2026-10", "nivel": "barrio"}, format="json")
        assert r.status_code == 400 and r.json()["error"]["code"] == "DATOS_INSUFICIENTES"
        adm.post("/api/v1/analisis/configuracion/", {"pesos": pesos, "min_periodos": 2}, format="json")
        r = adm.post("/api/v1/analisis/ejecutar/", {"periodo": "2026-10", "nivel": "barrio"}, format="json")
        assert r.status_code == 200 and r.json()["data"]["etiqueta"] == "Estimación no confirmada"
        res = api("jefe").get("/api/v1/potencial/?periodo=2026-10&nivel=barrio").json()["data"]
        assert {i["zona"]["nombre"] for i in res["items"]} == {"Barrio 1", "Barrio 2"}  # ámbito
        assert HistorialCambios.objects.filter(accion__in=["variables_configuradas", "analisis_ejecutado"]).count() == 3
        assert api("supervisor").get("/api/v1/potencial/").status_code == 403
