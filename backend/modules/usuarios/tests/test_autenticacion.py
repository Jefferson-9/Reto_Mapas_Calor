import datetime

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from conftest import PASSWORD, cliente_para
from modules.auditoria.models import HistorialCambios
from modules.usuarios.models import IntentoAcceso, SesionUsuario

LOGIN = "/api/v1/auth/login/"


def _login(c, username, password):
    return c.post(LOGIN, {"username": username, "password": password}, format="json")


@pytest.mark.django_db
class TestLogin:
    def test_login_exitoso_devuelve_access_y_cookie_httponly(self, base):
        c = APIClient()
        r = _login(c, "admin", PASSWORD)
        assert r.status_code == 200
        body = r.json()
        assert body["success"] and body["data"]["access"]
        assert "usuarios.gestionar" in body["data"]["usuario"]["permisos"]
        cookie = r.cookies["coac_refresh"]
        assert cookie["httponly"] and cookie["samesite"] == "Strict" and cookie["path"] == "/api/v1/auth/"
        assert "access" not in r.cookies  # el access nunca va en cookie

    @pytest.mark.parametrize("username,password", [("admin", "incorrecta"), ("noexiste", PASSWORD), ("inactivo", PASSWORD), ("", "")])
    def test_respuesta_generica_sin_revelar_causa(self, base, username, password):
        r = _login(APIClient(), username, password)
        assert r.status_code == 401
        err = r.json()["error"]
        assert err["code"] == "CREDENCIALES_INVALIDAS"
        assert err["message"] == "No fue posible iniciar sesión. Verifique sus datos e intente nuevamente."

    def test_registra_intentos_exitosos_y_fallidos_sin_contrasena(self, base):
        _login(APIClient(), "admin", "mala")
        _login(APIClient(), "admin", PASSWORD)
        intentos = list(IntentoAcceso.objects.filter(username="admin").values("exitoso", "motivo"))
        assert {i["exitoso"] for i in intentos} == {True, False}
        eventos = HistorialCambios.objects.filter(categoria="acceso").values_list("accion", flat=True)
        assert "login_fallido" in eventos and "login_exitoso" in eventos
        assert not HistorialCambios.objects.filter(detalle__icontains=PASSWORD).exists()

    def test_bloqueo_temporal_tras_cinco_fallos(self, base):
        c = APIClient()
        for _ in range(5):
            assert _login(c, "jefe", "mala").status_code == 401
        r = _login(c, "jefe", PASSWORD)  # correcta, pero bloqueada
        assert r.status_code == 401 and r.json()["error"]["code"] == "CREDENCIALES_INVALIDAS"
        assert IntentoAcceso.objects.filter(username="jefe", motivo="bloqueado").exists()


@pytest.mark.django_db
class TestSesion:
    def test_endpoint_protegido_sin_token(self, base):
        r = APIClient().get("/api/v1/auth/me/")
        assert r.status_code == 401 and r.json()["error"]["code"] == "NO_AUTENTICADO"

    def test_inactividad_cierra_la_sesion_en_servidor(self, base):
        c = cliente_para(base["usuarios"]["oficial"])
        assert c.get("/api/v1/auth/me/").status_code == 200
        SesionUsuario.objects.update(ultima_actividad=timezone.now() - datetime.timedelta(minutes=16))
        r = c.get("/api/v1/auth/me/")
        assert r.status_code == 401 and r.json()["error"]["code"] == "SESION_INACTIVA"
        assert SesionUsuario.objects.get().motivo_cierre == "inactividad"

    def test_refresh_exige_cabecera_y_rota_el_token(self, base):
        c = APIClient()
        _login(c, "admin", PASSWORD)
        assert c.post("/api/v1/auth/refresh/").status_code == 403
        viejo = c.cookies["coac_refresh"].value
        r = c.post("/api/v1/auth/refresh/", HTTP_X_COAC_REFRESH="1")
        assert r.status_code == 200 and r.json()["data"]["access"]
        assert c.cookies["coac_refresh"].value != viejo
        # el refresh anterior quedó revocado
        c2 = APIClient()
        c2.cookies["coac_refresh"] = viejo
        assert c2.post("/api/v1/auth/refresh/", HTTP_X_COAC_REFRESH="1").status_code == 401

    def test_refresh_rechaza_origen_no_permitido(self, base):
        c = APIClient()
        _login(c, "admin", PASSWORD)
        r = c.post("/api/v1/auth/refresh/", HTTP_X_COAC_REFRESH="1", HTTP_ORIGIN="https://atacante.example")
        assert r.status_code == 403

    def test_logout_revoca_access_y_refresh(self, base):
        c = APIClient()
        r = _login(c, "admin", PASSWORD)
        c.credentials(HTTP_AUTHORIZATION="Bearer " + r.json()["data"]["access"])
        refresh = c.cookies["coac_refresh"].value
        assert c.post("/api/v1/auth/logout/").status_code == 200
        r = c.get("/api/v1/auth/me/")
        assert r.status_code == 401 and r.json()["error"]["code"] == "SESION_CERRADA"
        c2 = APIClient()
        c2.cookies["coac_refresh"] = refresh
        assert c2.post("/api/v1/auth/refresh/", HTTP_X_COAC_REFRESH="1").status_code == 401

    def test_token_manipulado_es_rechazado(self, base):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION="Bearer abc.def.ghi")
        r = c.get("/api/v1/auth/me/")
        assert r.status_code == 401 and r.json()["error"]["code"] == "TOKEN_INVALIDO"
