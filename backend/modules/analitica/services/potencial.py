"""Potencial de captación (CU-20/CU-21): puntaje ponderado transparente, condicionado y versionado."""

from decimal import Decimal

from core.exceptions import DomainError, FuncionDeshabilitada, NoEncontrado
from core.repositories.base import EventoAuditoria
from core.utils.periodos import es_periodo
from modules.analitica.services.calculos import VARIABLES_POTENCIAL, agregar_por_nivel, puntajes

ETIQUETA = "Estimación no confirmada"
DESCRIPCION_VARIABLES = {
    "penetracion_baja": "Baja penetración de socios frente a hogares (1 − penetración normalizada)",
    "hogares": "Hogares estimados de la zona (normalizado)",
    "crecimiento": "Variación % de socios en los últimos períodos (normalizado)",
    "prospectos": "Posibles socios registrados en la zona (normalizado)",
    "mora_baja": "Baja morosidad (1 − tasa de morosidad normalizada)",
}


class ServicioPotencial:
    def __init__(self, repo, territorio, indicadores_repo, campo_repo, cargas_repo, auditoria, uow, parametros):
        self.repo = repo
        self.territorio = territorio
        self.indicadores = indicadores_repo
        self.campo = campo_repo
        self.cargas = cargas_repo
        self.auditoria = auditoria
        self.uow = uow
        self.parametros = parametros

    def _auditar(self, actor, accion, entidad, detalle, nuevo=None, anterior=None):
        self.auditoria.registrar(EventoAuditoria(categoria="analisis", accion=accion, entidad_afectada=entidad, detalle=detalle,
                                                 usuario_id=actor.id, username=actor.username, valor_nuevo=nuevo, valor_anterior=anterior))

    def estado(self):
        """RF-020.01: informa si la función está habilitada y, si no, el motivo."""
        habilitado = self.parametros.valor("habilitar_analisis_predictivo")
        conf = self.repo.vigente()
        periodos = self.indicadores.periodos()
        motivos = []
        if not habilitado:
            motivos.append("La cooperativa no ha aprobado el análisis predictivo.")
        if not conf:
            motivos.append("No hay variables analíticas configuradas.")
        elif len(periodos) < conf["min_periodos"]:
            motivos.append(f"Se requieren al menos {conf['min_periodos']} períodos con datos (hay {len(periodos)}).")
        return {"habilitado": habilitado, "operativo": not motivos, "motivos": motivos, "configuracion": conf, "periodos_con_datos": len(periodos),
                "etiqueta": ETIQUETA, "variables": DESCRIPCION_VARIABLES, "bandas": self.parametros.valor("bandas_potencial"),
                "formula": "puntaje = Σ(peso × variable normalizada) / Σ(pesos de variables con datos); normalización mín-máx entre zonas del mismo nivel y ámbito."}

    def _exigir_habilitado(self):
        if not self.parametros.valor("habilitar_analisis_predictivo"):
            raise FuncionDeshabilitada("El análisis predictivo no está habilitado: requiere la aprobación de la cooperativa.", "PREDICTIVO_DESHABILITADO")

    def configuraciones(self):
        self._exigir_habilitado()
        return self.repo.configuraciones()

    def guardar_configuracion(self, pesos, min_periodos, nota, actor):
        """RF-021.04/05: cada cambio de variables se guarda como versión y se audita."""
        self._exigir_habilitado()
        errores = []
        limpios = {}
        for var in VARIABLES_POTENCIAL:
            try:
                w = Decimal(str(pesos.get(var, 0)))
            except (ArithmeticError, ValueError):
                w = Decimal(-1)
            if w < 0 or w > 10:
                errores.append({"campo": f"pesos.{var}", "mensaje": "El peso debe estar entre 0 y 10."})
            limpios[var] = str(w)
        if not errores and sum(Decimal(v) for v in limpios.values()) <= 0:
            errores.append({"campo": "pesos", "mensaje": "Al menos una variable debe tener peso mayor que 0."})
        if not isinstance(min_periodos, int) or not 2 <= min_periodos <= 24:
            errores.append({"campo": "min_periodos", "mensaje": "Entre 2 y 24 períodos."})
        if errores:
            raise DomainError("VALIDACION", "Revise la configuración.", errores)
        with self.uow.atomic():
            anterior = self.repo.vigente()
            c = self.repo.crear_configuracion(limpios, min_periodos, nota or "", actor.id)
            self._auditar(actor, "variables_configuradas", f"ConfiguracionAnalisis#{c['id']}", f"Variables analíticas versión {c['version']}",
                          {"pesos": limpios, "min_periodos": min_periodos}, {"pesos": anterior["pesos"], "min_periodos": anterior["min_periodos"]} if anterior else None)
        return c

    def _crudos(self, periodo, nivel, conf, jer, hojas):
        periodos = [p for p in self.indicadores.periodos() if p <= periodo]
        if len(periodos) < conf["min_periodos"]:
            raise DomainError("DATOS_INSUFICIENTES", f"Se requieren al menos {conf['min_periodos']} períodos con datos hasta {periodo} (hay {len(periodos)}).")
        inicio = periodos[-conf["min_periodos"]]
        filas = {}
        for f in self.indicadores.leer([inicio, periodo], hojas):
            filas.setdefault(f["periodo"], {})[f["zona_id"]] = f
        actual = {a["zona_id"]: a for a in agregar_por_nivel(jer, hojas, filas.get(periodo, {}), nivel)}
        base = {a["zona_id"]: a for a in agregar_por_nivel(jer, hojas, filas.get(inicio, {}), nivel)}
        prospectos = self.campo.contar_prospectos(hojas)
        crudos = {}
        for zid, a in actual.items():
            ind = a["indicadores"]
            b = (base.get(zid) or {}).get("indicadores")
            hog = sum(jer.por_id[h]["hogares_estimados"] or 0 for h in a["hojas"]) or None
            crec = None
            if ind and b and b["total_socios"]:
                crec = (ind["total_socios"] - b["total_socios"]) / b["total_socios"] * 100
            crudos[zid] = {"penetracion": float(ind["penetracion_pct"]) if ind and ind["penetracion_pct"] is not None else None,
                           "hogares": hog, "crecimiento": crec, "prospectos": sum(prospectos.get(h, 0) for h in a["hojas"]),
                           "mora": float(ind["tasa_morosidad"]) if ind and ind["tasa_morosidad"] is not None else None,
                           "_base": inicio}
        return crudos

    def ejecutar(self, periodo, nivel, actor, ambito):
        """RF-021.02/03: valida datos suficientes y variables configuradas; guarda resultado con fecha y responsable."""
        self._exigir_habilitado()
        if not es_periodo(periodo):
            raise DomainError("VALIDACION", "Período no válido.")
        if nivel not in ("parroquia", "barrio"):
            raise DomainError("VALIDACION", "El análisis se ejecuta por parroquia o por barrio.")
        conf = self.repo.vigente()
        if not conf:
            raise DomainError("SIN_CONFIGURACION", "Configure las variables analíticas antes de ejecutar el análisis.")
        jer = self.territorio.jerarquia()
        hojas = self.territorio.hojas_en_ambito(ambito, jer)
        crudos = self._crudos(periodo, nivel, conf, jer, hojas)
        res = puntajes(crudos, conf["pesos"], self.parametros.valor("bandas_potencial"))
        filas = [{"zona_id": z, "puntaje": Decimal(str(r["puntaje"])) if r["puntaje"] is not None else Decimal("0"), "banda": r["banda"],
                  "variables": {**r["variables"], "crudos": {k: v for k, v in crudos[z].items() if k != "_base"}}} for z, r in res.items()]
        with self.uow.atomic():
            e = self.repo.crear_ejecucion({"configuracion_id": conf["id"], "periodo": periodo, "nivel": nivel, "ejecutado_por_id": actor.id,
                                           "fecha_datos": self.cargas.ultima_carga_en(periodo), "zonas_evaluadas": len(filas)}, filas)
            self._auditar(actor, "analisis_ejecutado", f"EjecucionAnalisis#{e['id']}", f"Análisis de potencial {nivel} {periodo} ({len(filas)} zonas)",
                          {"configuracion_version": conf["version"], "periodo": periodo, "nivel": nivel})
        return {**e, "etiqueta": ETIQUETA}

    def resultados(self, periodo, nivel, ambito):
        """RF-020.02/04/05: zonas del ámbito con potencial estimado, diferenciado de los datos observados."""
        self._exigir_habilitado()
        e = self.repo.ultima_ejecucion(periodo or None, nivel or None)
        if not e:
            return {"ejecucion": None, "items": [], "etiqueta": ETIQUETA, "mensaje": "Aún no se ha ejecutado el análisis para estos filtros."}
        jer = self.territorio.jerarquia()
        visibles = self.territorio.zonas_visibles(ambito, jer)
        geoms = self.territorio.geometrias([r["zona_id"] for r in e["resultados"] if r["zona_id"] in visibles], "media")
        items = []
        for r in e["resultados"]:
            if r["zona_id"] not in visibles:
                continue
            z = jer.por_id.get(r["zona_id"])
            if not z:
                continue
            items.append({"zona": {"id": z["id"], "nombre": z["nombre"], "codigo": z["codigo"]}, "puntaje": r["puntaje"], "banda": r["banda"],
                          "variables": r["variables"], "geometria": geoms.get(z["id"])})
        items.sort(key=lambda i: i["puntaje"], reverse=True)
        res = {k: v for k, v in e.items() if k != "resultados"}
        return {"ejecucion": res, "items": items, "etiqueta": ETIQUETA, "fecha_datos": e["fecha_datos"]}

    def ejecuciones(self):
        self._exigir_habilitado()
        return self.repo.ejecuciones()

    def detalle(self, zona_id, periodo, nivel, ambito):
        data = self.resultados(periodo, nivel, ambito)
        item = next((i for i in data["items"] if i["zona"]["id"] == zona_id), None)
        if not item:
            raise NoEncontrado()
        return {**item, "fecha_datos": data["fecha_datos"], "ejecucion": data["ejecucion"], "etiqueta": ETIQUETA, "descripcion_variables": DESCRIPCION_VARIABLES}
