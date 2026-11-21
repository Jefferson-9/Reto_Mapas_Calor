from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from core.views import HealthView, ParametrosPublicosView, ParametrosView

api_v1 = [
    path("health/", HealthView.as_view(), name="health"),
    path("parametros/", ParametrosView.as_view(), name="parametros"),
    path("parametros/publicos/", ParametrosPublicosView.as_view(), name="parametros-publicos"),
    path("", include("modules.usuarios.urls")),
    path("", include("modules.territorio.urls")),
    path("", include("modules.cartera.urls")),
    path("", include("modules.clasificacion.urls")),
    path("", include("modules.campo.urls")),
    path("", include("modules.auditoria.urls")),
    path("", include("modules.analitica.urls")),
    path("", include("modules.reportes.urls")),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

urlpatterns = [path("api/v1/", include(api_v1))]
