import contextvars
import logging
import re
import uuid

_correlation_id = contextvars.ContextVar("correlation_id", default="-")
_VALID_ID = re.compile(r"^[A-Za-z0-9\-]{8,64}$")


def get_correlation_id():
    return _correlation_id.get()


class CorrelationIdFilter(logging.Filter):
    def filter(self, record):
        record.correlation_id = get_correlation_id()
        return True


class CorrelationIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        incoming = request.headers.get("X-Correlation-ID", "")
        cid = incoming if _VALID_ID.match(incoming) else uuid.uuid4().hex
        token = _correlation_id.set(cid)
        request.correlation_id = cid
        try:
            response = self.get_response(request)
        finally:
            _correlation_id.reset(token)
        response["X-Correlation-ID"] = cid
        return response


class SecurityHeadersMiddleware:
    """Cabeceras seguras para la API: sin caché de respuestas con datos y política restrictiva."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/api/"):
            response.setdefault("Cache-Control", "no-store")
            if not request.path.startswith("/api/v1/docs"):
                response.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        response.setdefault("Permissions-Policy", "geolocation=(self), camera=(), microphone=()")
        response.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        return response
