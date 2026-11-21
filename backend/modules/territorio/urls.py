from django.urls import path

from modules.territorio import views

urlpatterns = [
    path("agencias/", views.AgenciasView.as_view(), name="agencias"),
    path("zonas/", views.ZonasView.as_view(), name="zonas"),
    path("zonas/por-punto/", views.ZonaPorPuntoView.as_view(), name="zona-por-punto"),
    path("zonas/<int:zona_id>/", views.ZonaDetalleView.as_view(), name="zona-detalle"),
]
