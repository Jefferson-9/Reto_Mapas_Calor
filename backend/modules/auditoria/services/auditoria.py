"""Servicio de auditoría: implementa el puerto IAuditoria con encadenamiento por hash."""

from core.middleware import get_correlation_id
from core.repositories.base import IAuditoria
from modules.auditoria.services.cadena import GENESIS, calcular_hash, normalizar_json, verificar

CATEGORIAS = ["acceso", "usuarios", "datos", "geografia", "criterios", "campo", "analisis", "reportes", "configuracion"]


class ServicioAuditoria(IAuditoria):
    def __init__(self, repo):
        self.repo = repo

    def registrar(self, evento):
        if evento.categoria not in CATEGORIAS:
            raise ValueError(f"Categoría de auditoría desconocida: {evento.categoria}")

        def construir(secuencia, prev_hash, fecha_hora):
            registro = {
                "secuencia": secuencia,
                "usuario_id": evento.usuario_id,
                "username": evento.username or "",
                "fecha_hora": fecha_hora,
                "categoria": evento.categoria,
                "accion": evento.accion,
                "entidad_afectada": evento.entidad_afectada[:120],
                "detalle": evento.detalle[:500],
                "valor_anterior": normalizar_json(evento.valor_anterior),
                "valor_nuevo": normalizar_json(evento.valor_nuevo),
                "metadatos": normalizar_json(evento.metadatos or {}),
                "correlation_id": get_correlation_id() if get_correlation_id() != "-" else "",
                "prev_hash": prev_hash or GENESIS,
            }
            registro["hash"] = calcular_hash(registro)
            return registro

        return self.repo.agregar(construir)

    def listar(self, filtros, cursor, tamano):
        return self.repo.listar(filtros, cursor, tamano)

    def verificar_cadena(self):
        return verificar(self.repo.iterar_ordenado())

    def acciones(self):
        return sorted(self.repo.acciones_distintas())
