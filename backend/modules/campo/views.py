from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.views import APIView

from config.container import servicio_campo, servicio_parametros, servicio_sincronizacion
from core.exceptions import DomainError
from core.responses import created, ok
from core.security.permissions import requiere
from core.security.scope import ambito_de
from core.security.throttles import SincronizacionRateThrottle
from core.utils.periodos import es_periodo
from modules.clasificacion.views import periodo_param


def _idem(request, datos):
    """La cabecera Idempotency-Key equivale a client_uuid si el cuerpo no lo trae."""
    if not datos.get("client_uuid") and request.headers.get("Idempotency-Key"):
        datos["client_uuid"] = request.headers["Idempotency-Key"]
    return datos


def _pagina(request):
    return request.query_params.get("cursor"), request.query_params.get("page_size") or servicio_parametros().valor("tamano_pagina")


def _int(v):
    return int(v) if v and str(v).isdigit() else None


class AsignarSerializer(serializers.Serializer):
    oficial_id = serializers.IntegerField()
    zona_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False, max_length=200)


class AsignacionesView(APIView):
    permission_classes = [requiere("zonas.asignar")]

    @extend_schema(tags=["campo"], responses={200: dict})
    def get(self, request):
        return ok({"items": servicio_campo().asignaciones(request.user, _int(request.query_params.get("oficial")))})

    @extend_schema(tags=["campo"], request=AsignarSerializer, responses={201: dict})
    def post(self, request):
        ser = AsignarSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        return created({"items": servicio_campo().asignar(d["oficial_id"], d["zona_ids"], ambito_de(request.user), request.user)})


class AsignacionDetalleView(APIView):
    permission_classes = [requiere("zonas.asignar")]

    @extend_schema(tags=["campo"], responses={200: dict})
    def delete(self, request, asig_id):
        return ok(servicio_campo().retirar(asig_id, request.user))


class MisZonasView(APIView):
    permission_classes = [requiere("zonas.propias")]

    @extend_schema(tags=["campo"], responses={200: dict})
    def get(self, request):
        return ok(servicio_campo().mis_zonas(request.user.id, periodo_param(request)))


class ListaOficialView(APIView):
    permission_classes = [requiere("zonas.asignar", "seguimiento.ver")]

    @extend_schema(tags=["campo"], responses={200: dict})
    def get(self, request, oficial_id):
        return ok(servicio_campo().lista_de_oficial(oficial_id, periodo_param(request), request.user))


class ProspectoSerializer(serializers.Serializer):
    client_uuid = serializers.CharField(required=False, allow_blank=True, max_length=40)
    client_created_at = serializers.DateTimeField(required=False, allow_null=True)
    nombre_negocio = serializers.CharField(max_length=160, required=False, allow_blank=True)
    referencia = serializers.CharField(max_length=200, required=False, allow_blank=True)
    actividad = serializers.CharField(max_length=120, required=False, allow_blank=True)
    latitud = serializers.CharField(max_length=20, required=False, allow_blank=True)
    longitud = serializers.CharField(max_length=20, required=False, allow_blank=True)
    direccion = serializers.CharField(max_length=200, required=False, allow_blank=True)
    observacion = serializers.CharField(max_length=500, required=False, allow_blank=True)


class ProspectosView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [requiere("prospectos.registrar")()]
        return [requiere("prospectos.registrar", "mapa.ver")()]

    @extend_schema(tags=["campo"], responses={200: dict})
    def get(self, request):
        ambito = ambito_de(request.user)
        if not ambito.marcadores_individuales:
            raise DomainError("SIN_PERMISO", "Su rol consulta información agregada, no registros individuales.", status=403)
        filtros = {"zona": _int(request.query_params.get("zona")), "q": request.query_params.get("q", "")[:60]}
        return ok(servicio_campo().prospectos(ambito, filtros, *_pagina(request)))

    @extend_schema(tags=["campo"], request=ProspectoSerializer, responses={201: dict})
    def post(self, request):
        ser = ProspectoSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        p, nuevo = servicio_campo().registrar_prospecto(_idem(request, dict(ser.validated_data)), ambito_de(request.user), request.user)
        return created(p) if nuevo else ok(p)


class RutaSerializer(serializers.Serializer):
    client_uuid = serializers.CharField(required=False, allow_blank=True, max_length=40)
    client_created_at = serializers.DateTimeField(required=False, allow_null=True)
    nombre = serializers.CharField(max_length=120, required=False, allow_blank=True)
    fecha_prevista = serializers.DateField(required=False, allow_null=True)
    zona_ids = serializers.ListField(child=serializers.IntegerField(), required=False, max_length=50)
    orden_sugerido = serializers.BooleanField(required=False, default=False)
    activa = serializers.BooleanField(required=False)


class RutasView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [requiere("rutas.gestionar")()]
        return [requiere("rutas.gestionar", "seguimiento.ver", "zonas.asignar")()]

    @extend_schema(tags=["campo"], responses={200: dict})
    def get(self, request):
        return ok({"items": servicio_campo().rutas(request.user, _int(request.query_params.get("oficial")))})

    @extend_schema(tags=["campo"], request=RutaSerializer, responses={201: dict})
    def post(self, request):
        ser = RutaSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        r, nueva = servicio_campo().crear_ruta(_idem(request, dict(ser.validated_data)), request.user, periodo_param(request))
        return created(r) if nueva else ok(r)


class RutaSugerirView(APIView):
    permission_classes = [requiere("rutas.gestionar")]

    @extend_schema(tags=["campo"], request=RutaSerializer, responses={200: dict})
    def post(self, request):
        ser = RutaSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        svc = servicio_campo()
        zona_ids = ser.validated_data.get("zona_ids") or []
        svc._validar_zonas_ruta(zona_ids, request.user)
        return ok({"zona_ids": svc.sugerir_orden(zona_ids, periodo_param(request))})


class RutaDetalleView(APIView):
    def get_permissions(self):
        if self.request.method == "PATCH":
            return [requiere("rutas.gestionar")()]
        return [requiere("rutas.gestionar", "seguimiento.ver", "zonas.asignar")()]

    @extend_schema(tags=["campo"], responses={200: dict})
    def get(self, request, ruta_id):
        return ok(servicio_campo().ruta(ruta_id, request.user))

    @extend_schema(tags=["campo"], request=RutaSerializer, responses={200: dict})
    def patch(self, request, ruta_id):
        ser = RutaSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        return ok(servicio_campo().actualizar_ruta(ruta_id, dict(ser.validated_data), request.user, periodo_param(request)))


class VisitaSerializer(serializers.Serializer):
    client_uuid = serializers.CharField(required=False, allow_blank=True, max_length=40)
    client_created_at = serializers.DateTimeField(required=False, allow_null=True)
    zona_id = serializers.IntegerField(required=False)
    ruta_id = serializers.IntegerField(required=False, allow_null=True)
    fecha_visita = serializers.DateField(required=False, allow_null=True)
    realizada = serializers.BooleanField(required=False, default=True)
    resultado = serializers.CharField(max_length=20, required=False, allow_blank=True)
    motivo_no_realizada = serializers.CharField(max_length=300, required=False, allow_blank=True)
    observaciones = serializers.CharField(max_length=500, required=False, allow_blank=True)


class VisitasView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [requiere("visitas.registrar")()]
        return [requiere("visitas.registrar", "seguimiento.ver")()]

    @extend_schema(tags=["campo"], responses={200: dict})
    def get(self, request):
        q = request.query_params
        filtros = {"desde": q.get("desde"), "hasta": q.get("hasta"), "zona": _int(q.get("zona"))}
        return ok(servicio_campo().visitas(request.user, filtros, *_pagina(request)))

    @extend_schema(tags=["campo"], request=VisitaSerializer, responses={201: dict})
    def post(self, request):
        ser = VisitaSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        v, nueva = servicio_campo().registrar_visita(_idem(request, dict(ser.validated_data)), request.user)
        return created(v) if nueva else ok(v)


class SeguimientoView(APIView):
    permission_classes = [requiere("seguimiento.ver")]

    @extend_schema(tags=["campo"], responses={200: dict})
    def get(self, request):
        q = request.query_params
        desde, hasta = serializers.DateField().to_internal_value(q.get("desde")), serializers.DateField().to_internal_value(q.get("hasta"))
        if desde > hasta:
            raise DomainError("VALIDACION", "La fecha inicial debe ser anterior a la final.")
        return ok(servicio_campo().seguimiento(request.user, _int(q.get("oficial")), desde, hasta))


class AntesDespuesView(APIView):
    permission_classes = [requiere("seguimiento.ver")]

    @extend_schema(tags=["campo"], responses={200: dict})
    def get(self, request, zona_id):
        q = request.query_params
        return ok(servicio_campo().antes_despues(zona_id, q.get("antes", ""), q.get("despues", ""), ambito_de(request.user)))


# ---------- Fase 8: modo campo sin conexión ----------
SERIALIZADORES_COLA = {"prospecto": ProspectoSerializer, "ruta": RutaSerializer, "visita": VisitaSerializer}


class ElementoColaSerializer(serializers.Serializer):
    client_uuid = serializers.UUIDField()
    tipo = serializers.ChoiceField(choices=list(SERIALIZADORES_COLA))
    client_created_at = serializers.DateTimeField(required=False, allow_null=True)
    datos = serializers.DictField()


class LoteSerializer(serializers.Serializer):
    items = serializers.ListField(child=serializers.DictField(), allow_empty=False, max_length=50)


def _validar_elemento(crudo):
    """Valida la forma de un elemento; si es inválido se rechaza solo ese elemento (los demás continúan)."""
    env = ElementoColaSerializer(data=crudo)
    if not env.is_valid():
        cu = str(crudo.get("client_uuid") or "")[:40]
        return {"client_uuid": cu, "tipo": str(crudo.get("tipo") or "")[:20], "rechazo": {
            "codigo": "VALIDACION", "mensaje": "El elemento de la cola está mal formado.",
            "detalles": [{"campo": k, "mensaje": str(v[0]) if isinstance(v, list) else str(v)} for k, v in env.errors.items()]}}
    e = env.validated_data
    item = {"client_uuid": str(e["client_uuid"]), "tipo": e["tipo"], "client_created_at": e.get("client_created_at")}
    datos = SERIALIZADORES_COLA[e["tipo"]](data=e["datos"])
    if not datos.is_valid():
        item["rechazo"] = {"codigo": "VALIDACION", "mensaje": "Revise los datos del registro.",
                           "detalles": [{"campo": k, "mensaje": str(v[0]) if isinstance(v, list) else str(v)} for k, v in datos.errors.items()]}
        return item
    item["datos"] = dict(datos.validated_data)
    if e["tipo"] == "ruta" and es_periodo(str(e["datos"].get("periodo") or "")):
        item["datos"]["periodo"] = e["datos"]["periodo"]
    return item


class PaqueteOfflineView(APIView):
    """Datos mínimos para consultar sin conexión (solo del propio usuario y agregados; sin datos individuales de socios)."""

    permission_classes = [requiere("zonas.propias", "prospectos.registrar", "rutas.gestionar")]

    @extend_schema(tags=["campo"], responses={200: dict})
    def get(self, request):
        return ok(servicio_sincronizacion().paquete(request.user, ambito_de(request.user), periodo_param(request)))


class SincronizarView(APIView):
    """Recibe la cola de salida en orden FIFO y responde por elemento (sincronizado, rechazado o error temporal)."""

    permission_classes = [requiere("prospectos.registrar", "rutas.gestionar", "visitas.registrar")]
    throttle_classes = [SincronizacionRateThrottle]

    @extend_schema(tags=["campo"], request=LoteSerializer, responses={200: dict})
    def post(self, request):
        ser = LoteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        items = [_validar_elemento(i) for i in ser.validated_data["items"]]
        try:
            periodo = periodo_param(request)  # solo lo usa el orden sugerido de rutas
        except DomainError:
            periodo = None
        return ok(servicio_sincronizacion().sincronizar(items, request.user, ambito_de(request.user), periodo))
