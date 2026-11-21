from django.conf import settings
from django.db import models
from django.db.models import Q


class VersionCriterio(models.Model):
    ESTADOS = [("pendiente", "Pendiente"), ("vigente", "Vigente"), ("anterior", "Anterior"), ("rechazada", "Rechazada")]
    version = models.PositiveIntegerField(unique=True)
    estado = models.CharField(max_length=10, choices=ESTADOS, default="pendiente")
    nota = models.CharField(max_length=300, blank=True, default="")
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    aprobado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    aprobado_en = models.DateTimeField(null=True, blank=True)
    motivo_rechazo = models.CharField(max_length=300, blank=True, default="")

    class Meta:
        db_table = "version_criterio"
        ordering = ["-version"]
        constraints = [models.UniqueConstraint(fields=["estado"], condition=Q(estado="vigente"), name="criterio_una_vigente")]


class CategoriaClasificacion(models.Model):
    version = models.ForeignKey(VersionCriterio, on_delete=models.PROTECT, related_name="categorias")
    nombre = models.CharField(max_length=80)
    color_hex = models.CharField(max_length=7)
    prioridad = models.PositiveIntegerField()  # 1 = máxima
    frecuencia_visita_dias = models.PositiveIntegerField(null=True, blank=True)
    descripcion = models.CharField(max_length=300, blank=True, default="")
    # [{variable, operador, umbral}] ; umbral es número o [min, max] para "entre"
    reglas = models.JSONField(default=list)

    class Meta:
        db_table = "categoria_clasificacion"
        ordering = ["prioridad"]
        constraints = [models.UniqueConstraint(fields=["version", "prioridad"], name="categoria_prioridad_unica")]


class PrioridadZona(models.Model):
    zona = models.ForeignKey("territorio.Zona", on_delete=models.PROTECT, related_name="prioridades")
    periodo = models.CharField(max_length=7)
    version_criterio = models.ForeignKey(VersionCriterio, on_delete=models.PROTECT, related_name="prioridades")
    categoria = models.ForeignKey(CategoriaClasificacion, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    nivel_prioridad = models.PositiveIntegerField(null=True, blank=True)
    motivo_explicacion = models.JSONField(default=dict)
    calculado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "prioridad_zona"
        constraints = [
            models.UniqueConstraint(fields=["zona", "periodo", "version_criterio"], name="prioridad_zona_unica")
        ]
        indexes = [models.Index(fields=["periodo", "version_criterio", "nivel_prioridad"])]
