from abc import ABC, abstractmethod

from django.db.models import Max, Q

from core.pagination import cursor_page
from modules.cartera.models import CargaDatos, EsquemaCarga, FilaStaging, RegistroObservado


class ICargaRepository(ABC):
    @abstractmethod
    def crear(self, datos) -> dict: ...

    @abstractmethod
    def obtener(self, carga_id) -> dict | None: ...

    @abstractmethod
    def actualizar(self, carga_id, cambios) -> dict: ...

    @abstractmethod
    def bloquear(self, carga_id) -> dict | None: ...

    @abstractmethod
    def listar(self, filtros, cursor, tamano) -> dict: ...

    @abstractmethod
    def existe_completada(self, hash_archivo, tipo, periodo) -> bool: ...

    @abstractmethod
    def guardar_staging(self, carga_id, filas) -> None: ...

    @abstractmethod
    def iterar_staging(self, carga_id, clasificacion, tamano_lote): ...

    @abstractmethod
    def muestra_staging(self, carga_id, n) -> list: ...

    @abstractmethod
    def borrar_staging(self, carga_id, clasificaciones) -> None: ...

    @abstractmethod
    def iterar_errores(self, carga_id): ...

    @abstractmethod
    def ultima_carga_en(self, periodo=None): ...


def carga_dto(c):
    return {
        "id": c.id, "nombre_archivo": c.nombre_archivo, "tipo": c.tipo, "periodo": c.periodo, "estado": c.estado,
        "hash_archivo": c.hash_archivo, "esquema_version": c.esquema.version if c.esquema_id else None,
        "usuario": {"id": c.usuario_id, "username": c.usuario.username, "nombre": c.usuario.nombre_completo},
        "leidos": c.leidos, "cargados": c.cargados, "observados": c.observados, "rechazados": c.rechazados,
        "columnas_archivo": c.columnas_archivo, "mapeo": c.mapeo, "faltantes": c.faltantes, "resumen": c.resumen,
        "mensaje": c.mensaje, "reemplazo": c.reemplazo, "es_seed": c.es_seed, "ruta_archivo": c.ruta_archivo,
        "created_at": c.created_at, "updated_at": c.updated_at, "confirmada_en": c.confirmada_en,
    }


def _qs():
    return CargaDatos.objects.select_related("usuario", "esquema")


class PostgresCargaRepository(ICargaRepository):
    def crear(self, datos):
        c = CargaDatos.objects.create(**datos)
        return self.obtener(c.id)

    def obtener(self, carga_id):
        c = _qs().filter(id=carga_id).first()
        return carga_dto(c) if c else None

    def bloquear(self, carga_id):
        c = CargaDatos.objects.select_for_update().filter(id=carga_id).first()
        return self.obtener(c.id) if c else None

    def actualizar(self, carga_id, cambios):
        CargaDatos.objects.filter(id=carga_id).update(**cambios)
        return self.obtener(carga_id)

    def listar(self, filtros, cursor, tamano):
        qs = _qs().exclude(tipo="limites") if filtros.get("excluir_limites") else _qs()
        for k in ("tipo", "periodo", "estado"):
            if filtros.get(k):
                qs = qs.filter(**{k: filtros[k]})
        if filtros.get("usuario"):
            qs = qs.filter(usuario__username__iexact=filtros["usuario"])
        if filtros.get("desde"):
            qs = qs.filter(created_at__date__gte=filtros["desde"])
        if filtros.get("hasta"):
            qs = qs.filter(created_at__date__lte=filtros["hasta"])
        return cursor_page(qs, ["-created_at"], cursor, tamano, carga_dto)

    def existe_completada(self, hash_archivo, tipo, periodo):
        return CargaDatos.objects.filter(hash_archivo=hash_archivo, tipo=tipo, periodo=periodo, estado="completada").exists()

    def guardar_staging(self, carga_id, filas):
        FilaStaging.objects.bulk_create(
            [FilaStaging(carga_id=carga_id, numero_fila=f["numero_fila"], clasificacion=f["clasificacion"], datos=f["datos"],
                         fila_raw=f["fila_raw"], motivos=f["motivos"]) for f in filas],
            batch_size=1000,
        )

    def iterar_staging(self, carga_id, clasificacion, tamano_lote):
        ultimo = 0
        while True:
            lote = list(
                FilaStaging.objects.filter(carga_id=carga_id, clasificacion=clasificacion, numero_fila__gt=ultimo)
                .order_by("numero_fila").values("numero_fila", "datos", "fila_raw", "motivos")[:tamano_lote]
            )
            if not lote:
                return
            ultimo = lote[-1]["numero_fila"]
            yield lote

    def muestra_staging(self, carga_id, n):
        return list(
            FilaStaging.objects.filter(carga_id=carga_id).order_by("numero_fila")
            .values("numero_fila", "clasificacion", "fila_raw", "motivos")[:n]
        )

    def borrar_staging(self, carga_id, clasificaciones):
        FilaStaging.objects.filter(carga_id=carga_id, clasificacion__in=clasificaciones).delete()

    def iterar_errores(self, carga_id):
        for f in FilaStaging.objects.filter(carga_id=carga_id, clasificacion__in=["rechazado", "observado"]).order_by("numero_fila").iterator():
            for m in f.motivos:
                yield {"fila": f.numero_fila, "clasificacion": f.clasificacion, "campo": m.get("campo"), "motivo": m.get("motivo")}
        for o in RegistroObservado.objects.filter(carga_id=carga_id).order_by("numero_fila").iterator():
            for m in o.motivos:
                yield {"fila": o.numero_fila, "clasificacion": "observado", "campo": m.get("campo"), "motivo": m.get("motivo")}

    def ultima_carga_en(self, periodo=None):
        qs = CargaDatos.objects.filter(estado="completada", tipo__in=["socios", "creditos", "pagos"])
        if periodo:
            qs = qs.filter(Q(periodo__lte=periodo) | Q(periodo__isnull=True))
        return qs.aggregate(m=Max("confirmada_en"))["m"]


class IEsquemaRepository(ABC):
    @abstractmethod
    def vigente(self, tipo) -> dict | None: ...

    @abstractmethod
    def versiones(self, tipo) -> list: ...

    @abstractmethod
    def crear_version(self, tipo, campos, autor_id) -> dict: ...


def esquema_dto(e):
    return {"id": e.id, "tipo": e.tipo, "version": e.version, "vigente": e.vigente, "campos": e.campos,
            "autor": e.autor.username if e.autor_id else None, "created_at": e.created_at}


class PostgresEsquemaRepository(IEsquemaRepository):
    def vigente(self, tipo):
        e = EsquemaCarga.objects.select_related("autor").filter(tipo=tipo, vigente=True).first()
        return esquema_dto(e) if e else None

    def versiones(self, tipo):
        return [esquema_dto(e) for e in EsquemaCarga.objects.select_related("autor").filter(tipo=tipo).order_by("-version")]

    def crear_version(self, tipo, campos, autor_id):
        ultima = EsquemaCarga.objects.select_for_update().filter(tipo=tipo).order_by("-version").first()
        EsquemaCarga.objects.filter(tipo=tipo, vigente=True).update(vigente=False)
        e = EsquemaCarga.objects.create(tipo=tipo, version=(ultima.version + 1) if ultima else 1, vigente=True, campos=campos, autor_id=autor_id)
        return esquema_dto(EsquemaCarga.objects.select_related("autor").get(id=e.id))


class IObservadoRepository(ABC):
    @abstractmethod
    def crear_lote(self, carga_id, tipo, periodo, filas) -> int: ...

    @abstractmethod
    def listar(self, filtros, cursor, tamano) -> dict: ...

    @abstractmethod
    def obtener(self, obs_id, bloquear=False) -> dict | None: ...

    @abstractmethod
    def resolver(self, obs_id, estado, usuario_id, nota, ahora, datos=None) -> dict: ...

    @abstractmethod
    def resumen(self) -> dict: ...


def obs_dto(o):
    return {
        "id": o.id, "carga_id": o.carga_id, "archivo": o.carga.nombre_archivo, "tipo": o.tipo, "periodo": o.periodo,
        "numero_fila": o.numero_fila, "fila_raw": o.fila_raw, "datos": {k: v for k, v in o.datos.items() if k != "cedula_hash"},
        "motivos": o.motivos, "estado": o.estado, "resuelto_por": o.resuelto_por.username if o.resuelto_por_id else None,
        "resolved_at": o.resolved_at, "nota": o.nota, "created_at": o.created_at,
    }


class PostgresObservadoRepository(IObservadoRepository):
    def crear_lote(self, carga_id, tipo, periodo, filas):
        RegistroObservado.objects.bulk_create(
            [RegistroObservado(carga_id=carga_id, tipo=tipo, periodo=periodo, numero_fila=f["numero_fila"], fila_raw=f["fila_raw"],
                               datos=f["datos"], motivos=f["motivos"]) for f in filas],
            batch_size=1000,
        )
        return len(filas)

    def listar(self, filtros, cursor, tamano):
        qs = RegistroObservado.objects.select_related("carga", "resuelto_por")
        for k in ("estado", "tipo", "periodo"):
            if filtros.get(k):
                qs = qs.filter(**{k: filtros[k]})
        if filtros.get("carga"):
            qs = qs.filter(carga_id=filtros["carga"])
        return cursor_page(qs, ["-created_at"], cursor, tamano, obs_dto)

    def obtener(self, obs_id, bloquear=False):
        qs = RegistroObservado.objects.select_related("carga", "resuelto_por")
        if bloquear:
            qs = qs.select_for_update(of=("self",))
        o = qs.filter(id=obs_id).first()
        if not o:
            return None
        dto = obs_dto(o)
        dto["datos_internos"] = o.datos
        return dto

    def resolver(self, obs_id, estado, usuario_id, nota, ahora, datos=None):
        cambios = {"estado": estado, "resuelto_por_id": usuario_id, "nota": nota[:300], "resolved_at": ahora}
        if datos is not None:
            cambios["datos"] = datos
        RegistroObservado.objects.filter(id=obs_id).update(**cambios)
        return self.obtener(obs_id)

    def resumen(self):
        from django.db.models import Count

        filas = RegistroObservado.objects.values("estado", "tipo").annotate(n=Count("id"))
        out = {"por_estado": {}, "por_tipo": {}, "excluidos": 0}
        for f in filas:
            out["por_estado"][f["estado"]] = out["por_estado"].get(f["estado"], 0) + f["n"]
            out["por_tipo"][f["tipo"]] = out["por_tipo"].get(f["tipo"], 0) + f["n"]
            if f["estado"] in ("pendiente", "conservado"):
                out["excluidos"] += f["n"]
        return out
