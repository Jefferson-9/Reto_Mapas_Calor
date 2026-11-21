from django.urls import path

from modules.campo import views

urlpatterns = [
    path("asignaciones/", views.AsignacionesView.as_view(), name="asignaciones"),
    path("asignaciones/<int:asig_id>/", views.AsignacionDetalleView.as_view(), name="asignacion-detalle"),
    path("mis-zonas/", views.MisZonasView.as_view(), name="mis-zonas"),
    path("oficiales/<int:oficial_id>/zonas-priorizadas/", views.ListaOficialView.as_view(), name="lista-oficial"),
    path("prospectos/", views.ProspectosView.as_view(), name="prospectos"),
    path("rutas/", views.RutasView.as_view(), name="rutas"),
    path("rutas/sugerir-orden/", views.RutaSugerirView.as_view(), name="rutas-sugerir"),
    path("rutas/<int:ruta_id>/", views.RutaDetalleView.as_view(), name="ruta-detalle"),
    path("visitas/", views.VisitasView.as_view(), name="visitas"),
    path("campo/paquete-offline/", views.PaqueteOfflineView.as_view(), name="paquete-offline"),
    path("campo/sincronizar/", views.SincronizarView.as_view(), name="sincronizar"),
    path("seguimiento/", views.SeguimientoView.as_view(), name="seguimiento"),
    path("seguimiento/zonas/<int:zona_id>/antes-despues/", views.AntesDespuesView.as_view(), name="antes-despues"),
]
