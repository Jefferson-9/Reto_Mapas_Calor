"""Persistencia de socios, créditos y pagos (upsert por clave de negocio) e indicadores precalculados."""

import datetime
from abc import ABC, abstractmethod
from decimal import Decimal

from django.contrib.gis.geos import Point
from django.db import connection

from modules.cartera.models import Credito, IndicadorZonaPeriodo, Pago, Socio
from modules.territorio.models import Agencia, Ubicacion

PERSONALES = {"nombre", "cedula_hash", "latitud", "longitud", "direccion", "rango_ingreso"}
MAX_CAMBIOS_AUDITADOS = 200


def _d(v):
    return Decimal(v) if v not in (None, "") else None


def _f(v):
    return datetime.date.fromisoformat(v) if v else None


class IDatosRepository(ABC):
    @abstractmethod
    def agencias_por_codigo(self) -> dict: ...

    @abstractmethod
    def cedulas_existentes(self, hashes) -> dict: ...

    @abstractmethod
    def socios_existentes(self, codigos) -> dict: ...

    @abstractmethod
    def creditos_existentes(self, codigos) -> dict: ...

    @abstractmethod
    def upsert_socios(self, filas, carga_id) -> dict: ...

    @abstractmethod
    def upsert_creditos(self, filas, carga_id) -> dict: ...

    @abstractmethod
    def upsert_pagos(self, filas, carga_id) -> dict: ...

    @abstractmethod
    def sincronizar_zonas(self) -> None: ...

    @abstractmethod
    def resumen_excluidos(self) -> dict: ...


def _registrar_cambio(stats, codigo, campos):
    stats["actualizados"] += 1
    if len(stats["cambios"]) < MAX_CAMBIOS_AUDITADOS:
        stats["cambios"].append({"codigo": codigo, "campos": campos})
    else:
        stats["cambios_truncados"] = True


def _nuevas_stats():
    return {"nuevos": 0, "actualizados": 0, "sin_cambio": 0, "cambios": [], "cambios_truncados": False, "zonas": set(), "fechas": []}


class PostgresDatosRepository(IDatosRepository):
    def agencias_por_codigo(self):
        return {a.codigo.upper(): a.id for a in Agencia.objects.filter(activa=True)}

    def cedulas_existentes(self, hashes):
        return dict(Socio.objects.filter(cedula_hash__in=list(hashes)).values_list("cedula_hash", "codigo_socio"))

    def socios_existentes(self, codigos):
        return {s["codigo_socio"]: s for s in Socio.objects.filter(codigo_socio__in=list(codigos)).values("id", "codigo_socio", "zona_id")}

    def creditos_existentes(self, codigos):
        return {c["codigo_credito"]: c for c in Credito.objects.filter(codigo_credito__in=list(codigos)).values("id", "codigo_credito", "zona_id")}

    def upsert_socios(self, filas, carga_id):
        stats = _nuevas_stats()
        existentes = {s.codigo_socio: s for s in Socio.objects.select_related("ubicacion").filter(codigo_socio__in=[f["codigo_socio"] for f in filas])}
        nuevos, act_socios, act_ubic = [], [], []
        for f in filas:
            s = existentes.get(f["codigo_socio"])
            stats["zonas"].add(f["zona_id"])
            stats["fechas"].append(f["fecha_ingreso"])
            if s is None:
                nuevos.append(f)
                continue
            antes = {"nombre": s.nombre, "cedula_hash": s.cedula_hash, "agencia_id": s.agencia_id, "fecha_ingreso": s.fecha_ingreso.isoformat(),
                     "rango_ingreso": s.rango_ingreso, "atributos": s.atributos, "zona_id": s.zona_id,
                     "latitud": str(s.ubicacion.latitud) if s.ubicacion_id else None, "longitud": str(s.ubicacion.longitud) if s.ubicacion_id else None,
                     "direccion": s.ubicacion.direccion if s.ubicacion_id else ""}
            despues = {"nombre": f["nombre"], "cedula_hash": f["cedula_hash"], "agencia_id": f.get("agencia_id"), "fecha_ingreso": f["fecha_ingreso"],
                       "rango_ingreso": f.get("rango_ingreso", ""), "atributos": f.get("atributos", {}), "zona_id": f["zona_id"],
                       "latitud": str(Decimal(f["latitud"]).quantize(Decimal("0.000001"))), "longitud": str(Decimal(f["longitud"]).quantize(Decimal("0.000001"))),
                       "direccion": f.get("direccion", "")}
            if antes["latitud"]:
                antes["latitud"] = str(Decimal(antes["latitud"]).quantize(Decimal("0.000001")))
                antes["longitud"] = str(Decimal(antes["longitud"]).quantize(Decimal("0.000001")))
            dif = [k for k in despues if antes[k] != despues[k]]
            if not dif:
                stats["sin_cambio"] += 1
                continue
            stats["zonas"].add(s.zona_id)
            _registrar_cambio(stats, s.codigo_socio, {k: ("[dato personal modificado]" if k in PERSONALES else [antes[k], despues[k]]) for k in dif})
            s.nombre, s.cedula_hash, s.cedula_mascara = f["nombre"], f["cedula_hash"], f["cedula_mascara"]
            s.agencia_id, s.fecha_ingreso, s.rango_ingreso = f.get("agencia_id"), _f(f["fecha_ingreso"]), f.get("rango_ingreso", "")
            s.atributos, s.zona_id, s.carga_id = f.get("atributos", {}), f["zona_id"], carga_id
            act_socios.append(s)
            if s.ubicacion_id:
                u = s.ubicacion
                u.latitud, u.longitud = _d(f["latitud"]), _d(f["longitud"])
                u.punto = Point(float(f["longitud"]), float(f["latitud"]), srid=4326)
                u.direccion, u.zona_id, u.precision_valida = f.get("direccion", "")[:200], f["zona_id"], True
                act_ubic.append(u)
        if nuevos:
            ubic = Ubicacion.objects.bulk_create([
                Ubicacion(punto=Point(float(f["longitud"]), float(f["latitud"]), srid=4326), latitud=_d(f["latitud"]), longitud=_d(f["longitud"]),
                          direccion=f.get("direccion", "")[:200], zona_id=f["zona_id"], precision_valida=True)
                for f in nuevos
            ])
            Socio.objects.bulk_create([
                Socio(codigo_socio=f["codigo_socio"], cedula_hash=f["cedula_hash"], cedula_mascara=f["cedula_mascara"], nombre=f["nombre"],
                      agencia_id=f.get("agencia_id"), zona_id=f["zona_id"], ubicacion_id=u.id, rango_ingreso=f.get("rango_ingreso", ""),
                      fecha_ingreso=_f(f["fecha_ingreso"]), atributos=f.get("atributos", {}), carga_id=carga_id)
                for f, u in zip(nuevos, ubic)
            ])
            stats["nuevos"] = len(nuevos)
        if act_socios:
            Socio.objects.bulk_update(act_socios, ["nombre", "cedula_hash", "cedula_mascara", "agencia_id", "fecha_ingreso", "rango_ingreso",
                                                   "atributos", "zona_id", "carga_id", "updated_at"])
            if act_ubic:
                Ubicacion.objects.bulk_update(act_ubic, ["latitud", "longitud", "punto", "direccion", "zona_id", "precision_valida"])
            # los créditos heredan la zona del socio
            with connection.cursor() as cur:
                cur.execute("UPDATE credito c SET zona_id = s.zona_id FROM socio s WHERE c.socio_id = s.id AND s.id = ANY(%s) "
                            "AND c.zona_id IS DISTINCT FROM s.zona_id", [[s.id for s in act_socios]])
        return stats

    def upsert_creditos(self, filas, carga_id):
        stats = _nuevas_stats()
        socios = {s["codigo_socio"]: s for s in Socio.objects.filter(codigo_socio__in=[f["codigo_socio"] for f in filas]).values("id", "codigo_socio", "zona_id")}
        existentes = {c.codigo_credito: c for c in Credito.objects.filter(codigo_credito__in=[f["codigo_credito"] for f in filas])}
        nuevos, actualizar = [], []
        for f in filas:
            socio = socios[f["codigo_socio"]]
            stats["zonas"].add(socio["zona_id"])
            stats["fechas"].append(f["fecha_desembolso"])
            c = existentes.get(f["codigo_credito"])
            vals = {"socio_id": socio["id"], "zona_id": socio["zona_id"], "monto": _d(f["monto"]), "fecha_desembolso": _f(f["fecha_desembolso"]),
                    "plazo_meses": f["plazo_meses"], "estado": f["estado"], "atributos": f.get("atributos", {})}
            if c is None:
                nuevos.append(Credito(codigo_credito=f["codigo_credito"], carga_id=carga_id, **vals))
                continue
            dif = {k: [str(getattr(c, k)), str(v)] for k, v in vals.items() if getattr(c, k) != v}
            if not dif:
                stats["sin_cambio"] += 1
                continue
            stats["zonas"].add(c.zona_id)
            _registrar_cambio(stats, c.codigo_credito, dif)
            for k, v in vals.items():
                setattr(c, k, v)
            c.carga_id = carga_id
            actualizar.append(c)
        Credito.objects.bulk_create(nuevos, batch_size=500)
        stats["nuevos"] = len(nuevos)
        if actualizar:
            Credito.objects.bulk_update(actualizar, ["socio_id", "zona_id", "monto", "fecha_desembolso", "plazo_meses", "estado", "atributos", "carga_id", "updated_at"])
        return stats

    def upsert_pagos(self, filas, carga_id):
        stats = _nuevas_stats()
        creditos = {c["codigo_credito"]: c for c in Credito.objects.filter(codigo_credito__in=[f["codigo_credito"] for f in filas]).values("id", "codigo_credito", "zona_id")}
        ids = [c["id"] for c in creditos.values()]
        periodos = {f["periodo"] for f in filas}
        existentes = {(p.credito_id, p.periodo): p for p in Pago.objects.filter(credito_id__in=ids, periodo__in=periodos)}
        nuevos, actualizar = [], []
        for f in filas:
            cr = creditos[f["codigo_credito"]]
            stats["zonas"].add(cr["zona_id"])
            vals = {"fecha_pago": _f(f.get("fecha_pago")), "valor_pagado": _d(f["valor_pagado"]), "valor_pendiente": _d(f["valor_pendiente"]),
                    "dias_atraso": f["dias_atraso"], "atributos": f.get("atributos", {})}
            p = existentes.get((cr["id"], f["periodo"]))
            if p is None:
                nuevos.append(Pago(credito_id=cr["id"], periodo=f["periodo"], carga_id=carga_id, **vals))
                continue
            dif = {k: [str(getattr(p, k)), str(v)] for k, v in vals.items() if getattr(p, k) != v}
            if not dif:
                stats["sin_cambio"] += 1
                continue
            _registrar_cambio(stats, f"{f['codigo_credito']}|{f['periodo']}", dif)
            for k, v in vals.items():
                setattr(p, k, v)
            p.carga_id = carga_id
            actualizar.append(p)
        Pago.objects.bulk_create(nuevos, batch_size=500)
        stats["nuevos"] = len(nuevos)
        if actualizar:
            Pago.objects.bulk_update(actualizar, ["fecha_pago", "valor_pagado", "valor_pendiente", "dias_atraso", "atributos", "carga_id", "updated_at"])
        return stats

    def sincronizar_zonas(self):
        """Tras reasignar ubicaciones (cambio de límites), propaga la zona a socios y créditos."""
        with connection.cursor() as cur:
            cur.execute("UPDATE socio s SET zona_id = u.zona_id FROM ubicacion u WHERE s.ubicacion_id = u.id AND s.zona_id IS DISTINCT FROM u.zona_id")
            cur.execute("UPDATE credito c SET zona_id = s.zona_id FROM socio s WHERE c.socio_id = s.id AND c.zona_id IS DISTINCT FROM s.zona_id")

    def puntos_socios(self, zona_ids, bbox, limite, fecha_corte=None):
        """Puntos de socios para la capa de detalle: solo id y zona (sin datos personales)."""
        from django.contrib.gis.geos import Polygon

        qs = Socio.objects.filter(zona_id__in=list(zona_ids), ubicacion__precision_valida=True)
        if fecha_corte:
            qs = qs.filter(fecha_ingreso__lte=fecha_corte)
        if bbox:
            qs = qs.filter(ubicacion__punto__within=Polygon.from_bbox(bbox))
        total = qs.count()
        filas = [{"id": s["id"], "lng": s["ubicacion__punto"].x, "lat": s["ubicacion__punto"].y, "zona_id": s["zona_id"]}
                 for s in qs.values("id", "ubicacion__punto", "zona_id")[:limite]]
        return filas, total

    def resumen_excluidos(self):
        sin_zona = Socio.objects.filter(zona__isnull=True).count()
        return {"socios_sin_zona": sin_zona}


class IIndicadorRepository(ABC):
    @abstractmethod
    def componentes(self, periodos, zona_ids, dias_min) -> list: ...

    @abstractmethod
    def reemplazar(self, periodos, zona_ids, filas) -> None: ...

    @abstractmethod
    def periodos(self) -> list: ...

    @abstractmethod
    def zonas_con_datos(self) -> list: ...

    @abstractmethod
    def leer(self, periodos, zona_ids) -> list: ...

    @abstractmethod
    def socios_por_zona_periodo(self, periodos, zona_ids) -> dict: ...


class PostgresIndicadorRepository(IIndicadorRepository):
    def componentes(self, periodos, zona_ids, dias_min):
        """Componentes por zona y período (sumables). Agregaciones en SQL, sin N+1."""
        sql = """
        WITH per AS (
            SELECT p AS periodo, (date_trunc('month', to_date(p || '-01', 'YYYY-MM-DD')) + interval '1 month - 1 day')::date AS fin
            FROM unnest(%(periodos)s::text[]) AS p
        ), zs AS (SELECT unnest(%(zonas)s::bigint[]) AS zona_id),
        soc AS (
            SELECT per.periodo, s.zona_id, count(*) AS n FROM per JOIN socio s ON s.fecha_ingreso <= per.fin
            JOIN ubicacion u ON u.id = s.ubicacion_id AND u.precision_valida
            WHERE s.zona_id IN (SELECT zona_id FROM zs) GROUP BY 1, 2
        ), cre AS (
            SELECT per.periodo, c.zona_id, count(*) AS n, sum(c.monto) AS monto FROM per
            JOIN credito c ON c.fecha_desembolso <= per.fin AND c.estado IN ('vigente', 'vencido')
            WHERE c.zona_id IN (SELECT zona_id FROM zs) GROUP BY 1, 2
        ), atr AS (
            SELECT p.periodo, c.zona_id, count(DISTINCT c.id) AS n, sum(p.valor_pendiente) AS saldo FROM pago p
            JOIN credito c ON c.id = p.credito_id AND c.estado IN ('vigente', 'vencido')
            JOIN per ON per.periodo = p.periodo AND c.fecha_desembolso <= per.fin
            WHERE p.dias_atraso >= %(dias)s AND c.zona_id IN (SELECT zona_id FROM zs) GROUP BY 1, 2
        )
        SELECT k.periodo, k.zona_id, coalesce(soc.n, 0), coalesce(cre.n, 0), coalesce(cre.monto, 0), coalesce(atr.n, 0), coalesce(atr.saldo, 0)
        FROM (SELECT periodo, zona_id FROM soc UNION SELECT periodo, zona_id FROM cre) k
        LEFT JOIN soc ON soc.periodo = k.periodo AND soc.zona_id = k.zona_id
        LEFT JOIN cre ON cre.periodo = k.periodo AND cre.zona_id = k.zona_id
        LEFT JOIN atr ON atr.periodo = k.periodo AND atr.zona_id = k.zona_id
        """
        with connection.cursor() as cur:
            cur.execute(sql, {"periodos": list(periodos), "zonas": list(zona_ids), "dias": dias_min})
            return [
                {"periodo": r[0], "zona_id": r[1], "total_socios": r[2], "total_creditos": r[3], "monto_cartera": Decimal(r[4]),
                 "creditos_atrasados": r[5], "saldo_vencido": Decimal(r[6])}
                for r in cur.fetchall()
            ]

    def reemplazar(self, periodos, zona_ids, filas):
        IndicadorZonaPeriodo.objects.filter(periodo__in=list(periodos), zona_id__in=list(zona_ids)).delete()
        IndicadorZonaPeriodo.objects.bulk_create([IndicadorZonaPeriodo(**f) for f in filas], batch_size=1000)

    def periodos(self):
        return sorted(IndicadorZonaPeriodo.objects.order_by().values_list("periodo", flat=True).distinct())

    def zonas_con_datos(self):
        ids = set(Socio.objects.exclude(zona__isnull=True).values_list("zona_id", flat=True).distinct())
        ids |= set(Credito.objects.exclude(zona__isnull=True).values_list("zona_id", flat=True).distinct())
        return sorted(ids)

    def leer(self, periodos, zona_ids):
        qs = IndicadorZonaPeriodo.objects.filter(periodo__in=list(periodos))
        if zona_ids is not None:
            qs = qs.filter(zona_id__in=list(zona_ids))
        return list(qs.values("zona_id", "periodo", "total_socios", "total_creditos", "monto_cartera", "creditos_atrasados",
                              "saldo_vencido", "tasa_morosidad", "penetracion_pct", "ultima_carga_at"))

    def socios_por_zona_periodo(self, periodos, zona_ids):
        out = {}
        for r in IndicadorZonaPeriodo.objects.filter(periodo__in=list(periodos), zona_id__in=list(zona_ids)).values("zona_id", "periodo", "total_socios"):
            out[(r["zona_id"], r["periodo"])] = r["total_socios"]
        return out
