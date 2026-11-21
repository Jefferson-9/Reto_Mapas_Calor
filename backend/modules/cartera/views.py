import csv

from django.http import HttpResponse, StreamingHttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.views import APIView

from config.container import (
    servicio_cargas,
    servicio_esquemas,
    servicio_limites,
    servicio_observados,
    servicio_parametros,
)
from core.exceptions import DomainError
from core.responses import created, ok
from core.security.permissions import requiere
from core.security.throttles import CargasRateThrottle
from core.utils.texto import nombre_archivo_seguro


def _pagina(request):
    return request.query_params.get("cursor"), request.query_params.get("page_size") or servicio_parametros().valor("tamano_pagina")


class SubirCargaSerializer(serializers.Serializer):
    archivo = serializers.FileField()
    tipo = serializers.CharField(max_length=10)
    periodo = serializers.CharField(max_length=7)
    reemplazo = serializers.BooleanField(required=False, default=False)


class CargasView(APIView):
    permission_classes = [requiere("datos.cargar")]
    throttle_classes = [CargasRateThrottle]
    action_name = "subir"

    @extend_schema(tags=["cargas"], responses={200: dict})
    def get(self, request):
        q = request.query_params
        filtros = {k: q.get(k) for k in ("tipo", "periodo", "estado", "usuario", "desde", "hasta")}
        return ok(servicio_cargas().listar(filtros, *_pagina(request)))

    @extend_schema(tags=["cargas"], request={"multipart/form-data": SubirCargaSerializer}, responses={201: dict})
    def post(self, request):
        ser = SubirCargaSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        nombre = nombre_archivo_seguro(d["archivo"].name)
        return created(servicio_cargas().subir(d["archivo"], nombre, d["tipo"], d["periodo"], d["reemplazo"], request.user))


class CargaDetalleView(APIView):
    """Detalle de una carga (RF-006.03). Lectura permitida a quien carga o consulta el historial."""

    permission_classes = [requiere("datos.cargar", "historial.ver")]

    @extend_schema(tags=["cargas"], responses={200: dict})
    def get(self, request, carga_id):
        return ok(servicio_cargas().obtener(carga_id))


class MapeoSerializer(serializers.Serializer):
    mapeo = serializers.DictField(child=serializers.CharField(allow_blank=True, max_length=120))
    guardar_alias = serializers.BooleanField(required=False, default=False)


class CargaMapeoView(APIView):
    permission_classes = [requiere("datos.cargar")]

    @extend_schema(tags=["cargas"], request=MapeoSerializer, responses={200: dict})
    def put(self, request, carga_id):
        ser = MapeoSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return ok(servicio_cargas().remapear(carga_id, ser.validated_data["mapeo"], ser.validated_data["guardar_alias"], request.user))


class CargaAccionView(APIView):
    permission_classes = [requiere("datos.cargar")]

    @extend_schema(tags=["cargas"], request=None, responses={200: dict})
    def post(self, request, carga_id, accion):
        svc = servicio_cargas()
        if accion == "confirmar":
            return ok(svc.confirmar(carga_id, request.user))
        if accion == "cancelar":
            return ok(svc.cancelar(carga_id, request.user))
        raise DomainError("ACCION_INVALIDA", "Acción no válida.", status=404)


class _Echo:
    def write(self, value):
        return value


class CargaErroresView(APIView):
    """Descarga de errores: fila, campo y motivo (sin datos innecesarios)."""

    permission_classes = [requiere("datos.cargar", "datos.validar")]

    @extend_schema(tags=["cargas"], responses={(200, "text/csv"): str})
    def get(self, request, carga_id):
        filas = servicio_cargas().errores(carga_id)
        w = csv.writer(_Echo())

        def gen():
            yield "﻿" + w.writerow(["fila", "clasificacion", "campo", "motivo"])
            for f in filas:
                yield w.writerow([f["fila"], f["clasificacion"], f["campo"] or "", f["motivo"]])

        resp = StreamingHttpResponse(gen(), content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="errores_carga_{carga_id}.csv"'
        return resp


class EsquemasView(APIView):
    def get_permissions(self):
        return [requiere("datos.cargar", "config.gestionar")()]

    @extend_schema(tags=["esquemas"], responses={200: dict})
    def get(self, request, tipo):
        svc = servicio_esquemas()
        return ok({"vigente": svc.vigente(tipo), "versiones": svc.versiones(tipo)})


class CampoEsquemaSerializer(serializers.Serializer):
    campo = serializers.CharField(max_length=40)
    etiqueta = serializers.CharField(max_length=80)
    tipo_dato = serializers.CharField(max_length=10)
    requerido = serializers.BooleanField(default=False)
    nucleo = serializers.BooleanField(default=False)
    sensible = serializers.BooleanField(default=False)
    alias = serializers.ListField(child=serializers.CharField(max_length=60), required=False, default=list)


class EsquemaActualizarSerializer(serializers.Serializer):
    campos = CampoEsquemaSerializer(many=True)


class EsquemaEditarView(APIView):
    permission_classes = [requiere("config.gestionar")]

    @extend_schema(tags=["esquemas"], request=EsquemaActualizarSerializer, responses={200: dict})
    def put(self, request, tipo):
        if tipo not in ("socios", "creditos", "pagos", "limites"):
            raise DomainError("NO_ENCONTRADO", "Tipo de esquema no válido.", status=404)
        ser = EsquemaActualizarSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return ok(servicio_esquemas().actualizar(tipo, ser.validated_data["campos"], request.user))


class PlantillaView(APIView):
    permission_classes = [requiere("datos.cargar")]

    @extend_schema(tags=["esquemas"], responses={(200, "text/csv"): str})
    def get(self, request, tipo):
        if tipo not in ("socios", "creditos", "pagos"):
            raise DomainError("NO_ENCONTRADO", "Tipo no válido.", status=404)
        resp = HttpResponse(servicio_esquemas().plantilla(tipo), content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="plantilla_{tipo}.csv"'
        return resp


class ObservadosView(APIView):
    permission_classes = [requiere("datos.validar")]

    @extend_schema(tags=["observados"], responses={200: dict})
    def get(self, request):
        q = request.query_params
        filtros = {k: q.get(k) for k in ("estado", "tipo", "periodo", "carga")}
        return ok(servicio_observados().listar(filtros, *_pagina(request)))


class ObservadosResumenView(APIView):
    permission_classes = [requiere("datos.validar", "datos.cargar")]

    @extend_schema(tags=["observados"], responses={200: dict})
    def get(self, request):
        return ok(servicio_observados().resumen())


class ResolverSerializer(serializers.Serializer):
    nota = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")
    datos = serializers.DictField(child=serializers.CharField(allow_blank=True, max_length=200), required=False, default=dict)


class ObservadoAccionView(APIView):
    permission_classes = [requiere("datos.validar")]

    @extend_schema(tags=["observados"], request=ResolverSerializer, responses={200: dict})
    def post(self, request, obs_id, accion):
        ser = ResolverSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        svc, d = servicio_observados(), ser.validated_data
        if accion == "corregir":
            return ok(svc.corregir(obs_id, d["datos"], d["nota"], request.user))
        if accion == "descartar":
            return ok(svc.descartar(obs_id, d["nota"], request.user))
        if accion == "conservar":
            return ok(svc.conservar(obs_id, d["nota"], request.user))
        raise DomainError("ACCION_INVALIDA", "Acción no válida.", status=404)


class SubirLimitesSerializer(serializers.Serializer):
    archivo = serializers.FileField()


class LimitesView(APIView):
    permission_classes = [requiere("limites.gestionar")]

    @extend_schema(tags=["limites"], responses={200: dict})
    def get(self, request):
        return ok(servicio_limites().listar(*_pagina(request)))

    @extend_schema(tags=["limites"], request={"multipart/form-data": SubirLimitesSerializer}, responses={201: dict})
    def post(self, request):
        ser = SubirLimitesSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        archivo = ser.validated_data["archivo"]
        return created(servicio_limites().subir(archivo, nombre_archivo_seguro(archivo.name), request.user))


class ConfirmarLimitesSerializer(serializers.Serializer):
    retirar_ausentes = serializers.BooleanField(required=False, default=False)


class LimitesAccionView(APIView):
    permission_classes = [requiere("limites.gestionar")]

    @extend_schema(tags=["limites"], request=ConfirmarLimitesSerializer, responses={200: dict})
    def post(self, request, carga_id, accion):
        svc = servicio_limites()
        if accion == "confirmar":
            ser = ConfirmarLimitesSerializer(data=request.data)
            ser.is_valid(raise_exception=True)
            return ok(svc.confirmar(carga_id, ser.validated_data["retirar_ausentes"], request.user))
        if accion == "cancelar":
            return ok(svc.cancelar(carga_id, request.user))
        raise DomainError("ACCION_INVALIDA", "Acción no válida.", status=404)


class LimiteDetalleView(APIView):
    permission_classes = [requiere("limites.gestionar")]

    @extend_schema(tags=["limites"], responses={200: dict})
    def get(self, request, carga_id):
        return ok(servicio_limites().obtener(carga_id))


class ConexionBDView(APIView):
    """RF-005.05: opción visible pero bloqueada (sin sistema fuente ni credenciales aprobadas)."""

    permission_classes = [requiere("datos.cargar")]

    @extend_schema(tags=["cargas"], responses={200: dict})
    def get(self, request):
        habilitada = servicio_parametros().valor("habilitar_conexion_bd")
        return ok({"habilitada": habilitada, "estado": "Bloqueado",
                   "motivo": "La conexión directa con la base de datos de la cooperativa requiere su aprobación, un sistema fuente y "
                             "credenciales. No se ha implementado la conexión real en esta versión."})
