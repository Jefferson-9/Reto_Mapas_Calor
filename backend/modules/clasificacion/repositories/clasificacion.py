from abc import ABC, abstractmethod

from modules.clasificacion.models import CategoriaClasificacion, PrioridadZona, VersionCriterio


class IClasificacionRepository(ABC):
    @abstractmethod
    def versiones(self) -> list: ...

    @abstractmethod
    def version(self, version_id, bloquear=False) -> dict | None: ...

    @abstractmethod
    def vigente(self) -> dict | None: ...

    @abstractmethod
    def crear_version(self, nota, categorias, autor_id) -> dict: ...

    @abstractmethod
    def cambiar_estado(self, version_id, estado, **extra) -> None: ...

    @abstractmethod
    def reemplazar_prioridades(self, version_id, periodo, filas) -> None: ...

    @abstractmethod
    def prioridades(self, version_id, periodo, zona_ids) -> list: ...


def _version_dto(v):
    return {
        "id": v.id, "version": v.version, "estado": v.estado, "nota": v.nota,
        "creado_por": v.creado_por.username, "created_at": v.created_at,
        "aprobado_por": v.aprobado_por.username if v.aprobado_por_id else None, "aprobado_en": v.aprobado_en,
        "motivo_rechazo": v.motivo_rechazo,
        "categorias": [
            {"id": c.id, "nombre": c.nombre, "color_hex": c.color_hex, "prioridad": c.prioridad, "frecuencia_visita_dias": c.frecuencia_visita_dias,
             "descripcion": c.descripcion, "reglas": c.reglas}
            for c in v.categorias.all()
        ],
    }


def _qs():
    return VersionCriterio.objects.select_related("creado_por", "aprobado_por").prefetch_related("categorias")


class PostgresClasificacionRepository(IClasificacionRepository):
    def versiones(self):
        return [_version_dto(v) for v in _qs().order_by("-version")]

    def version(self, version_id, bloquear=False):
        if bloquear:
            VersionCriterio.objects.select_for_update().filter(id=version_id).first()
        v = _qs().filter(id=version_id).first()
        return _version_dto(v) if v else None

    def vigente(self):
        v = _qs().filter(estado="vigente").first()
        return _version_dto(v) if v else None

    def crear_version(self, nota, categorias, autor_id):
        ultima = VersionCriterio.objects.select_for_update().order_by("-version").first()
        siguiente = (ultima.version if ultima else 0) + 1
        v = VersionCriterio.objects.create(version=siguiente, estado="pendiente", nota=nota[:300], creado_por_id=autor_id)
        CategoriaClasificacion.objects.bulk_create([
            CategoriaClasificacion(version=v, nombre=c["nombre"][:80], color_hex=c["color_hex"], prioridad=c["prioridad"],
                                   frecuencia_visita_dias=c.get("frecuencia_visita_dias"), descripcion=c.get("descripcion", "")[:300],
                                   reglas=[{"variable": r["variable"], "operador": r["operador"], "umbral": r["umbral"]} for r in c["reglas"]])
            for c in categorias
        ])
        return self.version(v.id)

    def cambiar_estado(self, version_id, estado, **extra):
        VersionCriterio.objects.filter(id=version_id).update(estado=estado, **extra)

    def reemplazar_prioridades(self, version_id, periodo, filas):
        PrioridadZona.objects.filter(version_criterio_id=version_id, periodo=periodo).delete()
        PrioridadZona.objects.bulk_create([
            PrioridadZona(zona_id=f["zona_id"], periodo=periodo, version_criterio_id=version_id, categoria_id=f["categoria_id"],
                          nivel_prioridad=f["nivel_prioridad"], motivo_explicacion=f["motivo_explicacion"])
            for f in filas
        ], batch_size=1000)

    def prioridades(self, version_id, periodo, zona_ids):
        qs = PrioridadZona.objects.filter(version_criterio_id=version_id, periodo=periodo)
        if zona_ids is not None:
            qs = qs.filter(zona_id__in=list(zona_ids))
        return list(qs.values("zona_id", "categoria_id", "nivel_prioridad", "motivo_explicacion", "calculado_en"))
