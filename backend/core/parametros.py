"""Servicio de parámetros institucionales (interruptores de funciones condicionadas)."""

from core.exceptions import DomainError
from core.repositories.base import EventoAuditoria

PUBLICOS = [
    "habilitar_registro_visitas", "habilitar_analisis_predictivo", "habilitar_conexion_bd", "habilitar_modo_offline",
    "horas_ventana_offline", "minutos_inactividad_sesion", "tamano_pagina", "max_mb_carga", "max_filas_carga", "max_puntos_mapa",
    "dias_atraso_minimo", "bandas_potencial",
]


class ServicioParametros:
    def __init__(self, repo, auditoria, uow):
        self.repo = repo
        self.auditoria = auditoria
        self.uow = uow

    def todos(self):
        return self.repo.obtener()

    def publicos(self):
        data = self.repo.obtener()
        return {k: data[k] for k in PUBLICOS}

    def valor(self, clave):
        return self.repo.obtener()[clave]

    def actualizar(self, cambios, usuario):
        if "habilitar_conexion_bd" in cambios and cambios["habilitar_conexion_bd"]:
            # RF-005.05 bloqueado: no existe sistema fuente ni credenciales aprobadas.
            raise DomainError(
                "CONEXION_BD_BLOQUEADA",
                "La conexión directa con la base de datos de la cooperativa no está disponible: "
                "requiere aprobación institucional, un sistema fuente y credenciales.",
            )
        if "bandas_potencial" in cambios:
            b = cambios["bandas_potencial"]
            try:
                alto, medio = float(b["alto"]), float(b["medio"])
            except (KeyError, TypeError, ValueError):
                raise DomainError("VALIDACION", "Las bandas requieren valores numéricos 'alto' y 'medio'.") from None
            if not (0 < medio < alto < 1):
                raise DomainError("VALIDACION", "Las bandas deben cumplir 0 < medio < alto < 1.")
            cambios["bandas_potencial"] = {"alto": str(alto), "medio": str(medio)}
        with self.uow.atomic():
            antes = self.repo.obtener()
            despues = self.repo.actualizar(cambios, usuario.id)
            dif_antes = {k: antes[k] for k in cambios}
            dif_despues = {k: despues[k] for k in cambios}
            self.auditoria.registrar(
                EventoAuditoria(
                    categoria="configuracion",
                    accion="parametros_actualizados",
                    entidad_afectada="ParametroSistema",
                    detalle="Actualización de parámetros: " + ", ".join(sorted(cambios)),
                    usuario_id=usuario.id,
                    username=usuario.username,
                    valor_anterior=dif_antes,
                    valor_nuevo=dif_despues,
                )
            )
        return despues
