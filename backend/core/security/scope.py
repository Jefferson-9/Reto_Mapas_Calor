"""Ámbito de datos del usuario: agencia (o toda la cooperativa) y, para oficiales, sus zonas asignadas.

El proveedor de zonas asignadas lo registra el módulo `campo` al iniciar (evita dependencias de core hacia módulos).
"""

from dataclasses import dataclass

from core.security.permissions import ROLES_MARCADORES_INDIVIDUALES

_proveedor_zonas_asignadas = None


def registrar_proveedor_zonas_asignadas(fn):
    global _proveedor_zonas_asignadas
    _proveedor_zonas_asignadas = fn


@dataclass(frozen=True)
class Ambito:
    usuario_id: int
    agencia_id: int | None  # None = toda la cooperativa
    zonas_asignadas: frozenset | None  # None = sin restricción por asignación
    marcadores_individuales: bool

    @property
    def es_cooperativa(self):
        return self.agencia_id is None and self.zonas_asignadas is None


def ambito_de(user):
    zonas = None
    if user.tiene_permiso("zonas.propias"):
        zonas = frozenset(_proveedor_zonas_asignadas(user.id)) if _proveedor_zonas_asignadas else frozenset()
    return Ambito(
        usuario_id=user.id,
        agencia_id=user.agencia_id,
        zonas_asignadas=zonas,
        marcadores_individuales=getattr(user, "rol_codigo", None) in ROLES_MARCADORES_INDIVIDUALES,
    )
