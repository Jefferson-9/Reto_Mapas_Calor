"""Autenticación JWT + sesión de servidor (inactividad y revocación verificadas en cada solicitud)."""

from django.conf import settings
from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from core.exceptions import DomainError


def _fallo(code, message):
    exc = exceptions.AuthenticationFailed(message)
    exc.coac_code = code
    exc.coac_message = message
    return exc


class SesionJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        try:
            result = super().authenticate(request)
        except (InvalidToken, TokenError):
            raise _fallo("TOKEN_INVALIDO", "El token de acceso expiró o no es válido.") from None
        if result is None:
            return None
        user, token = result
        from config.container import servicio_autenticacion

        try:
            servicio_autenticacion().validar_sesion(token.get("sid"), user.id)
        except DomainError as e:
            raise _fallo(e.code, e.message) from None
        return user, token

    def get_user(self, validated_token):
        from modules.usuarios.models import Usuario

        try:
            user = Usuario.objects.select_related("rol", "agencia").get(id=validated_token["user_id"])
        except (Usuario.DoesNotExist, KeyError):
            raise _fallo("SESION_INVALIDA", "La sesión no es válida. Inicie sesión nuevamente.") from None
        if not user.activo:
            # Quien presenta un token firmado de esta cuenta ya conoce la cuenta: el código específico permite que el
            # dispositivo borre sus datos locales (modo sin conexión) sin revelar nada a terceros.
            raise _fallo("USUARIO_DESACTIVADO", "Su cuenta está desactivada. Comuníquese con el administrador.")
        return user


def emitir_tokens(usuario_id, sesion_id):
    """Refresh con rotación y lista de revocación; el access se deriva del refresh y lleva el id de sesión."""
    refresh = RefreshToken()
    refresh["user_id"] = usuario_id
    refresh["sid"] = sesion_id
    access = refresh.access_token
    return str(refresh), str(access)


def rotar_refresh(raw):
    """Valida, revoca el refresh recibido y emite uno nuevo para la misma sesión."""
    token = RefreshToken(raw)  # valida firma, expiración y lista de revocación
    usuario_id, sesion_id = token.get("user_id"), token.get("sid")
    token.blacklist()
    nuevo_refresh, access = emitir_tokens(usuario_id, sesion_id)
    return usuario_id, sesion_id, nuevo_refresh, access


def revocar_refresh(raw):
    try:
        token = RefreshToken(raw)
        token.blacklist()
        return token.get("sid")
    except TokenError:
        return None


def poner_cookie_refresh(response, raw):
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        raw,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite="Strict",
        path=settings.REFRESH_COOKIE_PATH,
    )


def borrar_cookie_refresh(response):
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=settings.REFRESH_COOKIE_PATH, samesite="Strict")
