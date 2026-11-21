"""Consultas de visualización (CU-07 a CU-10) y resumen del panel. Siempre filtradas por el ámbito en el servidor."""

from decimal import Decimal

from core.exceptions import DomainError, NoEncontrado
from core.pagination import decode_cursor, encode_cursor
from core.utils.numeros import redondear
from core.utils.periodos import es_periodo, fin_de_periodo, periodo_anterior
from modules.analitica.services.calculos import INDICADORES, agregar_por_nivel, comparar_valores, rangos_leyenda
from modules.cartera.services.indicadores import agregar

NIVELES = ("provincia", "canton", "parroquia", "barrio")
VARIABLES_MAPA = {
    "total_socios": "Concentración de socios",
    "total_creditos": "Número de créditos",
    "monto_cartera": "Monto de créditos",
    "creditos_atrasados": "Pagos atrasados",
    "tasa_morosidad": "Tasa de morosidad (%)",
    "penetracion_pct": "Penetración de socios (%)",
    "var_atrasados": "Variación de pagos atrasados",
}


def _s(v):
    return None if v is None else (format(v, "f") if isinstance(v, Decimal) else v)


def _ind_json(ind):
    return None if ind is None else {k: _s(ind[k]) for k in INDICADORES}


class ServicioConsultas:
    def __init__(self, territorio, indicadores_repo, cargas_repo, datos_repo, clasificacion, campo_repo, parametros):
        self.territorio = territorio
        self.indicadores = indicadores_repo
        self.cargas = cargas_repo
        self.datos = datos_repo
        self.clasificacion = clasificacion
        self.campo = campo_repo
        self.parametros = parametros

    # ----- utilidades -----
    def periodos(self):
        ps = self.indicadores.periodos()
        return {"items": ps, "ultimo": ps[-1] if ps else None, "ultima_carga_at": self.cargas.ultima_carga_en()}

    def _periodo(self, periodo):
        if periodo and not es_periodo(periodo):
            raise DomainError("VALIDACION", "Período no válido (AAAA-MM).")
        ps = self.indicadores.periodos()
        if not ps:
            raise DomainError("SIN_DATOS", "Aún no hay períodos con datos cargados.", status=404)
        return periodo or ps[-1]

    def _base(self, ambito, periodos, zona_id=None):
        jer = self.territorio.jerarquia()
        hojas = self.territorio.hojas_en_ambito(ambito, jer)
        if zona_id is not None:
            if zona_id not in self.territorio.zonas_visibles(ambito, jer):
                raise NoEncontrado()
            hojas &= jer.hojas_de(zona_id)
        filas = {}
        for f in self.indicadores.leer(periodos, hojas):
            filas.setdefault(f["periodo"], {})[f["zona_id"]] = f
        return jer, hojas, filas

    def _zona_json(self, jer, zid):
        z = jer.por_id[zid]
        return {"id": zid, "codigo": z["codigo"], "nombre": z["nombre"], "tipo_zona": z["tipo_zona"], "zona_superior_id": z["zona_superior_id"],
                "hogares_estimados": z["hogares_estimados"], "fuente_oficial": z["fuente_oficial"], "centroide": z["centroide"]}

    def _validar_nivel(self, nivel):
        if nivel not in NIVELES:
            raise DomainError("VALIDACION", "Nivel geográfico no válido.")

    # ----- CU-09: indicadores por zona -----
    def indicadores_por_zona(self, ambito, periodo, nivel, padre_id, orden, desc, filtro_min, cursor, tamano):
        periodo = self._periodo(periodo)
        self._validar_nivel(nivel)
        jer, hojas, filas = self._base(ambito, [periodo])
        if padre_id is not None and padre_id not in jer.por_id:
            raise NoEncontrado()
        filas_p = filas.get(periodo, {})
        items = []
        for a in agregar_por_nivel(jer, hojas, filas_p, nivel, padre_id):
            ultima = max((filas_p[h]["ultima_carga_at"] for h in a["hojas"] if h in filas_p and filas_p[h]["ultima_carga_at"]), default=None)
            items.append({"zona": self._zona_json(jer, a["zona_id"]), "indicadores": _ind_json(a["indicadores"]), "sin_datos": a["indicadores"] is None,
                          "ultima_carga_at": ultima})
        if filtro_min:
            campo, minimo = filtro_min
            items = [i for i in items if i["indicadores"] and i["indicadores"][campo] is not None and Decimal(str(i["indicadores"][campo])) >= minimo]
        if orden in INDICADORES:
            con = [i for i in items if i["indicadores"] and i["indicadores"][orden] is not None]
            sin = [i for i in items if not (i["indicadores"] and i["indicadores"][orden] is not None)]
            con.sort(key=lambda i: Decimal(str(i["indicadores"][orden])), reverse=desc)
            items = con + sorted(sin, key=lambda i: i["zona"]["nombre"])
        else:
            items.sort(key=lambda i: i["zona"]["nombre"], reverse=desc)
        inicio = decode_cursor(cursor, 1)[0] if cursor else 0
        tamano = max(1, min(int(tamano), 100))
        pagina = items[inicio: inicio + tamano]
        mas = inicio + tamano < len(items)
        return {"items": pagina, "next_cursor": encode_cursor([inicio + tamano]) if mas else None, "has_more": mas,
                "total_count": None if cursor else len(items), "periodo": periodo,
                "ultima_carga_at": self.cargas.ultima_carga_en(periodo), "nivel": nivel}

    # ----- panel -----
    def resumen(self, ambito, periodo, nivel_grafica="barrio", zona_id=None):
        periodo = self._periodo(periodo)
        todos = self.indicadores.periodos()
        anterior = periodo_anterior(periodo)
        jer, hojas, filas = self._base(ambito, todos, zona_id)

        hogares = {z: jer.por_id[z]["hogares_estimados"] for z in hojas}

        def total(p):
            fs = list(filas.get(p, {}).values())
            return agregar(fs, hogares) if fs else None

        actual, previo = total(periodo), total(anterior)
        kpis = {}
        for k in INDICADORES:
            v, a = (actual or {}).get(k), (previo or {}).get(k)
            var = None
            es_razon = k in ("tasa_morosidad", "penetracion_pct")
            if v is not None and a is not None and (es_razon or a != 0):
                dif = Decimal(str(v)) - Decimal(str(a))
                var = str(redondear(dif if es_razon else dif / Decimal(str(a)) * 100))
            kpis[k] = {"valor": _s(v), "anterior": _s(a), "variacion": var, "tipo_variacion": "puntos" if k in ("tasa_morosidad", "penetracion_pct") else "porcentaje"}
        evolucion = [{"periodo": p, **(_ind_json(total(p)) or {k: None for k in INDICADORES})} for p in todos if p <= periodo][-12:]
        for e in evolucion:
            e["sin_datos"] = e["total_socios"] is None
        por_zona = agregar_por_nivel(jer, hojas, filas.get(periodo, {}), nivel_grafica)
        grafica = sorted(
            [{"zona": jer.por_id[a["zona_id"]]["nombre"], "zona_id": a["zona_id"], "monto_cartera": _s(a["indicadores"]["monto_cartera"]),
              "tasa_morosidad": _s(a["indicadores"]["tasa_morosidad"]), "total_creditos": a["indicadores"]["total_creditos"]}
             for a in por_zona if a["indicadores"]],
            key=lambda x: Decimal(x["monto_cartera"]), reverse=True)[:8]
        parroquias = sorted(
            [{"zona": jer.por_id[a["zona_id"]]["nombre"], "zona_id": a["zona_id"], "total_socios": a["indicadores"]["total_socios"],
              "penetracion_pct": _s(a["indicadores"]["penetracion_pct"])} for a in agregar_por_nivel(jer, hojas, filas.get(periodo, {}), "parroquia") if a["indicadores"]],
            key=lambda x: Decimal(x["penetracion_pct"] or -1), reverse=True)
        clasif = self.clasificacion.clasificacion(periodo, ambito)
        clasif["items"] = [i for i in clasif["items"] if i["zona"]["id"] in hojas]
        dist = {}
        for it in clasif["items"]:
            nombre = it["categoria"]["nombre"] if it["categoria"] else "Sin clasificar"
            color = it["categoria"]["color_hex"] if it["categoria"] else "#9aa5b5"
            dist.setdefault(nombre, {"categoria": nombre, "color": color, "zonas": 0})["zonas"] += 1
        return {
            "periodo": periodo, "periodo_anterior": anterior if previo else None, "sin_datos": actual is None,
            "ultima_carga_at": self.cargas.ultima_carga_en(periodo), "kpis": kpis, "evolucion": evolucion,
            "grafica_zonas": {"nivel": nivel_grafica, "items": grafica},
            "zonas_prioritarias": clasif["items"][:5], "criterios_version": clasif["version"], "mensaje_clasificacion": clasif.get("mensaje"),
            "distribucion_categorias": list(dist.values()), "penetracion_parroquias": parroquias,
            "excluidos": self.datos.resumen_excluidos(),
        }

    # ----- CU-07/08: mapa -----
    def mapa_zonas(self, ambito, periodo, nivel, padre_id, variable, periodo_comparar=None, detalle="media"):
        periodo = self._periodo(periodo)
        self._validar_nivel(nivel)
        if variable not in VARIABLES_MAPA:
            raise DomainError("VALIDACION", "Variable no válida.")
        if variable == "var_atrasados" and not es_periodo(periodo_comparar or ""):
            raise DomainError("VALIDACION", "Indique el período de comparación para la variación de pagos atrasados.")
        periodos = [periodo] + ([periodo_comparar] if variable == "var_atrasados" else [])
        jer, hojas, filas = self._base(ambito, periodos)
        agregados = agregar_por_nivel(jer, hojas, filas.get(periodo, {}), nivel, padre_id)
        previos = {a["zona_id"]: a for a in agregar_por_nivel(jer, hojas, filas.get(periodo_comparar, {}), nivel, padre_id)} if variable == "var_atrasados" else {}
        cats = self.clasificacion.categorias_de(periodo, [a["zona_id"] for a in agregados]) if nivel == "barrio" else {}
        geoms = self.territorio.geometrias([a["zona_id"] for a in agregados], detalle)
        poligonos, centroides, valores = [], [], []
        for a in agregados:
            zid, ind = a["zona_id"], a["indicadores"]
            if variable == "var_atrasados":
                prev = previos.get(zid, {}).get("indicadores")
                valor = None if not ind or not prev else ind["creditos_atrasados"] - prev["creditos_atrasados"]
            else:
                valor = None if not ind else ind[variable]
            valores.append(valor)
            z = jer.por_id[zid]
            cat = cats.get(zid)
            props = {"id": zid, "codigo": z["codigo"], "nombre": z["nombre"], "tipo_zona": z["tipo_zona"], "valor": None if valor is None else float(valor),
                     "sin_datos": valor is None, "indicadores": _ind_json(ind), "fuente_oficial": z["fuente_oficial"],
                     "categoria": cat["nombre"] if cat else None, "categoria_color": cat["color_hex"] if cat else None}
            if zid in geoms:
                poligonos.append({"type": "Feature", "id": zid, "geometry": geoms[zid], "properties": props})
            if z["centroide"] and valor is not None:
                centroides.append({"type": "Feature", "id": zid, "geometry": {"type": "Point", "coordinates": z["centroide"]},
                                   "properties": {"id": zid, "nombre": z["nombre"], "peso": float(valor)}})
        hay = [v for v in valores if v is not None]
        return {
            "periodo": periodo, "nivel": nivel, "variable": variable, "variable_etiqueta": VARIABLES_MAPA[variable],
            "zonas": {"type": "FeatureCollection", "features": poligonos}, "calor": {"type": "FeatureCollection", "features": centroides},
            "leyenda": rangos_leyenda(hay), "max_peso": max((abs(float(v)) for v in hay), default=0),
            "sin_datos_suficientes": len(hay) == 0, "mensaje": None if hay else "No hay datos suficientes para la variable y el período elegidos.",
            "ultima_carga_at": self.cargas.ultima_carga_en(periodo), "periodo_comparar": periodo_comparar,
            "demo": any("DEMO" in (jer.por_id[a["zona_id"]]["fuente_oficial"] or "") for a in agregados),
        }

    def puntos(self, ambito, tipo, bbox, periodo=None):
        """Puntos individuales del bbox visible: solo roles con marcadores individuales y con límite máximo."""
        if not ambito.marcadores_individuales:
            raise DomainError("SIN_PERMISO", "Su rol consulta información agregada, no ubicaciones individuales.", status=403)
        if bbox is None:
            raise DomainError("VALIDACION", "Indique un recuadro (bbox) válido y acotado.")
        hojas = self.territorio.hojas_en_ambito(ambito)
        limite = self.parametros.valor("max_puntos_mapa")
        if tipo == "socios":
            corte = fin_de_periodo(periodo) if periodo and es_periodo(periodo) else None
            filas, total = self.datos.puntos_socios(hojas, bbox, limite, corte)
            feats = [{"type": "Feature", "id": f["id"], "geometry": {"type": "Point", "coordinates": [f["lng"], f["lat"]]},
                      "properties": {"zona_id": f["zona_id"], "tipo": "socio"}} for f in filas]
        elif tipo == "prospectos":
            filas = self.campo.puntos_prospectos(hojas, bbox, limite)
            total = len(filas)
            feats = [{"type": "Feature", "id": f["id"], "geometry": {"type": "Point", "coordinates": [f["lng"], f["lat"]]},
                      "properties": {"zona_id": f["zona_id"], "nombre": f["nombre"], "tipo": "prospecto"}} for f in filas]
        else:
            raise DomainError("VALIDACION", "Tipo de puntos no válido.")
        return {"type": "FeatureCollection", "features": feats, "total_en_area": total, "truncado": total > len(feats), "limite": limite}

    def detalle_zona(self, ambito, zona_id, periodo):
        """RF-007.03 / RF-008.04: socios, créditos y montos de la zona seleccionada (o «Sin datos»)."""
        periodo = self._periodo(periodo)
        jer, hojas, filas = self._base(ambito, [periodo])
        if zona_id not in self.territorio.zonas_visibles(ambito, jer):
            raise NoEncontrado()
        sub = jer.hojas_de(zona_id) & hojas

        fs = [filas.get(periodo, {})[h] for h in sub if h in filas.get(periodo, {})]
        ind = agregar(fs, {h: jer.por_id[h]["hogares_estimados"] for h in sub}) if fs else None
        cat = self.clasificacion.categorias_de(periodo, [zona_id]).get(zona_id) if zona_id in jer.hojas else None
        return {"zona": self._zona_json(jer, zona_id), "ruta": [jer.por_id[a]["nombre"] for a in reversed(jer.ancestros(zona_id))],
                "periodo": periodo, "indicadores": _ind_json(ind), "sin_datos": ind is None,
                "categoria": {"nombre": cat["nombre"], "color_hex": cat["color_hex"]} if cat else None,
                "prospectos": sum(self.campo.contar_prospectos(sub).values()) if ambito.marcadores_individuales else None}

    # ----- CU-10: comparación temporal -----
    def comparar(self, ambito, zona_ids, periodos, indicadores):
        if not zona_ids or len(zona_ids) > 10:
            raise DomainError("VALIDACION", "Seleccione entre 1 y 10 zonas.")
        if len(periodos) < 2 or len(periodos) > 12 or not all(es_periodo(p) for p in periodos):
            raise DomainError("VALIDACION", "Seleccione entre 2 y 12 períodos válidos.")
        indicadores = [i for i in indicadores if i in INDICADORES] or ["total_creditos", "creditos_atrasados", "tasa_morosidad"]
        periodos = sorted(set(periodos))
        jer, hojas, filas = self._base(ambito, periodos)
        visibles = self.territorio.zonas_visibles(ambito, jer)

        resultado = []
        for zid in zona_ids:
            if zid not in visibles:
                raise NoEncontrado()
            sub = jer.hojas_de(zid) & hojas
            hog = {h: jer.por_id[h]["hogares_estimados"] for h in sub}
            por_periodo = {}
            for p in periodos:
                fs = [filas.get(p, {})[h] for h in sub if h in filas.get(p, {})]
                por_periodo[p] = agregar(fs, hog) if fs else None
            series = []
            for ind in indicadores:
                serie = [(p, None if por_periodo[p] is None else por_periodo[p][ind]) for p in periodos]
                series.append({"indicador": ind, "valores": [{"periodo": p, "valor": _s(v)} for p, v in serie], "cambios": comparar_valores(serie),
                               "total": comparar_valores([serie[0], serie[-1]])[0]})
            resultado.append({"zona": self._zona_json(jer, zid), "series": series, "periodos_sin_datos": [p for p in periodos if por_periodo[p] is None]})
        return {"periodos": periodos, "indicadores": indicadores, "zonas": resultado}
