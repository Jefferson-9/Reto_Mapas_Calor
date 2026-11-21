from django.conf import settings
from django.db import models
from django.db.models import Q

TIPOS_CARGA = [("socios", "Socios"), ("creditos", "Créditos"), ("pagos", "Pagos"), ("limites", "Límites geográficos")]


class EsquemaCarga(models.Model):
    """Esquema editable de columnas por tipo de carga (sección 6.3). Versionado: cada cambio crea una versión."""

    tipo = models.CharField(max_length=10, choices=TIPOS_CARGA)
    version = models.PositiveIntegerField()
    vigente = models.BooleanField(default=False)
    # [{campo, etiqueta, tipo_dato, requerido, nucleo, sensible, alias[]}]
    campos = models.JSONField()
    autor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "esquema_carga"
        constraints = [
            models.UniqueConstraint(fields=["tipo", "version"], name="esquema_tipo_version_unico"),
            models.UniqueConstraint(fields=["tipo"], condition=Q(vigente=True), name="esquema_un_vigente_por_tipo"),
        ]


class CargaDatos(models.Model):
    ESTADOS = [
        ("pendiente", "Pendiente"),
        ("validando", "Validando"),
        ("requiere_revision", "Requiere revisión"),
        ("procesando", "Procesando"),
        ("completada", "Completada"),
        ("fallida", "Fallida"),
        ("cancelada", "Cancelada"),
    ]
    esquema = models.ForeignKey(EsquemaCarga, null=True, blank=True, on_delete=models.PROTECT, related_name="cargas")
    nombre_archivo = models.CharField(max_length=160)
    ruta_archivo = models.CharField(max_length=300, blank=True, default="")
    hash_archivo = models.CharField(max_length=64, db_index=True)
    tipo = models.CharField(max_length=10, choices=TIPOS_CARGA)
    periodo = models.CharField(max_length=7, null=True, blank=True)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="cargas")
    leidos = models.PositiveIntegerField(default=0)
    cargados = models.PositiveIntegerField(default=0)
    observados = models.PositiveIntegerField(default=0)
    rechazados = models.PositiveIntegerField(default=0)
    estado = models.CharField(max_length=20, choices=ESTADOS, default="pendiente")
    columnas_archivo = models.JSONField(default=list)
    mapeo = models.JSONField(default=dict)
    faltantes = models.JSONField(default=list)
    resumen = models.JSONField(default=dict)
    mensaje = models.CharField(max_length=300, blank=True, default="")
    reemplazo = models.BooleanField(default=False)
    es_seed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    confirmada_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "carga_datos"
        indexes = [models.Index(fields=["tipo", "periodo", "estado"]), models.Index(fields=["estado", "created_at"])]


class FilaStaging(models.Model):
    """Filas previsualizadas antes de confirmar. Se eliminan al confirmar o cancelar (no son histórico)."""

    carga = models.ForeignKey(CargaDatos, on_delete=models.CASCADE, related_name="staging")
    numero_fila = models.PositiveIntegerField()
    clasificacion = models.CharField(max_length=10)  # valido / observado / rechazado
    datos = models.JSONField()  # normalizados, sin cédula completa
    fila_raw = models.JSONField()  # enmascarada
    motivos = models.JSONField(default=list)

    class Meta:
        db_table = "fila_staging"
        indexes = [models.Index(fields=["carga", "clasificacion", "numero_fila"])]


class Socio(models.Model):
    codigo_socio = models.CharField(max_length=40, unique=True)
    cedula_hash = models.CharField(max_length=64, unique=True)
    cedula_mascara = models.CharField(max_length=20)
    nombre = models.CharField(max_length=160)
    agencia = models.ForeignKey("territorio.Agencia", null=True, blank=True, on_delete=models.PROTECT, related_name="socios")
    zona = models.ForeignKey("territorio.Zona", null=True, blank=True, on_delete=models.PROTECT, related_name="socios")
    ubicacion = models.OneToOneField("territorio.Ubicacion", null=True, blank=True, on_delete=models.PROTECT, related_name="socio")
    rango_ingreso = models.CharField(max_length=40, blank=True, default="")
    fecha_ingreso = models.DateField()
    atributos = models.JSONField(default=dict, blank=True)
    carga = models.ForeignKey(CargaDatos, null=True, blank=True, on_delete=models.PROTECT, related_name="socios")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "socio"
        indexes = [models.Index(fields=["agencia", "zona"]), models.Index(fields=["zona", "fecha_ingreso"])]


class Credito(models.Model):
    ESTADOS = [("vigente", "Vigente"), ("vencido", "Vencido"), ("cancelado", "Cancelado"), ("castigado", "Castigado")]
    codigo_credito = models.CharField(max_length=40, unique=True)
    socio = models.ForeignKey(Socio, on_delete=models.PROTECT, related_name="creditos")
    zona = models.ForeignKey("territorio.Zona", null=True, blank=True, on_delete=models.PROTECT, related_name="creditos")
    monto = models.DecimalField(max_digits=14, decimal_places=2)
    fecha_desembolso = models.DateField()
    plazo_meses = models.PositiveIntegerField()
    estado = models.CharField(max_length=10, choices=ESTADOS)
    atributos = models.JSONField(default=dict, blank=True)
    carga = models.ForeignKey(CargaDatos, null=True, blank=True, on_delete=models.PROTECT, related_name="creditos")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "credito"
        indexes = [models.Index(fields=["zona", "estado", "fecha_desembolso"])]
        constraints = [
            models.CheckConstraint(condition=Q(monto__gt=0), name="credito_monto_positivo"),
            models.CheckConstraint(condition=Q(plazo_meses__gt=0), name="credito_plazo_positivo"),
        ]


class Pago(models.Model):
    credito = models.ForeignKey(Credito, on_delete=models.PROTECT, related_name="pagos")
    periodo = models.CharField(max_length=7)
    fecha_pago = models.DateField(null=True, blank=True)
    valor_pagado = models.DecimalField(max_digits=14, decimal_places=2)
    valor_pendiente = models.DecimalField(max_digits=14, decimal_places=2)
    dias_atraso = models.PositiveIntegerField()
    atributos = models.JSONField(default=dict, blank=True)
    carga = models.ForeignKey(CargaDatos, null=True, blank=True, on_delete=models.PROTECT, related_name="pagos")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pago"
        indexes = [models.Index(fields=["periodo", "dias_atraso"])]
        constraints = [
            models.UniqueConstraint(fields=["credito", "periodo"], name="pago_credito_periodo_unico"),
            models.CheckConstraint(condition=Q(valor_pagado__gte=0, valor_pendiente__gte=0), name="pago_valores_no_negativos"),
        ]


class RegistroObservado(models.Model):
    ESTADOS = [("pendiente", "Pendiente"), ("corregido", "Corregido"), ("descartado", "Descartado"), ("conservado", "Conservado")]
    carga = models.ForeignKey(CargaDatos, on_delete=models.PROTECT, related_name="observados_set")
    tipo = models.CharField(max_length=10, choices=TIPOS_CARGA)
    periodo = models.CharField(max_length=7, null=True, blank=True)
    numero_fila = models.PositiveIntegerField(default=0)
    fila_raw = models.JSONField()  # sin PII completa (cédula enmascarada)
    datos = models.JSONField(default=dict)
    motivos = models.JSONField(default=list)
    estado = models.CharField(max_length=12, choices=ESTADOS, default="pendiente")
    resuelto_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    resolved_at = models.DateTimeField(null=True, blank=True)
    nota = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "registro_observado"
        indexes = [models.Index(fields=["estado", "tipo", "created_at"])]


class IndicadorZonaPeriodo(models.Model):
    """Indicadores precalculados por zona hoja (barrio) y período con datos propios (sección 6.1)."""

    zona = models.ForeignKey("territorio.Zona", on_delete=models.PROTECT, related_name="indicadores")
    periodo = models.CharField(max_length=7)
    total_socios = models.PositiveIntegerField(default=0)
    total_creditos = models.PositiveIntegerField(default=0)
    monto_cartera = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    creditos_atrasados = models.PositiveIntegerField(default=0)
    saldo_vencido = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    tasa_morosidad = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    penetracion_pct = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    ultima_carga_at = models.DateTimeField(null=True, blank=True)
    calculado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "indicador_zona_periodo"
        constraints = [models.UniqueConstraint(fields=["zona", "periodo"], name="indicador_zona_periodo_unico")]
        indexes = [models.Index(fields=["periodo", "zona"])]
