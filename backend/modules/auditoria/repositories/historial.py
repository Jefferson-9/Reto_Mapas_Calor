from abc import ABC, abstractmethod

from django.db import connection, transaction
from django.utils import timezone

from core.pagination import cursor_page
from modules.auditoria.models import HistorialCambios

# Clave fija del candado consultivo que serializa la secuencia y el encadenamiento
ADVISORY_LOCK_KEY = 7_420_115


class IHistorialRepository(ABC):
    @abstractmethod
    def agregar(self, construir) -> dict:
        """construir(secuencia, prev_hash, fecha_hora) -> dict con todos los campos y el hash."""

    @abstractmethod
    def listar(self, filtros, cursor, tamano) -> dict: ...

    @abstractmethod
    def iterar_ordenado(self): ...

    @abstractmethod
    def acciones_distintas(self) -> list: ...


def _dto(h):
    return {
        "id": h.id,
        "secuencia": h.secuencia,
        "usuario_id": h.usuario_id,
        "username": h.username,
        "fecha_hora": h.fecha_hora,
        "categoria": h.categoria,
        "accion": h.accion,
        "entidad_afectada": h.entidad_afectada,
        "detalle": h.detalle,
        "valor_anterior": h.valor_anterior,
        "valor_nuevo": h.valor_nuevo,
        "metadatos": h.metadatos,
        "correlation_id": h.correlation_id,
        "prev_hash": h.prev_hash,
        "hash": h.hash,
    }


class PostgresHistorialRepository(IHistorialRepository):
    def agregar(self, construir):
        with transaction.atomic():
            with connection.cursor() as cur:
                cur.execute("SELECT pg_advisory_xact_lock(%s)", [ADVISORY_LOCK_KEY])
            ultimo = HistorialCambios.objects.order_by("-secuencia").values("secuencia", "hash").first()
            secuencia = (ultimo["secuencia"] + 1) if ultimo else 1
            prev_hash = ultimo["hash"] if ultimo else None
            registro = construir(secuencia, prev_hash, timezone.now())
            h = HistorialCambios.objects.create(**registro)
            return _dto(h)

    def listar(self, filtros, cursor, tamano):
        qs = HistorialCambios.objects.all()
        if filtros.get("desde"):
            qs = qs.filter(fecha_hora__date__gte=filtros["desde"])
        if filtros.get("hasta"):
            qs = qs.filter(fecha_hora__date__lte=filtros["hasta"])
        if filtros.get("usuario"):
            qs = qs.filter(username__iexact=filtros["usuario"])
        if filtros.get("categoria"):
            qs = qs.filter(categoria=filtros["categoria"])
        if filtros.get("accion"):
            qs = qs.filter(accion=filtros["accion"])
        if filtros.get("entidad"):
            qs = qs.filter(entidad_afectada__icontains=filtros["entidad"])
        return cursor_page(qs, ["-secuencia"], cursor, tamano, _dto)

    def iterar_ordenado(self):
        for h in HistorialCambios.objects.order_by("secuencia").iterator(chunk_size=2000):
            yield _dto(h)

    def acciones_distintas(self):
        return list(HistorialCambios.objects.order_by().values_list("accion", flat=True).distinct())
