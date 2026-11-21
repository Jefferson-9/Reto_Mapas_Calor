from django.urls import path

from modules.auditoria import views

urlpatterns = [
    path("historial/", views.HistorialView.as_view(), name="historial"),
    path("historial/filtros/", views.HistorialFiltrosView.as_view(), name="historial-filtros"),
    path("historial/verificar/", views.VerificarCadenaView.as_view(), name="historial-verificar"),
]
