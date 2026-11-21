from django.db import connection
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from config.container import servicio_parametros
from core.exceptions import error_body
from core.responses import ok
from core.security.permissions import requiere


class HealthView(APIView):
    """Comprobación de salud del backend y de la base de datos."""

    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(tags=["sistema"], responses={200: dict})
    def get(self, request):
        try:
            with connection.cursor() as cur:
                cur.execute("SELECT PostGIS_Version()")
                postgis = cur.fetchone()[0]
        except Exception:  # la base no responde: se informa sin detalles internos
            return Response(error_body("BD_NO_DISPONIBLE", "La base de datos no responde."), status=503)
        return ok({"estado": "ok", "postgis": postgis.split(" ")[0]})


class ParametrosPublicosView(APIView):
    """Interruptores y parámetros que la interfaz necesita (cualquier usuario autenticado)."""

    @extend_schema(tags=["sistema"], responses={200: dict})
    def get(self, request):
        return ok(servicio_parametros().publicos())


class ParametrosSerializer(serializers.Serializer):
    habilitar_registro_visitas = serializers.BooleanField(required=False)
    habilitar_analisis_predictivo = serializers.BooleanField(required=False)
    habilitar_conexion_bd = serializers.BooleanField(required=False)
    habilitar_modo_offline = serializers.BooleanField(required=False)
    horas_ventana_offline = serializers.IntegerField(required=False, min_value=1, max_value=168)
    minutos_inactividad_sesion = serializers.IntegerField(required=False, min_value=1, max_value=480)
    dias_atraso_minimo = serializers.IntegerField(required=False, min_value=1, max_value=365)
    max_mb_carga = serializers.IntegerField(required=False, min_value=1, max_value=100)
    max_filas_carga = serializers.IntegerField(required=False, min_value=10, max_value=500_000)
    tamano_lote = serializers.IntegerField(required=False, min_value=50, max_value=5000)
    decimales_minimos_coordenada = serializers.IntegerField(required=False, min_value=0, max_value=8)
    tamano_pagina = serializers.IntegerField(required=False, min_value=5, max_value=100)
    max_puntos_mapa = serializers.IntegerField(required=False, min_value=100, max_value=20000)
    bandas_potencial = serializers.DictField(required=False)


class ParametrosView(APIView):
    permission_classes = [requiere("config.gestionar")]

    @extend_schema(tags=["sistema"], responses={200: dict})
    def get(self, request):
        return ok(servicio_parametros().todos())

    @extend_schema(tags=["sistema"], request=ParametrosSerializer, responses={200: dict})
    def patch(self, request):
        ser = ParametrosSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return ok(servicio_parametros().actualizar(ser.validated_data, request.user))
