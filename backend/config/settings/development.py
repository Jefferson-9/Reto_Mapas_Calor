from .base import *  # noqa: F403  (patrón estándar de settings por entorno)

DEBUG = True
# En desarrollo el proxy de Vite sirve frontend y API desde el mismo origen (http)
REFRESH_COOKIE_SECURE = False
