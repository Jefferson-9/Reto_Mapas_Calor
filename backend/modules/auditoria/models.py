from django.conf import settings
from django.db import models


class HistorialCambios(models.Model):
    """Historial inmutable (append-only), encadenado por hash SHA-256. Un trigger bloquea UPDATE/DELETE/TRUNCATE."""

    secuencia = models.BigIntegerField(unique=True)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    username = models.CharField(max_length=150, blank=True, default="")
    fecha_hora = models.DateTimeField()
    categoria = models.CharField(max_length=20)
    accion = models.CharField(max_length=60)
    entidad_afectada = models.CharField(max_length=120)
    detalle = models.CharField(max_length=500)
    valor_anterior = models.JSONField(null=True, blank=True)
    valor_nuevo = models.JSONField(null=True, blank=True)
    metadatos = models.JSONField(default=dict, blank=True)
    correlation_id = models.CharField(max_length=64, blank=True, default="")
    prev_hash = models.CharField(max_length=64)
    hash = models.CharField(max_length=64, unique=True)

    class Meta:
        db_table = "historial_cambios"
        indexes = [
            models.Index(fields=["fecha_hora", "id"]),
            models.Index(fields=["categoria", "fecha_hora"]),
            models.Index(fields=["usuario", "fecha_hora"]),
            models.Index(fields=["accion"]),
        ]
