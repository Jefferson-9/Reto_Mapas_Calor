"""Parámetros institucionales del sistema (fila única)."""

from django.db import models


def bandas_por_defecto():
    return {"alto": "0.66", "medio": "0.33"}


class ParametroSistema(models.Model):
    # Interruptores institucionales (todos apagados por defecto)
    habilitar_modo_offline = models.BooleanField(default=False)
    horas_ventana_offline = models.PositiveIntegerField(default=24)
    habilitar_registro_visitas = models.BooleanField(default=False)
    habilitar_analisis_predictivo = models.BooleanField(default=False)
    habilitar_conexion_bd = models.BooleanField(default=False)
    # Sesión y reglas operativas
    minutos_inactividad_sesion = models.PositiveIntegerField(default=15)
    dias_atraso_minimo = models.PositiveIntegerField(default=1)
    bandas_potencial = models.JSONField(default=bandas_por_defecto)
    # Límites de carga
    max_mb_carga = models.PositiveIntegerField(default=20)
    max_filas_carga = models.PositiveIntegerField(default=100_000)
    tamano_lote = models.PositiveIntegerField(default=500)
    decimales_minimos_coordenada = models.PositiveIntegerField(default=4)
    # Listados y mapa
    tamano_pagina = models.PositiveIntegerField(default=15)
    max_puntos_mapa = models.PositiveIntegerField(default=3000)
    actualizado_por = models.ForeignKey(
        "usuarios.Usuario", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "parametro_sistema"
        constraints = [
            models.CheckConstraint(condition=models.Q(id=1), name="parametro_sistema_fila_unica"),
            models.CheckConstraint(
                condition=models.Q(minutos_inactividad_sesion__gte=1, minutos_inactividad_sesion__lte=480),
                name="parametro_inactividad_rango",
            ),
        ]

    @classmethod
    def actual(cls):
        obj, _ = cls.objects.get_or_create(id=1)
        return obj
