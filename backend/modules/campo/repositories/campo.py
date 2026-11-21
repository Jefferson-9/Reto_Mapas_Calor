from abc import ABC, abstractmethod

from django.contrib.gis.geos import Polygon
from django.db import connection

from core.pagination import cursor_page
from modules.campo.models import AsignacionZonaOficial, PosibleSocio, RutaVisita, RutaVisitaDetalle, Visita


class ICampoRepository(ABC):
    @abstractmethod
    def zonas_activas(self, oficial_id) -> list: ...

    @abstractmethod
    def asignaciones(self, oficial_ids) -> list: ...

    @abstractmethod
    def asignacion(self, asig_id) -> dict | None: ...

    @abstractmethod
    def crear_asignaciones(self, oficial_id, zona_ids, actor_id) -> list: ...

    @abstractmethod
    def retirar_asignacion(self, asig_id, actor_id, ahora) -> None: ...

    @abstractmethod
    def prospecto_por_uuid(self, client_uuid) -> dict | None: ...

    @abstractmethod
    def crear_prospecto(self, datos) -> dict: ...

    @abstractmethod
    def listar_prospectos(self, zona_ids, filtros, cursor, tamano) -> dict: ...

    @abstractmethod
    def puntos_prospectos(self, zona_ids, bbox, limite) -> list: ...

    @abstractmethod
    def contar_prospectos(self, zona_ids) -> dict: ...

    @abstractmethod
    def ruta_por_uuid(self, client_uuid) -> dict | None: ...

    @abstractmethod
    def crear_ruta(self, datos, zona_ids) -> dict: ...

    @abstractmethod
    def ruta(self, ruta_id) -> dict | None: ...

    @abstractmethod
    def rutas(self, oficial_ids, solo_activas=True) -> list: ...

    @abstractmethod
    def actualizar_ruta(self, ruta_id, cambios, zona_ids=None) -> dict: ...

    @abstractmethod
    def visita_por_uuid(self, client_uuid) -> dict | None: ...

    @abstractmethod
    def crear_visita(self, datos) -> dict: ...

    @abstractmethod
    def listar_visitas(self, oficial_ids, filtros, cursor, tamano) -> dict: ...

    @abstractmethod
    def previstas_y_realizadas(self, oficial_ids, desde, hasta) -> dict: ...

    @abstractmethod
    def sincronizar_zonas_prospectos(self) -> int: ...


def _asig_dto(a):
    return {"id": a.id, "oficial_id": a.oficial_id, "oficial": a.oficial.nombre_completo, "zona_id": a.zona_id, "zona": a.zona.nombre,
            "zona_codigo": a.zona.codigo, "asignado_por": a.asignado_por.username, "fecha_asignacion": a.fecha_asignacion, "activa": a.activa}


def _prospecto_dto(p):
    return {"id": p.id, "client_uuid": p.client_uuid, "nombre_negocio": p.nombre_negocio, "referencia": p.referencia, "actividad": p.actividad,
            "latitud": str(p.ubicacion.latitud), "longitud": str(p.ubicacion.longitud), "direccion": p.ubicacion.direccion,
            "zona_id": p.zona_id, "zona": p.zona.nombre, "observacion": p.observacion, "registrado_por": p.registrado_por.username,
            "registrado_por_id": p.registrado_por_id, "created_at": p.created_at, "client_created_at": p.client_created_at}


def _ruta_dto(r):
    return {"id": r.id, "client_uuid": r.client_uuid, "nombre": r.nombre, "oficial_id": r.oficial_id, "oficial": r.oficial.nombre_completo,
            "fecha_prevista": r.fecha_prevista, "activa": r.activa, "created_at": r.created_at, "updated_at": r.updated_at,
            "detalles": [{"orden": d.orden, "zona_id": d.zona_id, "zona": d.zona.nombre, "zona_codigo": d.zona.codigo,
                          "centroide": [d.zona.centroide.x, d.zona.centroide.y] if d.zona.centroide else None} for d in r.detalles.all()]}


def _visita_dto(v):
    return {"id": v.id, "client_uuid": v.client_uuid, "zona_id": v.zona_id, "zona": v.zona.nombre, "oficial_id": v.oficial_id,
            "oficial": v.oficial.nombre_completo, "ruta_id": v.ruta_id, "ruta": v.ruta.nombre if v.ruta_id else None,
            "fecha_visita": v.fecha_visita, "realizada": v.realizada, "resultado": v.resultado, "motivo_no_realizada": v.motivo_no_realizada,
            "observaciones": v.observaciones, "created_at": v.created_at, "client_created_at": v.client_created_at}


class PostgresCampoRepository(ICampoRepository):
    def zonas_activas(self, oficial_id):
        return list(AsignacionZonaOficial.objects.filter(oficial_id=oficial_id, activa=True).values_list("zona_id", flat=True))

    def asignaciones(self, oficial_ids):
        qs = AsignacionZonaOficial.objects.select_related("oficial", "zona", "asignado_por").filter(activa=True)
        if oficial_ids is not None:
            qs = qs.filter(oficial_id__in=list(oficial_ids))
        return [_asig_dto(a) for a in qs.order_by("oficial__nombre_completo", "zona__nombre")]

    def asignacion(self, asig_id):
        a = AsignacionZonaOficial.objects.select_related("oficial", "zona", "asignado_por").filter(id=asig_id).first()
        return _asig_dto(a) if a else None

    def crear_asignaciones(self, oficial_id, zona_ids, actor_id):
        existentes = set(self.zonas_activas(oficial_id))
        nuevas = [z for z in zona_ids if z not in existentes]
        AsignacionZonaOficial.objects.bulk_create([AsignacionZonaOficial(oficial_id=oficial_id, zona_id=z, asignado_por_id=actor_id) for z in nuevas])
        return nuevas

    def retirar_asignacion(self, asig_id, actor_id, ahora):
        AsignacionZonaOficial.objects.filter(id=asig_id, activa=True).update(activa=False, retirada_por_id=actor_id, retirada_en=ahora)

    def prospecto_por_uuid(self, client_uuid):
        p = PosibleSocio.objects.select_related("ubicacion", "zona", "registrado_por").filter(client_uuid=client_uuid).first()
        return _prospecto_dto(p) if p else None

    def crear_prospecto(self, datos):
        p = PosibleSocio.objects.create(**datos)
        return _prospecto_dto(PosibleSocio.objects.select_related("ubicacion", "zona", "registrado_por").get(id=p.id))

    def listar_prospectos(self, zona_ids, filtros, cursor, tamano):
        qs = PosibleSocio.objects.select_related("ubicacion", "zona", "registrado_por").filter(zona_id__in=list(zona_ids))
        if filtros.get("zona"):
            qs = qs.filter(zona_id=filtros["zona"])
        if filtros.get("q"):
            qs = qs.filter(nombre_negocio__icontains=filtros["q"])
        return cursor_page(qs, ["-created_at"], cursor, tamano, _prospecto_dto)

    def puntos_prospectos(self, zona_ids, bbox, limite):
        qs = PosibleSocio.objects.filter(zona_id__in=list(zona_ids))
        if bbox:
            qs = qs.filter(ubicacion__punto__within=Polygon.from_bbox(bbox))
        return [{"id": p["id"], "nombre": p["nombre_negocio"], "lng": p["ubicacion__punto"].x, "lat": p["ubicacion__punto"].y, "zona_id": p["zona_id"]}
                for p in qs.values("id", "nombre_negocio", "ubicacion__punto", "zona_id")[:limite]]

    def contar_prospectos(self, zona_ids):
        from django.db.models import Count

        return dict(PosibleSocio.objects.filter(zona_id__in=list(zona_ids)).values("zona_id").annotate(n=Count("id")).values_list("zona_id", "n"))

    def ruta_por_uuid(self, client_uuid):
        r = RutaVisita.objects.select_related("oficial").prefetch_related("detalles__zona").filter(client_uuid=client_uuid).first()
        return _ruta_dto(r) if r else None

    def crear_ruta(self, datos, zona_ids):
        r = RutaVisita.objects.create(**datos)
        RutaVisitaDetalle.objects.bulk_create([RutaVisitaDetalle(ruta=r, orden=i + 1, zona_id=z) for i, z in enumerate(zona_ids)])
        return self.ruta(r.id)

    def ruta(self, ruta_id):
        r = RutaVisita.objects.select_related("oficial").prefetch_related("detalles__zona").filter(id=ruta_id).first()
        return _ruta_dto(r) if r else None

    def rutas(self, oficial_ids, solo_activas=True):
        qs = RutaVisita.objects.select_related("oficial").prefetch_related("detalles__zona")
        if oficial_ids is not None:
            qs = qs.filter(oficial_id__in=list(oficial_ids))
        if solo_activas:
            qs = qs.filter(activa=True)
        return [_ruta_dto(r) for r in qs.order_by("-fecha_prevista", "-id")[:200]]

    def actualizar_ruta(self, ruta_id, cambios, zona_ids=None):
        if cambios:
            RutaVisita.objects.filter(id=ruta_id).update(**cambios)
        if zona_ids is not None:
            RutaVisitaDetalle.objects.filter(ruta_id=ruta_id).delete()
            RutaVisitaDetalle.objects.bulk_create([RutaVisitaDetalle(ruta_id=ruta_id, orden=i + 1, zona_id=z) for i, z in enumerate(zona_ids)])
        return self.ruta(ruta_id)

    def visita_por_uuid(self, client_uuid):
        v = Visita.objects.select_related("zona", "oficial", "ruta").filter(client_uuid=client_uuid).first()
        return _visita_dto(v) if v else None

    def crear_visita(self, datos):
        v = Visita.objects.create(**datos)
        return _visita_dto(Visita.objects.select_related("zona", "oficial", "ruta").get(id=v.id))

    def listar_visitas(self, oficial_ids, filtros, cursor, tamano):
        qs = Visita.objects.select_related("zona", "oficial", "ruta")
        if oficial_ids is not None:
            qs = qs.filter(oficial_id__in=list(oficial_ids))
        if filtros.get("desde"):
            qs = qs.filter(fecha_visita__gte=filtros["desde"])
        if filtros.get("hasta"):
            qs = qs.filter(fecha_visita__lte=filtros["hasta"])
        if filtros.get("zona"):
            qs = qs.filter(zona_id=filtros["zona"])
        return cursor_page(qs, ["-fecha_visita"], cursor, tamano, _visita_dto)

    def previstas_y_realizadas(self, oficial_ids, desde, hasta):
        det = RutaVisitaDetalle.objects.select_related("ruta__oficial", "zona").filter(ruta__activa=True, ruta__fecha_prevista__range=(desde, hasta))
        vis = Visita.objects.filter(fecha_visita__range=(desde, hasta))
        if oficial_ids is not None:
            det = det.filter(ruta__oficial_id__in=list(oficial_ids))
            vis = vis.filter(oficial_id__in=list(oficial_ids))
        previstas = [{"ruta_id": d.ruta_id, "ruta": d.ruta.nombre, "oficial_id": d.ruta.oficial_id, "oficial": d.ruta.oficial.nombre_completo,
                      "zona_id": d.zona_id, "zona": d.zona.nombre, "fecha_prevista": d.ruta.fecha_prevista} for d in det]
        visitas = list(vis.values("id", "ruta_id", "zona_id", "oficial_id", "fecha_visita", "realizada", "resultado"))
        return {"previstas": previstas, "visitas": visitas}

    def oficial(self, usuario_id):
        """Datos mínimos de un usuario para validar asignaciones (vía AUTH_USER_MODEL, sin acoplarse al módulo usuarios)."""
        from django.contrib.auth import get_user_model

        u = get_user_model().objects.select_related("rol").filter(id=usuario_id).first()
        if not u:
            return None
        return {"id": u.id, "nombre": u.nombre_completo, "activo": u.activo, "agencia_id": u.agencia_id,
                "es_oficial": u.tiene_permiso("zonas.propias")}

    def oficiales_de_agencia(self, agencia_id):
        from django.contrib.auth import get_user_model

        qs = get_user_model().objects.filter(rol__permisos__codigo="zonas.propias").distinct()
        if agencia_id is not None:
            qs = qs.filter(agencia_id=agencia_id)
        return list(qs.values_list("id", flat=True))

    def sincronizar_zonas_prospectos(self):
        with connection.cursor() as cur:
            cur.execute("UPDATE posible_socio p SET zona_id = u.zona_id FROM ubicacion u WHERE p.ubicacion_id = u.id "
                        "AND u.zona_id IS NOT NULL AND p.zona_id IS DISTINCT FROM u.zona_id")
            return cur.rowcount
