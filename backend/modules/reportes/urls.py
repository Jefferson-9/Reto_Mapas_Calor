from django.urls import path

from modules.reportes import views

urlpatterns = [path("reportes/", views.ReporteView.as_view(), name="reportes")]
