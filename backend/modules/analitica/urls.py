from django.urls import path

from modules.analitica import views

urlpatterns = [
    path("periodos/", views.PeriodosView.as_view(), name="periodos"),
    path("panel/", views.PanelView.as_view(), name="panel"),
    path("indicadores/", views.IndicadoresView.as_view(), name="indicadores"),
    path("comparar/", views.CompararView.as_view(), name="comparar"),
    path("mapa/zonas/", views.MapaZonasView.as_view(), name="mapa-zonas"),
    path("mapa/puntos/", views.MapaPuntosView.as_view(), name="mapa-puntos"),
    path("mapa/zonas/<int:zona_id>/", views.MapaZonaDetalleView.as_view(), name="mapa-zona-detalle"),
    path("potencial/estado/", views.PotencialEstadoView.as_view(), name="potencial-estado"),
    path("potencial/", views.PotencialView.as_view(), name="potencial"),
    path("potencial/zonas/<int:zona_id>/", views.PotencialZonaView.as_view(), name="potencial-zona"),
    path("analisis/configuracion/", views.AnalisisConfiguracionView.as_view(), name="analisis-configuracion"),
    path("analisis/ejecutar/", views.AnalisisEjecutarView.as_view(), name="analisis-ejecutar"),
]
