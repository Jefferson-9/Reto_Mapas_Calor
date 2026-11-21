"""Producción: preparado y documentado, no probado en un servidor real (ver DEPLOYMENT.md)."""

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403  (patrón estándar de settings por entorno)
from .base import ALLOWED_HOSTS, SECRET_KEY, TRUSTED_ORIGINS

DEBUG = False
if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS debe listar dominios explícitos en producción")
if not TRUSTED_ORIGINS:
    raise ImproperlyConfigured("DJANGO_TRUSTED_ORIGINS es obligatorio en producción")
if len(SECRET_KEY) < 40 or "reemplaza" in SECRET_KEY:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY no es segura")

REFRESH_COOKIE_SECURE = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

from .base import MIDDLEWARE  # noqa: E402

# WhiteNoise sirve los estáticos de Django (admin/docs) solo en producción
MIDDLEWARE = [MIDDLEWARE[0], MIDDLEWARE[1], "whitenoise.middleware.WhiteNoiseMiddleware", *MIDDLEWARE[2:]]
