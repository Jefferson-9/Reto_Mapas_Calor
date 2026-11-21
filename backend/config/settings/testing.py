from .base import *  # noqa: F403  (patrón estándar de settings por entorno)
from .base import DATABASES, REST_FRAMEWORK

DEBUG = False
REFRESH_COOKIE_SECURE = False
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # solo pruebas: velocidad
PRIVATE_UPLOAD_ROOT = Path("/tmp/coac_test_uploads")  # noqa: F405
# Permite que el *flush* de pruebas transaccionales vacíe la tabla de auditoría con TRUNCATE.
# El trigger sigue bloqueando UPDATE y DELETE siempre (ver SECURITY.md).
DATABASES["default"]["OPTIONS"] = {"options": "-c coac.permitir_purga_pruebas=on"}
DATABASES["default"]["CONN_MAX_AGE"] = 0
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {"login": "1000/min", "cargas": "1000/hour", "reportes": "1000/hour", "sincronizacion": "1000/hour"}
