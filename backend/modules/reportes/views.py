from django.http import HttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.views import APIView

from config.container import servicio_reportes
from core.security.permissions import requiere
from core.security.scope import ambito_de
from core.security.throttles import ReportesRateThrottle


class ReporteSerializer(serializers.Serializer):
    tipo = serializers.CharField(max_length=20)
    nivel = serializers.CharField(max_length=12, default="barrio")
    periodo = serializers.CharField(max_length=7)
    formato = serializers.CharField(max_length=4, default="csv")
    padre = serializers.IntegerField(required=False, allow_null=True)


class ReporteView(APIView):
    """Genera y descarga el reporte. POST para que los filtros no viajen en la URL."""

    permission_classes = [requiere("reportes.generar")]
    throttle_classes = [ReportesRateThrottle]

    @extend_schema(tags=["reportes"], request=ReporteSerializer, responses={(200, "application/octet-stream"): bytes})
    def post(self, request):
        ser = ReporteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        r = servicio_reportes().generar(d["tipo"], d["nivel"], d["periodo"], d["formato"].lower(), d.get("padre"), ambito_de(request.user), request.user)
        resp = HttpResponse(r["contenido"], content_type=r["content_type"])
        resp["Content-Disposition"] = f'attachment; filename="{r["nombre"]}"'
        resp["Cache-Control"] = "no-store"
        return resp
