from drf_spectacular.utils import extend_schema
from rest_framework.views import APIView

from config.container import servicio_territorio
from core.exceptions import DomainError
from core.responses import ok
from core.security.permissions import requiere
from core.security.scope import ambito_de
from core.utils.geo import validar_coordenadas


class AgenciasView(APIView):
    @extend_schema(tags=["territorio"], responses={200: dict})
    def get(self, request):
        return ok({"items": servicio_territorio().agencias()})


class ZonasView(APIView):
    """Zonas visibles en el ámbito del usuario (para filtros encadenados Provincia → Cantón → Parroquia → Barrio)."""

    @extend_schema(tags=["territorio"], responses={200: dict})
    def get(self, request):
        tipo = request.query_params.get("tipo")
        if tipo and tipo not in ("provincia", "canton", "parroquia", "barrio"):
            raise DomainError("VALIDACION", "Tipo de zona no válido.")
        padre = request.query_params.get("padre")
        padre_id = int(padre) if padre and padre.isdigit() else None
        items = servicio_territorio().zonas(ambito_de(request.user), tipo=tipo, padre_id=padre_id)
        return ok({"items": items, "next_cursor": None, "has_more": False, "total_count": len(items)})


class ZonaDetalleView(APIView):
    @extend_schema(tags=["territorio"], responses={200: dict})
    def get(self, request, zona_id):
        return ok(servicio_territorio().zona(zona_id, ambito_de(request.user)))


class ZonaPorPuntoView(APIView):
    """Valida si un punto cae dentro de una zona vigente del ámbito (previo a registrar prospectos)."""

    permission_classes = [requiere("prospectos.registrar")]

    @extend_schema(tags=["territorio"], responses={200: dict})
    def get(self, request):
        lat, lng, motivos = validar_coordenadas(request.query_params.get("lat"), request.query_params.get("lng"), 4)
        if lat is None:
            raise DomainError("UBICACION_INVALIDA", motivos[0])
        svc = servicio_territorio()
        zona = svc.zona_de_punto(lat, lng)
        ambito = ambito_de(request.user)
        en_ambito = bool(zona) and zona["id"] in svc.hojas_en_ambito(ambito)
        return ok({"zona": zona if en_ambito else None, "dentro_de_zona": bool(zona), "en_ambito": en_ambito, "advertencias": motivos})
