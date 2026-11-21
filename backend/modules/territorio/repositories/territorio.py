import json
from abc import ABC, abstractmethod

from django.contrib.gis.gdal.error import GDALException
from django.contrib.gis.geos import GEOSException, GEOSGeometry, MultiPolygon, Point
from django.core.cache import cache
from django.db import connection
from django.db.models import Max

from modules.territorio.models import Agencia, Ubicacion, Zona


class ITerritorioRepository(ABC):
    @abstractmethod
    def agencias(self) -> list: ...

    @abstractmethod
    def arbol(self, incluir_no_vigentes=False) -> list: ...

    @abstractmethod
    def zona(self, zona_id) -> dict | None: ...

    @abstractmethod
    def zona_por_codigo(self, codigo) -> dict | None: ...

    @abstractmethod
    def geometrias(self, ids, tolerancia) -> dict: ...

    @abstractmethod
    def zona_de_punto(self, lat, lng) -> dict | None: ...

    @abstractmethod
    def zonas_de_puntos(self, puntos) -> dict: ...

    @abstractmethod
    def crear_ubicaciones(self, items) -> list: ...

    @abstractmethod
    def actualizar_ubicacion(self, ubicacion_id, lat, lng, direccion, zona_id) -> None: ...

    @abstractmethod
    def upsert_zona(self, datos) -> tuple[int, bool]: ...

    @abstractmethod
    def retirar_zonas(self, codigos) -> int: ...

    @abstractmethod
    def reasignar_ubicaciones(self) -> int: ...

    @abstractmethod
    def version_geometrias(self) -> str: ...


def _zona_dto(z):
    return {
        "id": z.id, "codigo": z.codigo, "nombre": z.nombre, "tipo_zona": z.tipo_zona, "nivel": Zona.NIVEL[z.tipo_zona],
        "zona_superior_id": z.zona_superior_id, "agencia_id": z.agencia_id,
        "centroide": [z.centroide.x, z.centroide.y] if z.centroide else None,
        "hogares_estimados": z.hogares_estimados, "fuente_oficial": z.fuente_oficial, "vigente": z.vigente,
    }


class PostgresTerritorioRepository(ITerritorioRepository):
    def agencias(self):
        return [
            {"id": a.id, "codigo": a.codigo, "nombre": a.nombre, "direccion": a.direccion,
             "ubicacion": [a.ubicacion.x, a.ubicacion.y] if a.ubicacion else None, "activa": a.activa}
            for a in Agencia.objects.order_by("id")
        ]

    def arbol(self, incluir_no_vigentes=False):
        qs = Zona.objects.all() if incluir_no_vigentes else Zona.objects.filter(vigente=True)
        return [_zona_dto(z) for z in qs.defer("poligono").order_by("codigo")]

    def zona(self, zona_id):
        z = Zona.objects.defer("poligono").filter(id=zona_id).first()
        return _zona_dto(z) if z else None

    def zona_por_codigo(self, codigo):
        z = Zona.objects.defer("poligono").filter(codigo=codigo).first()
        return _zona_dto(z) if z else None

    def version_geometrias(self):
        v = Zona.objects.aggregate(m=Max("updated_at"))["m"]
        return v.isoformat() if v else "0"

    def geometrias(self, ids, tolerancia):
        """Polígonos simplificados (ST_SimplifyPreserveTopology) como GeoJSON, cacheados por versión y tolerancia."""
        ids = sorted(set(ids))
        if not ids:
            return {}
        key = f"geom:{self.version_geometrias()}:{tolerancia}"
        cached = cache.get(key) or {}
        faltan = [i for i in ids if i not in cached]
        if faltan:
            with connection.cursor() as cur:
                cur.execute(
                    "SELECT id, ST_AsGeoJSON(ST_SimplifyPreserveTopology(poligono, %s), 6) FROM zona "
                    "WHERE id = ANY(%s) AND poligono IS NOT NULL",
                    [tolerancia, faltan],
                )
                for zid, gj in cur.fetchall():
                    cached[zid] = json.loads(gj)
            cache.set(key, cached, 3600)
        return {i: cached[i] for i in ids if i in cached}

    def zona_de_punto(self, lat, lng):
        res = self.zonas_de_puntos([("p", lat, lng)])
        zid = res.get("p")
        return self.zona(zid) if zid else None

    def zonas_de_puntos(self, puntos):
        """Asigna en UNA consulta espacial la zona vigente más específica que cubre cada punto (índice GiST)."""
        if not puntos:
            return {}
        keys = [str(k) for k, _, _ in puntos]
        lats = [float(la) for _, la, _ in puntos]
        lngs = [float(lo) for _, _, lo in puntos]
        sql = """
            SELECT p.k, z.id
            FROM unnest(%s::text[], %s::float8[], %s::float8[]) AS p(k, lat, lng)
            LEFT JOIN LATERAL (
                SELECT zz.id FROM zona zz
                WHERE zz.vigente AND zz.poligono IS NOT NULL
                  AND ST_Covers(zz.poligono, ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326))
                ORDER BY CASE zz.tipo_zona WHEN 'barrio' THEN 4 WHEN 'parroquia' THEN 3 WHEN 'canton' THEN 2 ELSE 1 END DESC
                LIMIT 1
            ) z ON TRUE
        """
        with connection.cursor() as cur:
            cur.execute(sql, [keys, lats, lngs])
            return {k: zid for k, zid in cur.fetchall() if zid}

    def crear_ubicaciones(self, items):
        objs = [
            Ubicacion(
                punto=Point(float(i["longitud"]), float(i["latitud"]), srid=4326), latitud=i["latitud"], longitud=i["longitud"],
                direccion=(i.get("direccion") or "")[:200], zona_id=i.get("zona_id"), precision_valida=i.get("precision_valida", True),
            )
            for i in items
        ]
        return [o.id for o in Ubicacion.objects.bulk_create(objs, batch_size=500)]

    def actualizar_ubicacion(self, ubicacion_id, lat, lng, direccion, zona_id):
        Ubicacion.objects.filter(id=ubicacion_id).update(
            punto=Point(float(lng), float(lat), srid=4326), latitud=lat, longitud=lng, direccion=(direccion or "")[:200], zona_id=zona_id
        )

    def upsert_zona(self, datos):
        geom = GEOSGeometry(json.dumps(datos["geometria"]), srid=4326)
        if geom.geom_type == "Polygon":
            geom = MultiPolygon(geom, srid=4326)
        superior_id = None
        if datos.get("zona_superior_codigo"):
            superior_id = Zona.objects.filter(codigo=datos["zona_superior_codigo"]).values_list("id", flat=True).first()
        defaults = {
            "nombre": datos["nombre"], "tipo_zona": datos["tipo_zona"], "zona_superior_id": superior_id, "poligono": geom,
            "centroide": geom.point_on_surface, "hogares_estimados": datos.get("hogares_estimados"),
            "fuente_oficial": datos.get("fuente_oficial", "")[:200], "vigente": True,
        }
        if datos.get("agencia_codigo"):
            defaults["agencia_id"] = Agencia.objects.filter(codigo=datos["agencia_codigo"]).values_list("id", flat=True).first()
        z, creada = Zona.objects.update_or_create(codigo=datos["codigo"], defaults=defaults)
        return z.id, creada

    def validar_geometria(self, geojson):
        """(ok, motivo). Acepta Polygon/MultiPolygon válidos, SRID 4326, dentro del recuadro de Ecuador."""
        try:
            g = GEOSGeometry(json.dumps(geojson), srid=4326)
        except (ValueError, TypeError, GDALException, GEOSException):
            return False, "Geometría ilegible"
        if g.geom_type not in ("Polygon", "MultiPolygon"):
            return False, f"Tipo de geometría no admitido ({g.geom_type})"
        if g.empty or not g.valid:
            return False, f"Geometría no válida ({g.valid_reason})"
        x0, y0, x1, y1 = g.extent
        if x0 < -81.2 or x1 > -75.0 or y0 < -5.2 or y1 > 1.6:
            return False, "La geometría está fuera de Ecuador"
        return True, None

    def geometria_igual(self, codigo, geojson):
        with connection.cursor() as cur:
            cur.execute("SELECT ST_Equals(poligono, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))) FROM zona WHERE codigo = %s",
                        [json.dumps(geojson), codigo])
            row = cur.fetchone()
        return bool(row and row[0])

    def retirar_zonas(self, codigos):
        return Zona.objects.filter(codigo__in=codigos, vigente=True).update(vigente=False)

    def reasignar_ubicaciones(self):
        """Tras cambiar límites, recalcula la zona de cada ubicación con una sola sentencia espacial."""
        sql = """
            UPDATE ubicacion u SET zona_id = sub.zid FROM (
                SELECT u2.id AS uid, (
                    SELECT zz.id FROM zona zz WHERE zz.vigente AND zz.poligono IS NOT NULL AND ST_Covers(zz.poligono, u2.punto)
                    ORDER BY CASE zz.tipo_zona WHEN 'barrio' THEN 4 WHEN 'parroquia' THEN 3 WHEN 'canton' THEN 2 ELSE 1 END DESC LIMIT 1
                ) AS zid FROM ubicacion u2
            ) sub WHERE u.id = sub.uid AND u.zona_id IS DISTINCT FROM sub.zid
        """
        with connection.cursor() as cur:
            cur.execute(sql)
            return cur.rowcount
