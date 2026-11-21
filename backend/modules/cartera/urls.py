from django.urls import path

from modules.cartera import views

urlpatterns = [
    path("cargas/", views.CargasView.as_view(), name="cargas"),
    path("cargas/conexion-bd/", views.ConexionBDView.as_view(), name="conexion-bd"),
    path("cargas/<int:carga_id>/", views.CargaDetalleView.as_view(), name="carga-detalle"),
    path("cargas/<int:carga_id>/mapeo/", views.CargaMapeoView.as_view(), name="carga-mapeo"),
    path("cargas/<int:carga_id>/errores.csv", views.CargaErroresView.as_view(), name="carga-errores"),
    path("cargas/<int:carga_id>/<str:accion>/", views.CargaAccionView.as_view(), name="carga-accion"),
    path("esquemas/<str:tipo>/", views.EsquemasView.as_view(), name="esquemas"),
    path("esquemas/<str:tipo>/editar/", views.EsquemaEditarView.as_view(), name="esquema-editar"),
    path("esquemas/<str:tipo>/plantilla.csv", views.PlantillaView.as_view(), name="plantilla"),
    path("observados/", views.ObservadosView.as_view(), name="observados"),
    path("observados/resumen/", views.ObservadosResumenView.as_view(), name="observados-resumen"),
    path("observados/<int:obs_id>/<str:accion>/", views.ObservadoAccionView.as_view(), name="observado-accion"),
    path("limites/", views.LimitesView.as_view(), name="limites"),
    path("limites/<int:carga_id>/", views.LimiteDetalleView.as_view(), name="limite-detalle"),
    path("limites/<int:carga_id>/<str:accion>/", views.LimitesAccionView.as_view(), name="limites-accion"),
]
