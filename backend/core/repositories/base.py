"""Contratos transversales: unidad de trabajo y puerto de auditoría.

Los servicios dependen de estas interfaces; las implementaciones se inyectan desde `config/container.py`.
"""

import contextlib
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


class IUnitOfWork(ABC):
    @abstractmethod
    def atomic(self):
        """Context manager transaccional: todo o nada."""


class FakeUnitOfWork(IUnitOfWork):
    def atomic(self):
        return contextlib.nullcontext()


@dataclass
class EventoAuditoria:
    categoria: str  # acceso, usuarios, datos, geografia, criterios, campo, analisis, reportes, configuracion
    accion: str
    entidad_afectada: str
    detalle: str
    usuario_id: int | None = None
    username: str = ""
    valor_anterior: dict | None = None
    valor_nuevo: dict | None = None
    metadatos: dict = field(default_factory=dict)


class IAuditoria(ABC):
    @abstractmethod
    def registrar(self, evento: EventoAuditoria) -> dict:
        """Agrega un evento encadenado (append-only)."""


class FakeAuditoria(IAuditoria):
    def __init__(self):
        self.eventos = []

    def registrar(self, evento):
        self.eventos.append(evento)
        return {"secuencia": len(self.eventos)}
