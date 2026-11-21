from decimal import Decimal, InvalidOperation

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.views import APIView

from config.container import servicio_consultas, servicio_parametros, servicio_potencial
from core.exceptions import DomainError
from core.responses import ok
from core.security.permissions import requiere
from core.security.scope import ambito_de
from core.utils.geo import validar_bbox
from modules.analitica.services.calculos import INDICADORES


def _int(v):
    return int(v) if v and str(v).isdigit() else None


class PeriodosView(APIView):
    @extend_schema(tags=["analitica"], responses={200: dict})
    def get(self, request):
        return ok(servicio_consultas().periodos())


class PanelView(APIView):
    permission_classes = [requiere("panel.ver")]

    @extend_schema(tags=["analitica"], responses={200: dict})
    def get(self, request):
        nivel = request.query_params.get("nivel", "barrio")
        if nivel not in ("barrio", "parroquia"):
            nivel = "barrio"
        return ok(servicio_consultas().resumen(ambito_de(request.user), request.query_params.get("periodo"), nivel, _int(request.query_params.get("zona"))))


class IndicadoresView(APIView):
    permission_classes = [requiere("indicadores.ver")]

    @extend_schema(tags=["analitica"], responses={200: dict})
    def get(self, request):
        q = request.query_params
        orden = q.get("orden", "nombre")
        if orden != "nombre" and orden not in INDICADORES:
            raise DomainError("VALIDACION", "Orden no permitido.")
        filtro = None
        if q.get("filtro_campo") in INDICADORES and q.get("filtro_min"):
            try:
                filtro = (q["filtro_campo"], Decimal(q["filtro_min"]))
            except InvalidOperation:
                raise DomainError("VALIDACION", "Valor mínimo no numérico.") from None
        return ok(servicio_consultas().indicadores_por_zona(
            ambito_de(request.user), q.get("periodo"), q.get("nivel", "barrio"), _int(q.get("padre")), orden, q.get("desc") == "1", filtro,
            q.get("cursor"), q.get("page_size") or servicio_parametros().valor("tamano_pagina"),
        ))


class MapaZonasView(APIView):
    permission_classes = [requiere("mapa.ver")]

    @extend_schema(tags=["mapa"], responses={200: dict})
    def get(self, request):
        q = request.query_params
        detalle = q.get("detalle", "media")
        return ok(servicio_consultas().mapa_zonas(ambito_de(request.user), q.get("periodo"), q.get("nivel", "barrio"), _int(q.get("padre")),
                                                  q.get("variable", "total_socios"), q.get("periodo_comparar"), detalle))


class MapaPuntosView(APIView):
    permission_classes = [requiere("mapa.ver")]

    @extend_schema(tags=["mapa"], responses={200: dict})
    def get(self, request):
        q = request.query_params
        return ok(servicio_consultas().puntos(ambito_de(request.user), q.get("tipo", "socios"), validar_bbox(q.get("bbox", ""), 0.6), q.get("periodo")))


class MapaZonaDetalleView(APIView):
    permission_classes = [requiere("mapa.ver", "indicadores.ver")]

    @extend_schema(tags=["mapa"], responses={200: dict})
    def get(self, request, zona_id):
        return ok(servicio_consultas().detalle_zona(ambito_de(request.user), zona_id, request.query_params.get("periodo")))


class CompararView(APIView):
    permission_classes = [requiere("comparar.ver")]

    @extend_schema(tags=["analitica"], responses={200: dict})
    def get(self, request):
        q = request.query_params
        zonas = [int(z) for z in q.get("zonas", "").split(",") if z.strip().isdigit()]
        periodos = [p.strip() for p in q.get("periodos", "").split(",") if p.strip()]
        indicadores = [i.strip() for i in q.get("indicadores", "").split(",") if i.strip()]
        return ok(servicio_consultas().comparar(ambito_de(request.user), zonas, periodos, indicadores))


# ---------- PF-07 (condicionado) ----------
class PotencialEstadoView(APIView):
    permission_classes = [requiere("potencial.ver", "analisis.ejecutar")]

    @extend_schema(tags=["potencial"], responses={200: dict})
    def get(self, request):
        return ok(servicio_potencial().estado())


class PotencialView(APIView):
    permission_classes = [requiere("potencial.ver", "analisis.ejecutar")]

    @extend_schema(tags=["potencial"], responses={200: dict})
    def get(self, request):
        q = request.query_params
        return ok(servicio_potencial().resultados(q.get("periodo"), q.get("nivel"), ambito_de(request.user)))


class PotencialZonaView(APIView):
    permission_classes = [requiere("potencial.ver", "analisis.ejecutar")]

    @extend_schema(tags=["potencial"], responses={200: dict})
    def get(self, request, zona_id):
        q = request.query_params
        return ok(servicio_potencial().detalle(zona_id, q.get("periodo"), q.get("nivel"), ambito_de(request.user)))


class ConfiguracionSerializer(serializers.Serializer):
    pesos = serializers.DictField(child=serializers.CharField(max_length=10))
    min_periodos = serializers.IntegerField()
    nota = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class AnalisisConfiguracionView(APIView):
    permission_classes = [requiere("analisis.ejecutar")]

    @extend_schema(tags=["potencial"], responses={200: dict})
    def get(self, request):
        svc = servicio_potencial()
        return ok({"items": svc.configuraciones(), "ejecuciones": svc.ejecuciones()})

    @extend_schema(tags=["potencial"], request=ConfiguracionSerializer, responses={200: dict})
    def post(self, request):
        ser = ConfiguracionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        return ok(servicio_potencial().guardar_configuracion(d["pesos"], d["min_periodos"], d["nota"], request.user))


class EjecutarSerializer(serializers.Serializer):
    periodo = serializers.CharField(max_length=7)
    nivel = serializers.ChoiceField(choices=["parroquia", "barrio"])


class AnalisisEjecutarView(APIView):
    permission_classes = [requiere("analisis.ejecutar")]

    @extend_schema(tags=["potencial"], request=EjecutarSerializer, responses={200: dict})
    def post(self, request):
        ser = EjecutarSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        return ok(servicio_potencial().ejecutar(d["periodo"], d["nivel"], request.user, ambito_de(request.user)))
