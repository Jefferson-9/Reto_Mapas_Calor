import json
from unittest import mock

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from modules.auditoria.models import HistorialCambios
from modules.cartera.models import CargaDatos, EsquemaCarga, IndicadorZonaPeriodo, RegistroObservado, Socio
from modules.territorio.models import Zona

URL = "/api/v1/cargas/"
CAB = "codigo_socio,cedula,nombre,agencia_codigo,fecha_ingreso,latitud,longitud\n"


def csv_socios(filas, cab=CAB):
    return SimpleUploadedFile("socios.csv", (cab + "\n".join(filas) + "\n").encode("utf-8"), content_type="text/csv")


def subir(cli, archivo, tipo="socios", periodo="2026-10", **extra):
    return cli.post(URL, {"archivo": archivo, "tipo": tipo, "periodo": periodo, **extra}, format="multipart")


VALIDAS = [
    "N1,1100000001,Ana Uno,MATRIZ,2026-10-01,-3.990000,-79.210000",
    "N2,1100000002,Beto Dos,MATRIZ,01/10/2026,-3.990500,-79.190500",
    "N3,1100000003,Caro Tres,SUR,2026-10-02,-4.030000,-79.200000",
]


@pytest.mark.django_db
class TestCargaSocios:
    def test_flujo_completo_previsualiza_confirma_y_recalcula(self, api, base):
        cli = api("admin")
        errores = ["N4,1100000004,Sin Coords,MATRIZ,2026-10-03,,", "N1,1100000009,Repetido,MATRIZ,2026-10-03,-3.990000,-79.210000",
                   "N5,1100000005,Fecha Mala,MATRIZ,31-31-2026,-3.990000,-79.210000", "N6,1100000006,Fuera,MATRIZ,2026-10-03,-3.500000,-79.500000"]
        r = subir(cli, csv_socios(VALIDAS + errores))
        assert r.status_code == 201, r.content
        d = r.json()["data"]
        assert d["estado"] == "requiere_revision" and d["leidos"] == 7
        assert d["resumen"]["validos"] == 3 and d["observados"] == 3 and d["rechazados"] == 1
        assert all("1100000001" not in json.dumps(m["fila_raw"]) for m in d["muestra"])  # cédula enmascarada
        assert Socio.objects.count() == 0  # nada se persiste antes de confirmar
        r = cli.post(f"{URL}{d['id']}/confirmar/")
        assert r.status_code == 200, r.content
        d = r.json()["data"]
        assert d["estado"] == "completada" and d["cargados"] == 3 and d["observados"] == 3 and d["rechazados"] == 1
        assert Socio.objects.count() == 3 and RegistroObservado.objects.count() == 3
        assert IndicadorZonaPeriodo.objects.filter(periodo="2026-10", zona=base["zonas"]["B1"], total_socios=1).exists()
        ev = HistorialCambios.objects.get(accion="carga_confirmada")
        assert ev.valor_nuevo["nuevos"] == 3
        assert "1100000001" not in json.dumps(ev.valor_nuevo)
        errores_csv = b"".join(cli.get(f"{URL}{d['id']}/errores.csv").streaming_content).decode("utf-8-sig")
        assert "fila,clasificacion,campo,motivo" in errores_csv and "Fecha de ingreso" in errores_csv

    def test_columnas_obligatorias_faltantes_y_mapeo_manual_con_alias(self, api):
        cli = api("admin")
        cab = "id_cliente,cedula,nombre,agencia_codigo,fecha_ingreso,latitud,longitud\n"
        r = subir(cli, csv_socios(VALIDAS[:1], cab))
        d = r.json()["data"]
        assert d["faltantes"] == ["codigo_socio"] and "Código de socio" in d["mensaje"]
        assert cli.post(f"{URL}{d['id']}/confirmar/").status_code == 400
        r = cli.put(f"{URL}{d['id']}/mapeo/", {"mapeo": {"codigo_socio": "id_cliente"}, "guardar_alias": True}, format="json")
        assert r.status_code == 200 and r.json()["data"]["faltantes"] == [] and r.json()["data"]["resumen"]["validos"] == 1
        esquema = EsquemaCarga.objects.get(tipo="socios", vigente=True)
        assert esquema.version == 2 and "id_cliente" in next(c for c in esquema.campos if c["campo"] == "codigo_socio")["alias"]

    def test_mismo_archivo_completado_se_rechaza_salvo_reemplazo(self, api):
        cli = api("admin")
        d = subir(cli, csv_socios(VALIDAS)).json()["data"]
        cli.post(f"{URL}{d['id']}/confirmar/")
        r = subir(cli, csv_socios(VALIDAS))
        assert r.status_code == 409 and r.json()["error"]["code"] == "ARCHIVO_YA_CARGADO"
        assert subir(cli, csv_socios(VALIDAS), reemplazo="true").status_code == 201

    def test_reimportacion_no_duplica_y_actualiza_cambios(self, api):
        cli = api("admin")
        d = subir(cli, csv_socios(VALIDAS)).json()["data"]
        cli.post(f"{URL}{d['id']}/confirmar/")
        cambiado = [VALIDAS[0].replace("Ana Uno", "Ana Modificada"), VALIDAS[1], VALIDAS[2]]
        d = subir(cli, csv_socios(cambiado)).json()["data"]
        r = cli.post(f"{URL}{d['id']}/confirmar/").json()["data"]
        assert Socio.objects.count() == 3
        assert r["resumen"]["actualizados"] == 1 and r["resumen"]["sin_cambio"] == 2
        ev = HistorialCambios.objects.filter(accion="carga_confirmada").order_by("-secuencia").first()
        assert ev.valor_nuevo["cambios"][0]["campos"]["nombre"] == "[dato personal modificado]"

    def test_rollback_completo_si_falla_la_persistencia(self, api):
        cli = api("admin")
        d = subir(cli, csv_socios(VALIDAS)).json()["data"]
        with mock.patch("modules.cartera.repositories.datos.PostgresDatosRepository.upsert_socios", side_effect=RuntimeError("fallo simulado")):
            r = cli.post(f"{URL}{d['id']}/confirmar/")
        assert r.status_code == 500 and r.json()["error"]["code"] == "CARGA_FALLIDA"
        assert Socio.objects.count() == 0 and RegistroObservado.objects.count() == 0
        assert CargaDatos.objects.get(id=d["id"]).estado == "fallida"

    @pytest.mark.parametrize("contenido,codigo", [
        (b"\x00\x01\x02binario", "ARCHIVO_INVALIDO"), (b"solo_una_columna\nvalor\n", "ARCHIVO_INVALIDO"), ("ñandú;".encode("latin-1") + b"\n", "CODIFICACION_INVALIDA"),
    ])
    def test_rechaza_contenido_que_no_es_csv(self, api, contenido, codigo):
        r = subir(api("admin"), SimpleUploadedFile("x.csv", contenido))
        assert r.status_code == 400 and r.json()["error"]["code"] == codigo

    def test_rechaza_extension_tipo_y_periodo(self, api):
        r = subir(api("admin"), SimpleUploadedFile("x.xlsx", b"a,b\n1,2\n"), tipo="otro", periodo="2026-13")
        campos = {e["campo"] for e in r.json()["error"]["details"]}
        assert r.status_code == 400 and {"tipo", "periodo", "archivo"} <= campos

    def test_limite_de_filas(self, api):
        from core.models import ParametroSistema

        ParametroSistema.objects.update(max_filas_carga=10)
        filas = [f"X{i},11000000{i:02d},N,MATRIZ,2026-10-01,-3.990000,-79.210000" for i in range(12)]
        r = subir(api("admin"), csv_socios(filas))
        assert r.status_code == 400 and r.json()["error"]["code"] == "ARCHIVO_DEMASIADO_GRANDE"

    def test_permiso_y_campo_adicional_en_atributos(self, api):
        assert subir(api("jefe"), csv_socios(VALIDAS)).status_code == 403
        cli = api("admin")
        esquema = EsquemaCarga.objects.get(tipo="socios", vigente=True).campos
        nuevo = esquema + [{"campo": "telefono_negocio", "etiqueta": "Teléfono", "tipo_dato": "texto", "requerido": False, "nucleo": False, "sensible": True, "alias": []},
                           {"campo": "empleados", "etiqueta": "Empleados", "tipo_dato": "entero", "requerido": False, "nucleo": False, "sensible": False, "alias": []}]
        assert cli.put("/api/v1/esquemas/socios/editar/", {"campos": nuevo}, format="json").status_code == 200
        cab = CAB.strip() + ",telefono_negocio,empleados\n"
        d = subir(cli, csv_socios([VALIDAS[0] + ",0991234567,4"], cab)).json()["data"]
        cli.post(f"{URL}{d['id']}/confirmar/")
        assert Socio.objects.get().atributos == {"telefono_negocio": "***", "empleados": 4}


@pytest.mark.django_db
class TestCreditosYPagos:
    def test_credito_con_socio_inexistente_queda_observado_y_luego_se_corrige(self, api):
        cli = api("admin")
        cab = "codigo_credito,codigo_socio,monto,fecha_desembolso,plazo_meses,estado\n"
        archivo = SimpleUploadedFile("c.csv", (cab + "K1,N1,1500.00,2026-09-15,12,vigente\nK2,N1,abc,2026-09-15,12,vigente\n").encode())
        d = subir(cli, archivo, tipo="creditos").json()["data"]
        assert d["observados"] == 1 and d["rechazados"] == 1
        cli.post(f"{URL}{d['id']}/confirmar/")
        obs = RegistroObservado.objects.get(tipo="creditos")
        r = cli.post(f"/api/v1/observados/{obs.id}/corregir/", {"datos": {}}, format="json")
        assert r.status_code == 400 and r.json()["error"]["code"] == "REGISTRO_AUN_OBSERVADO"
        s = subir(cli, csv_socios(VALIDAS)).json()["data"]
        cli.post(f"{URL}{s['id']}/confirmar/")
        r = cli.post(f"/api/v1/observados/{obs.id}/corregir/", {"datos": {}, "nota": "Socio ya cargado"}, format="json")
        assert r.status_code == 200 and r.json()["data"]["estado"] == "corregido"
        assert HistorialCambios.objects.filter(accion="observado_corregido").exists()


@pytest.mark.django_db
class TestObservados:
    def _observado(self, cli):
        d = subir(cli, csv_socios(["N9,1100000099,Sin Coords,MATRIZ,2026-10-03,,"])).json()["data"]
        cli.post(f"{URL}{d['id']}/confirmar/")
        return RegistroObservado.objects.get()

    def test_corregir_revalida_y_excluye_mientras_no_sea_valido(self, api, base):
        cli = api("admin")
        o = self._observado(cli)
        assert cli.get("/api/v1/observados/resumen/").json()["data"]["excluidos"] == 1
        r = cli.post(f"/api/v1/observados/{o.id}/corregir/", {"datos": {"latitud": "-3.99", "longitud": "-79.21"}}, format="json")
        assert r.status_code == 400  # precisión insuficiente: sigue observado
        r = cli.post(f"/api/v1/observados/{o.id}/corregir/", {"datos": {"latitud": "-3.990100", "longitud": "-79.210100"}, "nota": "GPS"}, format="json")
        assert r.status_code == 200
        assert Socio.objects.get(codigo_socio="N9").zona_id == base["zonas"]["B1"].id
        assert cli.get("/api/v1/observados/resumen/").json()["data"]["excluidos"] == 0

    def test_descartar_y_conservar_exigen_justificacion(self, api):
        cli = api("admin")
        o = self._observado(cli)
        assert cli.post(f"/api/v1/observados/{o.id}/descartar/", {"nota": ""}, format="json").status_code == 400
        r = cli.post(f"/api/v1/observados/{o.id}/conservar/", {"nota": "Pendiente de visita"}, format="json")
        assert r.status_code == 200 and r.json()["data"]["estado"] == "conservado"
        assert cli.post(f"/api/v1/observados/{o.id}/descartar/", {"nota": "Duplicado confirmado"}, format="json").json()["data"]["estado"] == "descartado"
        assert api("oficial").get("/api/v1/observados/").status_code == 403


@pytest.mark.django_db
class TestEsquemas:
    def test_campo_nucleo_no_se_elimina_ni_deja_de_ser_obligatorio(self, api):
        cli = api("admin")
        campos = EsquemaCarga.objects.get(tipo="socios", vigente=True).campos
        sin_cedula = [c for c in campos if c["campo"] != "cedula"]
        r = cli.put("/api/v1/esquemas/socios/editar/", {"campos": sin_cedula}, format="json")
        assert r.status_code == 400
        opcional = [dict(c, requerido=False, nucleo=False) if c["campo"] == "cedula" else c for c in campos]
        assert cli.put("/api/v1/esquemas/socios/editar/", {"campos": opcional}, format="json").status_code == 400
        renombrado = [dict(c, etiqueta="Documento de identidad") if c["campo"] == "cedula" else c for c in campos]
        assert cli.put("/api/v1/esquemas/socios/editar/", {"campos": renombrado}, format="json").status_code == 200
        assert api("jefe").put("/api/v1/esquemas/socios/editar/", {"campos": campos}, format="json").status_code == 403

    def test_nucleo_opcional_sigue_opcional_al_editar(self, api):
        campos = EsquemaCarga.objects.get(tipo="limites", vigente=True).campos
        r = api("admin").put("/api/v1/esquemas/limites/editar/", {"campos": campos}, format="json")
        assert r.status_code == 200
        sup = next(c for c in EsquemaCarga.objects.get(tipo="limites", vigente=True).campos if c["campo"] == "zona_superior_codigo")
        assert sup["nucleo"] and not sup["requerido"]

    def test_plantilla_desde_esquema_vigente(self, api):
        r = api("admin").get("/api/v1/esquemas/socios/plantilla.csv")
        assert r.status_code == 200 and r.content.decode("utf-8-sig").startswith("codigo_socio,cedula,nombre")


def geojson(features):
    return SimpleUploadedFile("limites.geojson", json.dumps({"type": "FeatureCollection", "features": features}).encode(), content_type="application/geo+json")


def feature(codigo, tipo, sup, lng, lat, d=0.004, nombre=None):
    poly = [[[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]]]
    return {"type": "Feature", "properties": {"codigo": codigo, "nombre": nombre or codigo, "tipo_zona": tipo, "zona_superior_codigo": sup, "hogares": 50},
            "geometry": {"type": "Polygon", "coordinates": poly}}


@pytest.mark.django_db
class TestLimites:
    def test_archivo_invalido_se_rechaza_y_conserva_divisiones(self, api):
        antes = Zona.objects.count()
        malo = feature("B9", "barrio", "NOEXISTE", -79.205, -3.985)
        malo2 = {"type": "Feature", "properties": {"codigo": "B8", "nombre": "x", "tipo_zona": "barrio", "zona_superior_codigo": "PA"},
                 "geometry": {"type": "Point", "coordinates": [-79.2, -3.9]}}
        r = api("admin").post("/api/v1/limites/", {"archivo": geojson([malo, malo2])}, format="multipart")
        assert r.status_code == 400 and r.json()["error"]["code"] == "LIMITES_INVALIDOS"
        assert Zona.objects.count() == antes
        assert CargaDatos.objects.get(tipo="limites").estado == "fallida"

    def test_vista_previa_y_confirmacion(self, api, base):
        cli = api("admin")
        r = cli.post("/api/v1/limites/", {"archivo": geojson([feature("B9", "barrio", "PA", -79.205, -3.975), feature("B1", "barrio", "PA", -79.21, -3.99, 0.01, "Barrio 1 nuevo")])},
                     format="multipart")
        assert r.status_code == 201, r.content
        d = r.json()["data"]
        assert d["resumen"]["nuevas"] == ["B9"] and d["resumen"]["modificadas"] == ["B1"] and "B3" in d["resumen"]["ausentes"]
        assert not Zona.objects.filter(codigo="B9").exists()  # nada cambia antes de confirmar
        r = cli.post(f"/api/v1/limites/{d['id']}/confirmar/", {"retirar_ausentes": False}, format="json")
        assert r.status_code == 200 and r.json()["data"]["estado"] == "completada"
        assert Zona.objects.get(codigo="B9").zona_superior == base["zonas"]["PA"]
        assert Zona.objects.get(codigo="B1").nombre == "Barrio 1 nuevo" and Zona.objects.get(codigo="B3").vigente
        assert HistorialCambios.objects.filter(accion="limites_actualizados").exists()

    def test_conexion_bd_bloqueada(self, api):
        r = api("admin").get("/api/v1/cargas/conexion-bd/")
        assert r.json()["data"]["estado"] == "Bloqueado"
        r = api("admin").patch("/api/v1/parametros/", {"habilitar_conexion_bd": True}, format="json")
        assert r.status_code == 400 and r.json()["error"]["code"] == "CONEXION_BD_BLOQUEADA"
