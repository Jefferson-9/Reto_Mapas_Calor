from django.contrib.gis.db import models


class Agencia(models.Model):
    codigo = models.CharField(max_length=20, unique=True)
    nombre = models.CharField(max_length=120)
    direccion = models.CharField(max_length=200, blank=True, default="")
    ubicacion = models.PointField(srid=4326, null=True, blank=True)
    activa = models.BooleanField(default=True)

    class Meta:
        db_table = "agencia"
        ordering = ["id"]

    def __str__(self):
        return self.nombre


class Zona(models.Model):
    TIPOS = [("provincia", "Provincia"), ("canton", "Cantón"), ("parroquia", "Parroquia"), ("barrio", "Barrio o sector")]
    NIVEL = {"provincia": 1, "canton": 2, "parroquia": 3, "barrio": 4}

    codigo = models.CharField(max_length=40, unique=True)
    nombre = models.CharField(max_length=120)
    tipo_zona = models.CharField(max_length=12, choices=TIPOS)
    zona_superior = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="subzonas")
    # No aplica en provincia/cantón
    agencia = models.ForeignKey(Agencia, null=True, blank=True, on_delete=models.PROTECT, related_name="zonas")
    centroide = models.PointField(srid=4326, null=True, blank=True)
    poligono = models.MultiPolygonField(srid=4326, null=True, blank=True)
    hogares_estimados = models.PositiveIntegerField(null=True, blank=True)
    fuente_oficial = models.CharField(max_length=200, blank=True, default="")
    vigente = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "zona"
        ordering = ["codigo"]
        indexes = [models.Index(fields=["tipo_zona", "vigente"]), models.Index(fields=["agencia", "tipo_zona"])]

    def __str__(self):
        return f"{self.nombre} ({self.tipo_zona})"


class Ubicacion(models.Model):
    # `punto` es la fuente de verdad; latitud/longitud se guardan para formularios y exportaciones.
    punto = models.PointField(srid=4326)
    latitud = models.DecimalField(max_digits=9, decimal_places=6)
    longitud = models.DecimalField(max_digits=9, decimal_places=6)
    direccion = models.CharField(max_length=200, blank=True, default="")
    zona = models.ForeignKey(Zona, null=True, blank=True, on_delete=models.PROTECT, related_name="ubicaciones")
    precision_valida = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ubicacion"
        constraints = [
            models.CheckConstraint(condition=models.Q(latitud__gte=-90, latitud__lte=90), name="ubicacion_lat_rango"),
            models.CheckConstraint(condition=models.Q(longitud__gte=-180, longitud__lte=180), name="ubicacion_lng_rango"),
        ]
