from django.conf import settings
from django.db import models
from django.db.models import Q


class AsignacionZonaOficial(models.Model):
    oficial = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="asignaciones")
    zona = models.ForeignKey("territorio.Zona", on_delete=models.PROTECT, related_name="asignaciones")
    asignado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    fecha_asignacion = models.DateTimeField(auto_now_add=True)
    activa = models.BooleanField(default=True)
    retirada_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    retirada_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "asignacion_zona_oficial"
        constraints = [
            models.UniqueConstraint(fields=["oficial", "zona"], condition=Q(activa=True), name="asignacion_activa_unica")
        ]


class PosibleSocio(models.Model):
    client_uuid = models.UUIDField(unique=True, null=True, blank=True)
    client_created_at = models.DateTimeField(null=True, blank=True)
    nombre_negocio = models.CharField(max_length=160)
    referencia = models.CharField(max_length=200, blank=True, default="")
    actividad = models.CharField(max_length=120, blank=True, default="")
    ubicacion = models.OneToOneField("territorio.Ubicacion", on_delete=models.PROTECT, related_name="posible_socio")
    zona = models.ForeignKey("territorio.Zona", on_delete=models.PROTECT, related_name="posibles_socios")
    observacion = models.CharField(max_length=500, blank=True, default="")
    registrado_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="prospectos")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "posible_socio"
        indexes = [models.Index(fields=["zona", "created_at"])]


class RutaVisita(models.Model):
    client_uuid = models.UUIDField(unique=True, null=True, blank=True)
    client_created_at = models.DateTimeField(null=True, blank=True)
    nombre = models.CharField(max_length=120)
    oficial = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="rutas")
    fecha_prevista = models.DateField()
    activa = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "ruta_visita"
        indexes = [models.Index(fields=["oficial", "fecha_prevista"])]


class RutaVisitaDetalle(models.Model):
    ruta = models.ForeignKey(RutaVisita, on_delete=models.CASCADE, related_name="detalles")
    orden = models.PositiveIntegerField()
    zona = models.ForeignKey("territorio.Zona", on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "ruta_visita_detalle"
        ordering = ["orden"]
        constraints = [
            models.UniqueConstraint(fields=["ruta", "orden"], name="ruta_orden_unico"),
            models.UniqueConstraint(fields=["ruta", "zona"], name="ruta_zona_unica"),
        ]


class Visita(models.Model):
    """Función condicionada (CU-17/CU-18): solo operable con `habilitar_registro_visitas`."""

    RESULTADOS = [
        ("socio_captado", "Socio captado"),
        ("credito_colocado", "Crédito colocado"),
        ("pago_comprometido", "Pago comprometido"),
        ("interes", "Interés"),
        ("sin_interes", "Sin interés"),
    ]
    client_uuid = models.UUIDField(unique=True, null=True, blank=True)
    client_created_at = models.DateTimeField(null=True, blank=True)
    zona = models.ForeignKey("territorio.Zona", on_delete=models.PROTECT, related_name="visitas")
    oficial = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="visitas")
    ruta = models.ForeignKey(RutaVisita, null=True, blank=True, on_delete=models.PROTECT, related_name="visitas")
    fecha_visita = models.DateField()
    realizada = models.BooleanField(default=True)
    resultado = models.CharField(max_length=20, choices=RESULTADOS, blank=True, default="")
    motivo_no_realizada = models.CharField(max_length=300, blank=True, default="")
    observaciones = models.CharField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "visita"
        indexes = [models.Index(fields=["oficial", "fecha_visita"]), models.Index(fields=["zona", "fecha_visita"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(realizada=False) | ~Q(resultado=""), name="visita_realizada_con_resultado"
            )
        ]
