from urllib.parse import urlparse

from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError

from config.container import servicio_autenticacion, servicio_parametros, servicio_usuarios
from core.exceptions import DomainError, error_body
from core.responses import created, ok
from core.security.permissions import requiere
from core.security.throttles import LoginRateThrottle
from modules.usuarios.authentication import (
    borrar_cookie_refresh,
    emitir_tokens,
    poner_cookie_refresh,
    revocar_refresh,
    rotar_refresh,
)
from modules.usuarios.serializers import (
    LoginSerializer,
    PasswordSerializer,
    PermisosRolSerializer,
    UsuarioActualizarSerializer,
    UsuarioCrearSerializer,
)


def _ip(request):
    return request.META.get("REMOTE_ADDR")


def _sesion_payload(usuario, access):
    return {
        "access": access,
        "usuario": usuario,
        "minutos_inactividad": servicio_parametros().valor("minutos_inactividad_sesion"),
    }


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    @extend_schema(tags=["auth"], request=LoginSerializer, responses={200: dict})
    def post(self, request):
        ser = LoginSerializer(data=request.data)
        if not ser.is_valid():
            # Respuesta genérica también ante datos incompletos (RF-001.02)
            raise DomainError("CREDENCIALES_INVALIDAS", "No fue posible iniciar sesión. Verifique sus datos e intente nuevamente.", status=401)
        res = servicio_autenticacion().iniciar_sesion(
            ser.validated_data["username"], ser.validated_data["password"], _ip(request), request.headers.get("User-Agent", "")
        )
        refresh, access = emitir_tokens(res["usuario"]["id"], res["sesion_id"])
        response = ok(_sesion_payload(res["usuario"], access))
        poner_cookie_refresh(response, refresh)
        return response


class RefreshView(APIView):
    """Renueva el access token. Exige cabecera personalizada y Origin permitido (defensa CSRF)."""

    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(tags=["auth"], request=None, responses={200: dict})
    def post(self, request):
        if request.META.get(settings.REFRESH_HEADER) != "1":
            raise DomainError("SOLICITUD_INVALIDA", "Falta la cabecera de renovación.", status=403)
        origin = request.headers.get("Origin")
        if origin:
            host = urlparse(origin)
            permitido = f"{host.scheme}://{host.netloc}" in settings.TRUSTED_ORIGINS or host.netloc == request.get_host()
            if not permitido:
                raise DomainError("ORIGEN_NO_PERMITIDO", "Origen no permitido.", status=403)
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not raw:
            raise DomainError("SESION_INVALIDA", "No hay una sesión activa.", status=401)
        try:
            usuario_id, sesion_id, nuevo_refresh, access = rotar_refresh(raw)
        except TokenError:
            resp = Response(error_body("SESION_INVALIDA", "La sesión expiró. Inicie sesión nuevamente."), status=401)
            borrar_cookie_refresh(resp)
            return resp
        auth = servicio_autenticacion()
        usuario = auth.usuario_activo(usuario_id)
        auth.validar_sesion(sesion_id, usuario_id, tocar=False)
        response = ok(_sesion_payload(usuario, access))
        poner_cookie_refresh(response, nuevo_refresh)
        return response


class LogoutView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(tags=["auth"], request=None, responses={200: dict})
    def post(self, request):
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        sesion_id = revocar_refresh(raw) if raw else None
        if sesion_id:
            servicio_autenticacion().cerrar_sesion(sesion_id)
        response = ok({"cerrada": True})
        borrar_cookie_refresh(response)
        return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["auth"], responses={200: dict})
    def get(self, request):
        return ok(servicio_usuarios().obtener(request.user.id))


def _bool(v):
    return {"true": True, "1": True, "false": False, "0": False}.get(str(v).lower()) if v is not None else None


class UsuariosView(APIView):
    permission_classes = [requiere("usuarios.gestionar")]

    @extend_schema(tags=["usuarios"], responses={200: dict})
    def get(self, request):
        q = request.query_params
        filtros = {"q": q.get("q", "").strip()[:60], "rol": q.get("rol"), "agencia": q.get("agencia"), "activo": _bool(q.get("activo"))}
        return ok(servicio_usuarios().listar(filtros, q.get("cursor"), q.get("page_size") or servicio_parametros().valor("tamano_pagina")))

    @extend_schema(tags=["usuarios"], request=UsuarioCrearSerializer, responses={201: dict})
    def post(self, request):
        ser = UsuarioCrearSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        datos = dict(ser.validated_data)
        password = datos.pop("password", "")
        return created(servicio_usuarios().crear(datos, password, request.user))


class UsuarioDetalleView(APIView):
    permission_classes = [requiere("usuarios.gestionar")]

    @extend_schema(tags=["usuarios"], responses={200: dict})
    def get(self, request, usuario_id):
        return ok(servicio_usuarios().obtener(usuario_id))

    @extend_schema(tags=["usuarios"], request=UsuarioActualizarSerializer, responses={200: dict})
    def patch(self, request, usuario_id):
        ser = UsuarioActualizarSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        return ok(servicio_usuarios().actualizar(usuario_id, dict(ser.validated_data), request.user))


class UsuarioEstadoView(APIView):
    permission_classes = [requiere("usuarios.gestionar")]

    @extend_schema(tags=["usuarios"], request=None, responses={200: dict})
    def post(self, request, usuario_id, accion):
        svc = servicio_usuarios()
        if accion == "desactivar":
            return ok(svc.desactivar(usuario_id, request.user))
        if accion == "activar":
            return ok(svc.activar(usuario_id, request.user))
        raise DomainError("ACCION_INVALIDA", "Acción no válida.", status=404)


class UsuarioPasswordView(APIView):
    permission_classes = [requiere("usuarios.gestionar")]

    @extend_schema(tags=["usuarios"], request=PasswordSerializer, responses={200: dict})
    def post(self, request, usuario_id):
        ser = PasswordSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return ok(servicio_usuarios().restablecer_password(usuario_id, ser.validated_data["password"], request.user))


class RolesView(APIView):
    permission_classes = [requiere("usuarios.gestionar")]

    @extend_schema(tags=["usuarios"], responses={200: dict})
    def get(self, request):
        svc = servicio_usuarios()
        return ok({"roles": svc.roles(), "permisos": svc.permisos()})


class RolPermisosView(APIView):
    permission_classes = [requiere("usuarios.gestionar")]

    @extend_schema(tags=["usuarios"], request=PermisosRolSerializer, responses={200: dict})
    def put(self, request, codigo):
        ser = PermisosRolSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return ok(servicio_usuarios().actualizar_permisos_rol(codigo, ser.validated_data["permisos"], request.user))


class OficialesView(APIView):
    """Oficiales del ámbito del usuario (para asignaciones y seguimiento)."""

    permission_classes = [requiere("zonas.asignar", "seguimiento.ver", "usuarios.gestionar")]

    @extend_schema(tags=["usuarios"], responses={200: dict})
    def get(self, request):
        return ok({"items": servicio_usuarios().oficiales(request.user.agencia_id)})
