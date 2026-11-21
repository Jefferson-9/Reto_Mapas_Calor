import pytest

from modules.analitica.services.calculos import normalizar, puntajes, rangos_leyenda


@pytest.mark.django_db
class TestAmbitoEIdor:
    def test_jefe_de_agencia_solo_ve_su_agencia(self, api, datos):
        z = datos["zonas"]
        r = api("jefesur").get("/api/v1/zonas/?tipo=barrio").json()["data"]["items"]
        assert [i["codigo"] for i in r] == ["B3"]
        assert api("jefesur").get(f"/api/v1/zonas/{z['B1'].id}/").status_code == 404  # IDOR horizontal
        assert api("jefesur").get(f"/api/v1/mapa/zonas/{z['B1'].id}/").status_code == 404
        ids = {f["properties"]["id"] for f in api("jefe").get("/api/v1/mapa/zonas/?nivel=barrio").json()["data"]["zonas"]["features"]}
        assert ids == {z["B1"].id, z["B2"].id}

    def test_oficial_solo_ve_zonas_asignadas(self, api, datos):
        from modules.campo.models import AsignacionZonaOficial

        z, u = datos["zonas"], datos["usuarios"]
        AsignacionZonaOficial.objects.create(oficial=u["oficial"], zona=z["B2"], asignado_por=u["jefe"])
        items = api("oficial").get("/api/v1/indicadores/?nivel=barrio").json()["data"]["items"]
        assert [i["zona"]["codigo"] for i in items] == ["B2"]

    def test_agregacion_superior_suma_solo_el_ambito(self, api, datos):
        coop = api("gerencia").get("/api/v1/indicadores/?nivel=canton").json()["data"]["items"][0]["indicadores"]
        matriz = api("jefe").get("/api/v1/indicadores/?nivel=canton").json()["data"]["items"][0]["indicadores"]
        assert coop["total_socios"] == 9 and matriz["total_socios"] == 6
        assert matriz["tasa_morosidad"] == "4.17"  # 250 / 6000 × 100, recalculada
        assert coop["penetracion_pct"] is None  # B3 sin hogares → «Sin datos»


@pytest.mark.django_db
class TestMapaEIndicadores:
    def test_mapa_devuelve_poligonos_calor_y_leyenda(self, api, datos):
        d = api("gerencia").get("/api/v1/mapa/zonas/?nivel=barrio&variable=creditos_atrasados&periodo=2026-10").json()["data"]
        assert len(d["zonas"]["features"]) == 3 and d["leyenda"]
        assert all(f["geometry"]["type"] in ("Polygon", "MultiPolygon") for f in d["zonas"]["features"])
        assert {f["properties"]["peso"] for f in d["calor"]["features"]} == {1.0, 0.0, 2.0}

    def test_sin_datos_no_es_cero(self, api, datos):
        d = api("gerencia").get("/api/v1/mapa/zonas/?nivel=barrio&variable=total_socios&periodo=2026-01").json()["data"]
        assert d["sin_datos_suficientes"] and all(f["properties"]["sin_datos"] for f in d["zonas"]["features"])
        assert d["mensaje"]

    def test_puntos_individuales_por_rol_y_bbox(self, api, datos):
        bbox = "bbox=-79.25,-4.05,-79.15,-3.95&tipo=socios"
        assert api("gerencia").get(f"/api/v1/mapa/puntos/?{bbox}").status_code == 403  # solo agregados
        r = api("jefe").get(f"/api/v1/mapa/puntos/?{bbox}").json()["data"]
        assert len(r["features"]) == 6 and "nombre" not in r["features"][0]["properties"]
        assert api("jefe").get("/api/v1/mapa/puntos/?bbox=-82,-6,-75,2&tipo=socios").status_code == 400  # bbox demasiado grande

    def test_indicadores_ordenables_paginados_y_con_ultima_carga(self, api, datos):
        d = api("admin").get("/api/v1/indicadores/?nivel=barrio&orden=total_socios&desc=1&page_size=2").json()["data"]
        assert [i["zona"]["codigo"] for i in d["items"]] == ["B1", "B3"] and d["has_more"] and d["total_count"] == 3
        assert d["ultima_carga_at"]
        d2 = api("admin").get(f"/api/v1/indicadores/?nivel=barrio&orden=total_socios&desc=1&page_size=2&cursor={d['next_cursor']}").json()["data"]
        assert [i["zona"]["codigo"] for i in d2["items"]] == ["B2"] and d2["total_count"] is None
        assert api("admin").get("/api/v1/indicadores/?orden=__class__").status_code == 400  # orden por lista blanca

    def test_panel_kpis_con_variacion(self, api, datos):
        d = api("gerencia").get("/api/v1/panel/?periodo=2026-10").json()["data"]
        assert d["kpis"]["creditos_atrasados"]["valor"] == 3 and d["kpis"]["creditos_atrasados"]["anterior"] == 0
        assert d["kpis"]["tasa_morosidad"]["tipo_variacion"] == "puntos" and len(d["evolucion"]) == 2


@pytest.mark.django_db
class TestComparacion:
    def test_compara_y_marca_tendencias_y_faltantes(self, api, datos):
        z = datos["zonas"]
        d = api("jefe").get(f"/api/v1/comparar/?zonas={z['B1'].id}&periodos=2026-09,2026-10,2026-11&indicadores=creditos_atrasados").json()["data"]
        serie = d["zonas"][0]["series"][0]
        assert serie["cambios"][0]["tendencia"] == "aumento" and serie["cambios"][0]["diferencia"] == "1"
        assert serie["cambios"][1]["falta_informacion"] and serie["cambios"][1]["diferencia"] is None
        assert d["zonas"][0]["periodos_sin_datos"] == ["2026-11"]
        assert api("oficial").get(f"/api/v1/comparar/?zonas={z['B1'].id}&periodos=2026-09,2026-10").status_code == 403
        assert api("jefe").get(f"/api/v1/comparar/?zonas={z['B3'].id}&periodos=2026-09,2026-10").status_code == 404


def test_rangos_de_leyenda_crecientes():
    r = rangos_leyenda([1, 2, 3, 4, 5, 10, 20, 50])
    assert r[0]["desde"] == 1 and r[-1]["hasta"] == 50
    assert all(a["hasta"] == b["desde"] for a, b in zip(r, r[1:]))
    assert rangos_leyenda([]) == [] and len(rangos_leyenda([3, 3])) == 1


def test_puntaje_potencial_normalizado_y_bandas():
    assert normalizar({"a": 0, "b": 5, "c": 10}) == {"a": 0.0, "b": 0.5, "c": 1.0}
    crudos = {"a": {"penetracion": 1, "hogares": 100, "crecimiento": 10, "prospectos": 5, "mora": 1},
              "b": {"penetracion": 9, "hogares": 10, "crecimiento": 0, "prospectos": 0, "mora": 9}}
    pesos = {"penetracion_baja": 1, "hogares": 1, "crecimiento": 1, "prospectos": 1, "mora_baja": 1}
    r = puntajes(crudos, pesos, {"alto": "0.66", "medio": "0.33"})
    assert r["a"]["puntaje"] == 1.0 and r["a"]["banda"] == "alto" and r["b"]["banda"] == "bajo"
