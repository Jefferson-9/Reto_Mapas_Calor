"""Fase 8 — modo campo sin conexión: paquete de consulta y sincronización por lotes (sección 20.6)."""

import uuid

import pytest
from rest_framework.test import APIClient

from core.models import ParametroSistema
from modules.auditoria.models import HistorialCambios
from modules.campo.models import AsignacionZonaOficial, PosibleSocio, RutaVisita, Visita

URL = "/api/v1/campo/sincronizar/"
PAQUETE = "/api/v1/campo/paquete-offline/"


def prospecto(nombre="Tienda", lat="-3.990500", lng="-79.210500", cu=None, creado="2026-11-18T15:30:00-05:00"):
    return {"client_uuid": cu or str(uuid.uuid4()), "tipo": "prospecto", "client_created_at": creado,
            "datos": {"nombre_negocio": nombre, "latitud": lat, "longitud": lng}}


def ruta(zona_ids, cu=None, nombre="Ruta campo"):
    return {"client_uuid": cu or str(uuid.uuid4()), "tipo": "ruta", "client_created_at": "2026-11-18T16:00:00-05:00",
            "datos": {"nombre": nombre, "fecha_prevista": "2026-11-25", "zona_ids": zona_ids}}


@pytest.fixture
def campo(datos):
    u, z = datos["usuarios"], datos["zonas"]
    AsignacionZonaOficial.objects.create(oficial=u["oficial"], zona=z["B1"], asignado_por=u["jefe"])
    ParametroSistema.objects.update(habilitar_modo_offline=True)
    return datos


@pytest.mark.django_db
class TestParametroModoOffline:
    def test_admin_puede_activar_el_interruptor_y_se_publica_la_ventana(self, api, base):
        r = api("admin").patch("/api/v1/parametros/", {"habilitar_modo_offline": True, "horas_ventana_offline": 12}, format="json")
        assert r.status_code == 200 and r.json()["data"]["habilitar_modo_offline"] is True
        pub = api("oficial").get("/api/v1/parametros/publicos/").json()["data"]
        assert pub["habilitar_modo_offline"] is True and pub["horas_ventana_offline"] == 12

    def test_paquete_bloqueado_si_el_interruptor_esta_apagado(self, api, datos):
        r = api("oficial").get(PAQUETE)
        assert r.status_code == 403 and r.json()["error"]["code"] == "MODO_OFFLINE_DESHABILITADO"


@pytest.mark.django_db
class TestPaqueteOffline:
    def test_solo_zonas_propias_agregadas_sin_datos_individuales(self, api, campo):
        r = api("oficial").get(PAQUETE + "?periodo=2026-10")
        assert r.status_code == 200 and r["Cache-Control"] == "no-store"
        d = r.json()["data"]
        assert [i["zona"]["codigo"] for i in d["mis_zonas"]["items"]] == ["B1"]
        assert [f["properties"]["codigo"] for f in d["poligonos"]["features"]] == ["B1"]
        assert d["horas_ventana_offline"] == 24 and d["vence_en"] > d["generado_en"]
        texto = r.content.decode()
        for prohibido in ("cedula", "Socio 1", "codigo_socio", "******"):
            assert prohibido not in texto  # minimización (20.3)

    def test_roles_sin_trabajo_de_campo_no_reciben_paquete(self, api, campo):
        for rol in ("gerencia", "supervisor", "metodologia"):
            assert api(rol).get(PAQUETE).status_code == 403


@pytest.mark.django_db
class TestSincronizacionPorLotes:
    def test_idempotencia_misma_clave_mismo_resultado_sin_duplicados(self, api, campo):
        cli = api("oficial")
        item = prospecto()
        r1 = cli.post(URL, {"items": [item]}, format="json").json()["data"]
        r2 = cli.post(URL, {"items": [item]}, format="json").json()["data"]
        a, b = r1["resultados"][0], r2["resultados"][0]
        assert a["estado"] == b["estado"] == "sincronizado" and a["id"] == b["id"]
        assert a["duplicado"] is False and b["duplicado"] is True
        assert PosibleSocio.objects.filter(client_uuid=item["client_uuid"]).count() == 1
        # el mismo uuid por el endpoint en línea tampoco duplica
        en_linea = cli.post("/api/v1/prospectos/", {**item["datos"], "client_uuid": item["client_uuid"]}, format="json")
        assert en_linea.status_code == 200 and PosibleSocio.objects.count() == 1

    def test_lote_con_exitos_y_rechazos_parciales_en_orden(self, api, campo):
        z = campo["zonas"]
        items = [
            prospecto("Uno"),
            prospecto("Fuera de zona", lat="-3.700000", lng="-79.700000"),
            prospecto("Fuera de ámbito", lat="-4.030000", lng="-79.200000"),
            ruta([z["B2"].id]),  # zona no asignada
            ruta([z["B1"].id]),
            {"client_uuid": "no-es-uuid", "tipo": "prospecto", "datos": {}},
            {"client_uuid": str(uuid.uuid4()), "tipo": "visita", "datos": {"zona_id": z["B1"].id}},  # visitas apagadas
            prospecto("Dos", lat="-3.990700", lng="-79.210700"),
        ]
        r = api("oficial").post(URL, {"items": items}, format="json")
        assert r.status_code == 200
        res = r.json()["data"]["resultados"]
        assert [x["estado"] for x in res] == ["sincronizado", "rechazado", "rechazado", "rechazado", "sincronizado", "rechazado", "rechazado", "sincronizado"]
        assert [x.get("codigo") for x in res if x["estado"] == "rechazado"] == [
            "FUERA_DE_ZONA", "FUERA_DE_AMBITO", "ZONA_NO_ASIGNADA", "VALIDACION", "VISITAS_DESHABILITADAS"]
        assert res[1]["mensaje"] and res[1]["detalles"]  # motivo visible para corregir o descartar
        assert r.json()["data"]["contadores"] == {"recibidos": 8, "creados": 3, "duplicados": 0, "rechazados": 5, "errores": 0}
        assert PosibleSocio.objects.count() == 2 and RutaVisita.objects.count() == 1

    def test_audita_horas_del_cliente_y_evento_de_sincronizacion(self, api, campo):
        api("oficial").post(URL, {"items": [prospecto(creado="2026-11-18T10:00:00-05:00"), prospecto("X", lat="-3.700000", lng="-79.700000")]}, format="json")
        p = PosibleSocio.objects.get()
        assert p.client_created_at.isoformat().startswith("2026-11-18T15:00:00")  # UTC
        reg = HistorialCambios.objects.get(accion="prospecto_registrado")
        assert reg.valor_nuevo["client_created_at"] == "2026-11-18T10:00:00-05:00"  # hora del dispositivo; la del servidor es la del evento
        sync = HistorialCambios.objects.get(accion="sincronizacion_offline")
        assert sync.valor_nuevo["recibidos"] == 2 and sync.valor_nuevo["creados"] == 1 and sync.valor_nuevo["rechazados"] == 1

    def test_zona_reasignada_rechaza_ruta_y_visita_pero_acepta_lo_demas(self, api, campo):
        z, u = campo["zonas"], campo["usuarios"]
        ParametroSistema.objects.update(habilitar_registro_visitas=True)
        # mientras el oficial estaba sin conexión, el jefe le retiró B1 y le asignó B2
        AsignacionZonaOficial.objects.filter(oficial=u["oficial"], zona=z["B1"]).update(activa=False)
        AsignacionZonaOficial.objects.create(oficial=u["oficial"], zona=z["B2"], asignado_por=u["jefe"])
        visita = {"client_uuid": str(uuid.uuid4()), "tipo": "visita", "client_created_at": "2026-11-18T09:00:00-05:00",
                  "datos": {"zona_id": z["B1"].id, "fecha_visita": "2026-11-18", "realizada": True, "resultado": "interes"}}
        items = [ruta([z["B1"].id]), visita, prospecto("En B1"), prospecto("En B2", lat="-3.990500", lng="-79.190500")]
        res = api("oficial").post(URL, {"items": items}, format="json").json()["data"]["resultados"]
        assert [(x["estado"], x.get("codigo")) for x in res] == [
            ("rechazado", "ZONA_NO_ASIGNADA"), ("rechazado", "ZONA_NO_ASIGNADA"), ("rechazado", "FUERA_DE_AMBITO"), ("sincronizado", None)]
        assert RutaVisita.objects.count() == 0 and Visita.objects.count() == 0

    def test_uuid_de_otro_usuario_se_rechaza_por_conflicto(self, api, campo):
        item = prospecto()
        api("oficial").post(URL, {"items": [item]}, format="json")
        AsignacionZonaOficial.objects.create(oficial=campo["usuarios"]["oficialsur"], zona=campo["zonas"]["B3"], asignado_por=campo["usuarios"]["jefesur"])
        res = api("oficialsur").post(URL, {"items": [item]}, format="json").json()["data"]["resultados"][0]
        assert res["estado"] == "rechazado" and res["codigo"] == "CONFLICTO_IDEMPOTENCIA"

    def test_usuario_desactivado_es_rechazado_y_no_se_crea_nada(self, api, campo):
        cli = api("oficial")
        assert api("admin").post(f"/api/v1/usuarios/{campo['usuarios']['oficial'].id}/desactivar/").status_code == 200
        r = cli.post(URL, {"items": [prospecto()]}, format="json")
        assert r.status_code == 401 and r.json()["error"]["code"] == "USUARIO_DESACTIVADO"
        assert PosibleSocio.objects.count() == 0

    def test_refresh_de_usuario_desactivado_informa_para_borrar_datos_locales(self, campo):
        c = APIClient()
        from conftest import PASSWORD

        assert c.post("/api/v1/auth/login/", {"username": "oficial", "password": PASSWORD}, format="json").status_code == 200
        u = campo["usuarios"]["oficial"]
        u.activo = False
        u.save(update_fields=["activo"])
        r = c.post("/api/v1/auth/refresh/", HTTP_X_COAC_REFRESH="1")
        assert r.status_code == 401 and r.json()["error"]["code"] == "USUARIO_DESACTIVADO"

    def test_permiso_perdido_rechaza_el_lote_y_por_elemento(self, api, campo):
        # Sin ningún permiso de registro de campo: el lote completo se rechaza (la aplicación borra sus datos locales)
        r = api("gerencia").post(URL, {"items": [prospecto()]}, format="json")
        assert r.status_code == 403 and r.json()["error"]["code"] == "SIN_PERMISO"
        # El jefe de agencia registra posibles socios, pero no gestiona rutas propias: rechazo por elemento
        res = api("jefe").post(URL, {"items": [ruta([campo["zonas"]["B1"].id]), prospecto()]}, format="json").json()["data"]["resultados"]
        assert [(x["estado"], x.get("codigo")) for x in res] in ([("rechazado", "SIN_PERMISO"), ("sincronizado", None)],)

    def test_token_vencido_o_ausente(self, campo):
        c = APIClient()
        assert c.post(URL, {"items": [prospecto()]}, format="json").status_code == 401
        c.credentials(HTTP_AUTHORIZATION="Bearer token.invalido.vencido")
        r = c.post(URL, {"items": [prospecto()]}, format="json")
        assert r.status_code == 401 and r.json()["error"]["code"] == "TOKEN_INVALIDO"
        assert PosibleSocio.objects.count() == 0

    def test_lote_vacio_o_excesivo_se_rechaza_entero(self, api, campo):
        cli = api("oficial")
        assert cli.post(URL, {"items": []}, format="json").status_code == 400
        assert cli.post(URL, {"items": [prospecto() for _ in range(51)]}, format="json").status_code == 400
