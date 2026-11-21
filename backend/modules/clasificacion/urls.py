from django.urls import path

from modules.clasificacion import views

urlpatterns = [
    path("criterios/", views.CriteriosView.as_view(), name="criterios"),
    path("criterios/validar/", views.CriteriosValidarView.as_view(), name="criterios-validar"),
    path("criterios/<int:version_id>/<str:accion>/", views.CriterioAccionView.as_view(), name="criterio-accion"),
    path("clasificacion/", views.ClasificacionView.as_view(), name="clasificacion"),
    path("clasificacion/zonas/<int:zona_id>/", views.ExplicacionView.as_view(), name="clasificacion-explicacion"),
]
