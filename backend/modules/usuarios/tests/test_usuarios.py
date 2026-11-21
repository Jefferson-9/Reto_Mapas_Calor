import pytest

from modules.auditoria.models import HistorialCambios
from modules.usuarios.models import SesionUsuario, Usuario

URL = "/api/v1/usuarios/"


@pytest.mark.django_db
class TestGestionUsuarios:
    def test_solo_admin_gestiona_usuarios(self, api):
        for rol in ("jefe", "oficial", "gerencia", "supervisor", "metodologia"):
            assert api(rol).get(URL).status_code == 403
        assert api("admin").get(URL).status_code == 200

    def test_crea_usuario_valido_y_audita(self, api, base):
        r = api("admin").post(URL, {"username": "nuevo.oficial", "nombre_completo": "Nuevo Oficial", "cargo": "Oficial", "rol": "oficial",
                                    "agencia_id": base["agencias"]["MATRIZ"].id, "password": "Clave-Muy-Segura-99"}, format="json")
        assert r.status_code == 201, r.content
        assert r.json()["data"]["rol"]["codigo"] == "oficial"
        ev = HistorialCambios.objects.get(accion="usuario_creado")
        assert "Clave-Muy-Segura-99" not in str(ev.valor_nuevo)

    def test_valida_obligatorios_y_duplicado_senalando_cada_campo(self, api):
        r = api("admin").post(URL, {"username": "ADMIN", "nombre_completo": "", "rol": "", "password": "123"}, format="json")
        assert r.status_code == 400
        campos = {d["campo"] for d in r.json()["error"]["details"]}
        assert {"username", "nombre_completo", "rol", "password"} <= campos

    def test_oficial_requiere_agencia(self, api):
        r = api("admin").post(URL, {"username": "sin.agencia", "nombre_completo": "X", "rol": "oficial", "password": "Clave-Muy-Segura-99"}, format="json")
        assert r.status_code == 400 and any(d["campo"] == "agencia_id" for d in r.json()["error"]["details"])

    def test_cambio_de_rol_revoca_sesiones_y_rige_en_siguiente_acceso(self, api, base):
        jefe_cli = api("jefe")
        assert jefe_cli.get("/api/v1/asignaciones/").status_code == 200
        r = api("admin").patch(f"{URL}{base['usuarios']['jefe'].id}/", {"rol": "supervisor", "agencia_id": None}, format="json")
        assert r.status_code == 200, r.content
        assert not SesionUsuario.objects.filter(usuario=base["usuarios"]["jefe"], revocada_en__isnull=True).exists()
        assert jefe_cli.get("/api/v1/asignaciones/").status_code == 401

    def test_desactivar_impide_ingreso_y_conserva_historial(self, api, base):
        oficial = base["usuarios"]["oficial"]
        api("oficial").get("/api/v1/auth/me/")
        antes = HistorialCambios.objects.filter(usuario=oficial).count()
        r = api("admin").post(f"{URL}{oficial.id}/desactivar/")
        assert r.status_code == 200 and r.json()["data"]["activo"] is False
        assert Usuario.objects.filter(id=oficial.id).exists()
        assert HistorialCambios.objects.filter(usuario=oficial).count() >= antes
        login = api("admin").post("/api/v1/auth/login/", {"username": "oficial", "password": "Prueba-Segura-2026!"}, format="json")
        assert login.status_code == 401

    def test_admin_no_puede_desactivarse_a_si_mismo(self, api, base):
        r = api("admin").post(f"{URL}{base['usuarios']['admin'].id}/desactivar/")
        assert r.status_code == 400

    def test_editar_matriz_de_permisos_audita(self, api):
        r = api("admin").put("/api/v1/roles/gerencia/permisos/", {"permisos": ["panel.ver", "mapa.ver"]}, format="json")
        assert r.status_code == 200 and r.json()["data"]["permisos"] == ["mapa.ver", "panel.ver"]
        assert HistorialCambios.objects.filter(accion="permisos_rol_actualizados").exists()
        r = api("admin").put("/api/v1/roles/admin/permisos/", {"permisos": ["panel.ver"]}, format="json")
        assert r.status_code == 400
