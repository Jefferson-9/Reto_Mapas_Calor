from rest_framework.throttling import SimpleRateThrottle


class LoginRateThrottle(SimpleRateThrottle):
    scope = "login"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class UsuarioRateThrottle(SimpleRateThrottle):
    def get_cache_key(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return None
        return self.cache_format % {"scope": self.scope, "ident": request.user.pk}


class CargasRateThrottle(UsuarioRateThrottle):
    scope = "cargas"

    def allow_request(self, request, view):
        # Solo cuenta las subidas de archivos (POST de creación)
        if request.method != "POST" or getattr(view, "action_name", "") != "subir":
            return True
        return super().allow_request(request, view)


class ReportesRateThrottle(UsuarioRateThrottle):
    scope = "reportes"


class SincronizacionRateThrottle(UsuarioRateThrottle):
    """Lotes de la cola sin conexión: el cliente reintenta con retroceso exponencial, este límite es solo una red de seguridad."""

    scope = "sincronizacion"
