from drf_spectacular.utils import extend_schema
from rest_framework.views import APIView

from config.container import auditoria, servicio_parametros
from core.exceptions import DomainError
from core.responses import ok
from core.security.permissions import requiere
from modules.auditoria.services.auditoria import CATEGORIAS


class HistorialView(APIView):
    """RF-006.01/02/04: historial filtrable por fecha, usuario y tipo de acción (solo lectura)."""

    permission_classes = [requiere("historial.ver")]

    @extend_schema(tags=["historial"], responses={200: dict})
    def get(self, request):
        q = request.query_params
        if q.get("categoria") and q["categoria"] not in CATEGORIAS:
            raise DomainError("VALIDACION", "Categoría no válida.")
        filtros = {k: (q.get(k) or "").strip()[:120] or None for k in ("desde", "hasta", "usuario", "categoria", "accion", "entidad")}
        tamano = q.get("page_size") or servicio_parametros().valor("tamano_pagina")
        return ok(auditoria().listar(filtros, q.get("cursor"), tamano))


class HistorialFiltrosView(APIView):
    permission_classes = [requiere("historial.ver")]

    @extend_schema(tags=["historial"], responses={200: dict})
    def get(self, request):
        return ok({"categorias": CATEGORIAS, "acciones": auditoria().acciones()})


class VerificarCadenaView(APIView):
    permission_classes = [requiere("historial.ver")]

    @extend_schema(tags=["historial"], responses={200: dict})
    def get(self, request):
        return ok(auditoria().verificar_cadena())
