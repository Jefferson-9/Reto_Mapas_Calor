from django.conf import settings
from django.db import models
from django.db.models import Q


class ConfiguracionAnalisis(models.Model):
    """Pesos versionados del puntaje de potencial (RF-021.04). Puntaje ponderado, no aprendizaje automático."""

    version = models.PositiveIntegerField(unique=True)
    pesos = models.JSONField()
    min_periodos = models.PositiveIntegerField(default=3)
    nota = models.CharField(max_length=300, blank=True, default="")
    vigente = models.BooleanField(default=False)
    responsable = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "configuracion_analisis"
        ordering = ["-version"]
        constraints = [models.UniqueConstraint(fields=["vigente"], condition=Q(vigente=True), name="config_analisis_una_vigente")]


class EjecucionAnalisis(models.Model):
    configuracion = models.ForeignKey(ConfiguracionAnalisis, on_delete=models.PROTECT, related_name="ejecuciones")
    periodo = models.CharField(max_length=7)
    nivel = models.CharField(max_length=12)
    ejecutado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    ejecutado_en = models.DateTimeField(auto_now_add=True)
    fecha_datos = models.DateTimeField(null=True, blank=True)
    zonas_evaluadas = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "ejecucion_analisis"
        ordering = ["-ejecutado_en"]


class ResultadoPredictivo(models.Model):
    ejecucion = models.ForeignKey(EjecucionAnalisis, on_delete=models.PROTECT, related_name="resultados")
    zona = models.ForeignKey("territorio.Zona", on_delete=models.PROTECT, related_name="+")
    puntaje = models.DecimalField(max_digits=6, decimal_places=4)
    banda = models.CharField(max_length=6)
    variables = models.JSONField(default=dict)

    class Meta:
        db_table = "resultado_predictivo"
        constraints = [models.UniqueConstraint(fields=["ejecucion", "zona"], name="resultado_ejecucion_zona_unico")]
