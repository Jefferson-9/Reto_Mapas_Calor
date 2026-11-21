"""Errores de dominio y manejador que produce el sobre uniforme de la API."""

import logging

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import exceptions as drf_exc
from rest_framework.response import Response

logger = logging.getLogger("coac.api")


class DomainError(Exception):
    """Error de regla de negocio con código estable y mensaje seguro para el usuario."""

    status_code = 400

    def __init__(self, code, message, details=None, status=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or []
        if status:
            self.status_code = status


class NoEncontrado(DomainError):
    def __init__(self, message="El recurso solicitado no existe o no está en su ámbito."):
        super().__init__("NO_ENCONTRADO", message, status=404)


class SinPermiso(DomainError):
    def __init__(self, message="No tiene permiso para realizar esta acción."):
        super().__init__("SIN_PERMISO", message, status=403)


class FuncionDeshabilitada(DomainError):
    def __init__(self, message, code="FUNCION_DESHABILITADA"):
        super().__init__(code, message, status=403)


def error_body(code, message, details=None, meta=None):
    return {"success": False, "data": None, "meta": meta or {}, "error": {"code": code, "message": message, "details": details or []}}


def _flatten_validation(detail, prefix=""):
    items = []
    if isinstance(detail, dict):
        for key, val in detail.items():
            name = f"{prefix}.{key}" if prefix else str(key)
            items.extend(_flatten_validation(val, "" if key == "non_field_errors" and not prefix else name))
    elif isinstance(detail, list):
        for i, val in enumerate(detail):
            if isinstance(val, (dict, list)):
                items.extend(_flatten_validation(val, f"{prefix}[{i}]"))
            else:
                items.append({"campo": prefix or None, "mensaje": str(val)})
    else:
        items.append({"campo": prefix or None, "mensaje": str(detail)})
    return items


def envelope_exception_handler(exc, context):
    if isinstance(exc, DomainError):
        return Response(error_body(exc.code, exc.message, exc.details), status=exc.status_code)
    if isinstance(exc, Http404):
        exc = drf_exc.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = drf_exc.PermissionDenied()

    if isinstance(exc, drf_exc.ValidationError):
        details = _flatten_validation(exc.detail)
        return Response(
            error_body("VALIDACION", "Revise los datos marcados.", details), status=400
        )
    if isinstance(exc, (drf_exc.NotAuthenticated, drf_exc.AuthenticationFailed)):
        code = getattr(exc, "coac_code", None) or "NO_AUTENTICADO"
        message = getattr(exc, "coac_message", None) or "Debe iniciar sesión."
        resp = Response(error_body(code, message), status=401)
        resp["WWW-Authenticate"] = 'Bearer realm="api"'
        return resp
    if isinstance(exc, drf_exc.PermissionDenied):
        return Response(error_body("SIN_PERMISO", "No tiene permiso para realizar esta acción."), status=403)
    if isinstance(exc, drf_exc.NotFound):
        return Response(error_body("NO_ENCONTRADO", "El recurso solicitado no existe."), status=404)
    if isinstance(exc, drf_exc.Throttled):
        return Response(
            error_body("LIMITE_TASA", "Demasiadas solicitudes. Intente más tarde.", [{"campo": None, "mensaje": f"Espere {exc.wait or 0:.0f} s"}]),
            status=429,
        )
    if isinstance(exc, drf_exc.MethodNotAllowed):
        return Response(error_body("METODO_NO_PERMITIDO", "Método no permitido."), status=405)
    if isinstance(exc, drf_exc.UnsupportedMediaType):
        return Response(error_body("TIPO_NO_SOPORTADO", "Tipo de contenido no soportado."), status=415)
    if isinstance(exc, drf_exc.ParseError):
        return Response(error_body("SOLICITUD_INVALIDA", "La solicitud no se pudo interpretar."), status=400)
    if isinstance(exc, drf_exc.APIException):
        return Response(error_body("ERROR_API", "No se pudo completar la solicitud."), status=exc.status_code)

    logger.exception("Error no controlado en la API")
    return Response(error_body("ERROR_INTERNO", "Ocurrió un error inesperado. Intente nuevamente."), status=500)
