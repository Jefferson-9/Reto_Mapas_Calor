from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.views import APIView

from config.container import servicio_clasificacion, servicio_indicadores
from core.exceptions import DomainError
from core.responses import created, ok
from core.security.permissions import requiere
from core.security.scope import ambito_de
from core.utils.periodos import es_periodo


class ReglaSerializer(serializers.Serializer):
    variable = serializers.CharField(max_length=30)
    operador = serializers.CharField(max_length=6)
    umbral = serializers.JSONField()


class CategoriaSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=80, allow_blank=True)
    color_hex = serializers.CharField(max_length=7)
    prioridad = serializers.IntegerField()
    frecuencia_visita_dias = serializers.IntegerField(required=False, allow_null=True)
    descripcion = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")
    reglas = ReglaSerializer(many=True)


class VersionSerializer(serializers.Serializer):
    nota = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")
    categorias = CategoriaSerializer(many=True)


def periodo_param(request):
    p = request.query_params.get("periodo")
    if p:
        if not es_periodo(p):
            raise DomainError("VALIDACION", "Período no válido (AAAA-MM).")
        return p
    periodos = servicio_indicadores().periodos()
    if not periodos:
        raise DomainError("SIN_DATOS", "Aún no hay períodos con datos cargados.", status=404)
    return periodos[-1]


class CriteriosView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [requiere("criterios.definir")()]
        return [requiere("criterios.definir", "criterios.aprobar", "clasificacion.ver")()]

    @extend_schema(tags=["clasificacion"], responses={200: dict})
    def get(self, request):
        return ok({"items": servicio_clasificacion().versiones()})

    @extend_schema(tags=["clasificacion"], request=VersionSerializer, responses={201: dict})
    def post(self, request):
        ser = VersionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        return created(servicio_clasificacion().crear_version(d["nota"], [dict(c) for c in d["categorias"]], request.user))


class CriteriosValidarView(APIView):
    permission_classes = [requiere("criterios.definir")]

    @extend_schema(tags=["clasificacion"], request=VersionSerializer, responses={200: dict})
    def post(self, request):
        ser = VersionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return ok(servicio_clasificacion().validar([dict(c) for c in ser.validated_data["categorias"]]))


class RechazoSerializer(serializers.Serializer):
    motivo = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class CriterioAccionView(APIView):
    permission_classes = [requiere("criterios.aprobar")]

    @extend_schema(tags=["clasificacion"], request=RechazoSerializer, responses={200: dict})
    def post(self, request, version_id, accion):
        svc = servicio_clasificacion()
        if accion == "aprobar":
            return ok(svc.aprobar(version_id, request.user))
        if accion == "rechazar":
            ser = RechazoSerializer(data=request.data)
            ser.is_valid(raise_exception=True)
            return ok(svc.rechazar(version_id, ser.validated_data["motivo"], request.user))
        raise DomainError("ACCION_INVALIDA", "Acción no válida.", status=404)


class ClasificacionView(APIView):
    permission_classes = [requiere("clasificacion.ver")]

    @extend_schema(tags=["clasificacion"], responses={200: dict})
    def get(self, request):
        cat = request.query_params.get("categoria")
        return ok(servicio_clasificacion().clasificacion(periodo_param(request), ambito_de(request.user),
                                                         int(cat) if cat and cat.isdigit() else None))


class ExplicacionView(APIView):
    permission_classes = [requiere("clasificacion.ver", "zonas.propias")]

    @extend_schema(tags=["clasificacion"], responses={200: dict})
    def get(self, request, zona_id):
        return ok(servicio_clasificacion().explicacion(zona_id, periodo_param(request), ambito_de(request.user)))
