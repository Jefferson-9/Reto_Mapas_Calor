from abc import ABC, abstractmethod

from modules.analitica.models import ConfiguracionAnalisis, EjecucionAnalisis, ResultadoPredictivo


class IPotencialRepository(ABC):
    @abstractmethod
    def configuraciones(self) -> list: ...

    @abstractmethod
    def vigente(self) -> dict | None: ...

    @abstractmethod
    def crear_configuracion(self, pesos, min_periodos, nota, responsable_id) -> dict: ...

    @abstractmethod
    def crear_ejecucion(self, datos, resultados) -> dict: ...

    @abstractmethod
    def ultima_ejecucion(self, periodo=None, nivel=None) -> dict | None: ...

    @abstractmethod
    def ejecuciones(self, limite=20) -> list: ...


def _conf(c):
    return {"id": c.id, "version": c.version, "pesos": c.pesos, "min_periodos": c.min_periodos, "nota": c.nota, "vigente": c.vigente,
            "responsable": c.responsable.username, "created_at": c.created_at}


def _ejec(e, con_resultados=False):
    d = {"id": e.id, "configuracion_version": e.configuracion.version, "pesos": e.configuracion.pesos, "periodo": e.periodo, "nivel": e.nivel,
         "ejecutado_por": e.ejecutado_por.username, "ejecutado_en": e.ejecutado_en, "fecha_datos": e.fecha_datos, "zonas_evaluadas": e.zonas_evaluadas}
    if con_resultados:
        d["resultados"] = [{"zona_id": r.zona_id, "puntaje": r.puntaje, "banda": r.banda, "variables": r.variables} for r in e.resultados.all()]
    return d


class PostgresPotencialRepository(IPotencialRepository):
    def configuraciones(self):
        return [_conf(c) for c in ConfiguracionAnalisis.objects.select_related("responsable").order_by("-version")]

    def vigente(self):
        c = ConfiguracionAnalisis.objects.select_related("responsable").filter(vigente=True).first()
        return _conf(c) if c else None

    def crear_configuracion(self, pesos, min_periodos, nota, responsable_id):
        ultima = ConfiguracionAnalisis.objects.select_for_update().order_by("-version").first()
        ConfiguracionAnalisis.objects.filter(vigente=True).update(vigente=False)
        c = ConfiguracionAnalisis.objects.create(version=(ultima.version if ultima else 0) + 1, pesos=pesos, min_periodos=min_periodos,
                                                 nota=nota[:300], vigente=True, responsable_id=responsable_id)
        return _conf(ConfiguracionAnalisis.objects.select_related("responsable").get(id=c.id))

    def crear_ejecucion(self, datos, resultados):
        e = EjecucionAnalisis.objects.create(**datos)
        ResultadoPredictivo.objects.bulk_create([ResultadoPredictivo(ejecucion=e, **r) for r in resultados])
        return self.ultima_ejecucion_id(e.id)

    def ultima_ejecucion_id(self, ejecucion_id):
        e = EjecucionAnalisis.objects.select_related("configuracion", "ejecutado_por").prefetch_related("resultados").get(id=ejecucion_id)
        return _ejec(e, True)

    def ultima_ejecucion(self, periodo=None, nivel=None):
        qs = EjecucionAnalisis.objects.select_related("configuracion", "ejecutado_por").prefetch_related("resultados")
        if periodo:
            qs = qs.filter(periodo=periodo)
        if nivel:
            qs = qs.filter(nivel=nivel)
        e = qs.order_by("-ejecutado_en").first()
        return _ejec(e, True) if e else None

    def ejecuciones(self, limite=20):
        return [_ejec(e) for e in EjecucionAnalisis.objects.select_related("configuracion", "ejecutado_por").order_by("-ejecutado_en")[:limite]]
