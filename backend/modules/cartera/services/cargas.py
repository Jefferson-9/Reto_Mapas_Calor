"""Orquestación de la importación síncrona por pasos (sección 8): subir → mapear → clasificar → confirmar."""

import re

from core.exceptions import DomainError, NoEncontrado
from core.repositories.base import EventoAuditoria
from core.security.privacy import cedula_hash, normalizar_cedula
from core.utils.periodos import es_periodo
from modules.cartera.services import lector
from modules.cartera.services.mapeo import mapear
from modules.cartera.services.validacion import VALIDADORES, aplicar_mapeo, enmascarar_fila

TIPOS = ("socios", "creditos", "pagos")
ESTADOS_EDITABLES = ("requiere_revision",)
_POSIBLE_CEDULA = re.compile(r"^\d{10,13}$")


def _mascara_generica(fila):
    """Previsualización antes del mapeo: enmascara cualquier valor con forma de cédula."""
    return {k: ("******" + str(v)[-4:] if _POSIBLE_CEDULA.match(str(v).strip()) else str(v)[:120]) for k, v in fila.items()}


def fila_para_staging(fila_mapeada, datos):
    """Fila mapeada sin la cédula completa (se conserva solo la huella y la máscara) para correcciones posteriores."""
    f = {k: v for k, v in fila_mapeada.items() if k != "cedula"}
    if datos.get("cedula_hash"):
        f["cedula_hash"], f["cedula_mascara"] = datos["cedula_hash"], datos.get("cedula_mascara", "")
    return f


class ServicioCargas:
    def __init__(self, cargas, esquemas, datos, observados, territorio, indicadores, auditoria, uow, parametros, almacen, reloj,
                 servicio_esquemas, al_recalcular=()):
        self.cargas = cargas
        self.esquemas = esquemas
        self.datos = datos
        self.observados = observados
        self.territorio = territorio
        self.indicadores = indicadores
        self.auditoria = auditoria
        self.uow = uow
        self.parametros = parametros
        self.almacen = almacen
        self.reloj = reloj
        self.servicio_esquemas = servicio_esquemas
        self.al_recalcular = list(al_recalcular)

    # ---------- auxiliares ----------
    def _auditar(self, actor, accion, detalle, carga, nuevo=None, anterior=None):
        self.auditoria.registrar(EventoAuditoria(
            categoria="datos", accion=accion, entidad_afectada=f"CargaDatos#{carga['id']}", detalle=detalle,
            usuario_id=actor.id, username=actor.username, valor_anterior=anterior, valor_nuevo=nuevo,
            metadatos={"tipo": carga["tipo"], "periodo": carga["periodo"], "archivo": carga["nombre_archivo"]},
        ))

    def obtener(self, carga_id, con_muestra=True):
        c = self.cargas.obtener(carga_id)
        if not c or c["tipo"] == "limites":
            raise NoEncontrado()
        c.pop("ruta_archivo", None)
        if con_muestra:
            c["muestra"] = self.cargas.muestra_staging(carga_id, 10)
        return c

    def listar(self, filtros, cursor, tamano):
        page = self.cargas.listar({**filtros, "excluir_limites": filtros.get("tipo") != "limites"}, cursor, tamano)
        for c in page["items"]:
            c.pop("ruta_archivo", None)
        return page

    # ---------- paso 1: subida ----------
    def subir(self, archivo, nombre, tipo, periodo, reemplazo, actor):
        errores = []
        if tipo not in TIPOS:
            errores.append({"campo": "tipo", "mensaje": "Seleccione el tipo de información: socios, créditos o pagos."})
        if not es_periodo(periodo):
            errores.append({"campo": "periodo", "mensaje": "Indique el período en formato AAAA-MM."})
        if not nombre.lower().endswith(".csv"):
            errores.append({"campo": "archivo", "mensaje": "El archivo debe tener extensión .csv."})
        if errores:
            raise DomainError("VALIDACION", "Revise los datos de la carga.", errores)
        p = self.parametros.todos()
        ruta, sha, _ = self.almacen.guardar(archivo, "csv", p["max_mb_carga"] * 1024 * 1024)
        try:
            formato = lector.detectar_formato(self.almacen.muestra(ruta))
            if not reemplazo and self.cargas.existe_completada(sha, tipo, periodo):
                raise DomainError("ARCHIVO_YA_CARGADO", "Este mismo archivo ya se cargó para el tipo y período indicados. "
                                  "Marque «reemplazar» si desea procesarlo de nuevo.", status=409)
        except DomainError:
            self.almacen.eliminar(ruta)
            raise
        esquema = self.esquemas.vigente(tipo)
        with self.uow.atomic():
            carga = self.cargas.crear({
                "esquema_id": esquema["id"], "nombre_archivo": nombre[:160], "ruta_archivo": ruta, "hash_archivo": sha, "tipo": tipo,
                "periodo": periodo, "usuario_id": actor.id, "estado": "validando", "columnas_archivo": formato["encabezados"], "reemplazo": reemplazo,
            })
            self._auditar(actor, "carga_subida", f"Archivo «{nombre[:80]}» subido ({tipo}, {periodo})", carga)
        return self._mapear_y_clasificar(carga["id"], {}, formato)

    # ---------- paso 2: mapeo y clasificación ----------
    def remapear(self, carga_id, mapeo_manual, guardar_alias, actor):
        carga = self.cargas.obtener(carga_id)
        if not carga or carga["tipo"] == "limites":
            raise NoEncontrado()
        if carga["estado"] not in ESTADOS_EDITABLES:
            raise DomainError("ESTADO_INVALIDO", "La carga ya no admite cambios de mapeo.")
        invalidas = [c for c in mapeo_manual.values() if c and c not in carga["columnas_archivo"]]
        if invalidas:
            raise DomainError("VALIDACION", "Columnas inexistentes en el archivo: " + ", ".join(invalidas))
        if guardar_alias:
            self.servicio_esquemas.agregar_alias(carga["tipo"], {k: v for k, v in mapeo_manual.items() if v}, actor)
        self.cargas.borrar_staging(carga_id, ["valido", "observado", "rechazado"])
        formato = lector.detectar_formato(self.almacen.muestra(carga["ruta_archivo"]))
        return self._mapear_y_clasificar(carga_id, mapeo_manual, formato)

    def _mapear_y_clasificar(self, carga_id, mapeo_manual, formato):
        carga = self.cargas.obtener(carga_id)
        esquema = self.esquemas.vigente(carga["tipo"])
        campos = esquema["campos"]
        m = mapear(formato["encabezados"], campos, mapeo_manual)
        if m["faltantes"]:
            etiquetas = {c["campo"]: c["etiqueta"] for c in campos}
            muestra = []
            for bloque in lector.leer_bloques(self.almacen.ruta(carga["ruta_archivo"]), formato, 10**9):
                muestra = [_mascara_generica(f) for f in bloque[:5]]
                break
            self.cargas.actualizar(carga_id, {
                "estado": "requiere_revision", "mapeo": m["mapeo"], "faltantes": m["faltantes"], "esquema_id": esquema["id"],
                "mensaje": "Faltan columnas obligatorias: " + ", ".join(etiquetas[f] for f in m["faltantes"]),
                "resumen": {"no_reconocidas": m["no_reconocidas"], "vista_previa": muestra},
            })
            return self.obtener(carga_id)
        try:
            cont = self._clasificar(carga, campos, m["mapeo"], formato)
        except DomainError as e:
            self.cargas.borrar_staging(carga_id, ["valido", "observado", "rechazado"])
            self.cargas.actualizar(carga_id, {"estado": "fallida", "mensaje": e.message[:300]})
            self.almacen.eliminar(carga["ruta_archivo"])
            raise
        self.cargas.actualizar(carga_id, {
            "estado": "requiere_revision", "mapeo": m["mapeo"], "faltantes": [], "esquema_id": esquema["id"], "leidos": cont["leidos"],
            "observados": cont["observado"], "rechazados": cont["rechazado"], "cargados": 0,
            "mensaje": "Archivo validado. Revise el resumen y confirme la carga.",
            "resumen": {"validos": cont["valido"], "observados": cont["observado"], "rechazados": cont["rechazado"], "no_reconocidas": m["no_reconocidas"]},
        })
        return self.obtener(carga_id)

    def _contexto(self, carga):
        return {"agencias": self.datos.agencias_por_codigo(), "decimales_min": self.parametros.valor("decimales_minimos_coordenada"),
                "periodo": carga["periodo"], "vistos": set(), "cedulas_db": {}, "socios_db": {}, "creditos_db": {}}

    def _preparar_bloque(self, tipo, filas, ctx):
        if tipo == "socios":
            ctx["cedulas_db"] = self.datos.cedulas_existentes({cedula_hash(f.get("cedula")) for f in filas if normalizar_cedula(f.get("cedula"))}
                                                              | {f["cedula_hash"] for f in filas if f.get("cedula_hash")})
        elif tipo == "creditos":
            ctx["socios_db"] = self.datos.socios_existentes({f.get("codigo_socio", "").strip() for f in filas})
        elif tipo == "pagos":
            ctx["creditos_db"] = self.datos.creditos_existentes({f.get("codigo_credito", "").strip() for f in filas})

    def _validar_filas(self, tipo, filas, campos, ctx):
        self._preparar_bloque(tipo, filas, ctx)
        resultados = [VALIDADORES[tipo](f, campos, ctx) for f in filas]
        if tipo == "socios":
            puntos = [(i, r.datos["latitud"], r.datos["longitud"]) for i, r in enumerate(resultados) if r.datos.get("precision_valida")]
            zonas = self.territorio.zonas_de_puntos(puntos)
            for i, r in enumerate(resultados):
                if r.datos.get("precision_valida"):
                    z = zonas.get(str(i))
                    if z:
                        r.datos["zona_id"] = z
                    else:
                        r.observar("latitud", "Sin ubicación válida: fuera de las zonas geográficas vigentes")
        return [r.cerrar() for r in resultados]

    def _clasificar(self, carga, campos, mapeo, formato):
        ctx = self._contexto(carga)
        cont = {"leidos": 0, "valido": 0, "observado": 0, "rechazado": 0}
        max_filas = self.parametros.valor("max_filas_carga")
        for bloque in lector.leer_bloques(self.almacen.ruta(carga["ruta_archivo"]), formato, max_filas):
            mapeadas = [aplicar_mapeo(f, mapeo) for f in bloque]
            resultados = self._validar_filas(carga["tipo"], mapeadas, campos, ctx)
            staging = []
            for i, (orig, fm, r) in enumerate(zip(bloque, mapeadas, resultados)):
                n = cont["leidos"] + i + 2  # línea del CSV (1 = encabezados)
                datos = {**r.datos, "_fila": fila_para_staging(fm, r.datos)}
                staging.append({"numero_fila": n, "clasificacion": r.clasificacion, "datos": datos,
                                "fila_raw": enmascarar_fila(orig, mapeo, campos), "motivos": r.motivos})
                cont[r.clasificacion] += 1
            cont["leidos"] += len(bloque)
            self.cargas.guardar_staging(carga["id"], staging)
        if cont["leidos"] == 0:
            raise DomainError("ARCHIVO_VACIO", "El archivo no tiene registros.")
        return cont

    # ---------- paso 3: confirmación transaccional ----------
    def confirmar(self, carga_id, actor):
        try:
            with self.uow.atomic():
                carga = self.cargas.bloquear(carga_id)
                if not carga or carga["tipo"] == "limites":
                    raise NoEncontrado()
                if carga["estado"] != "requiere_revision" or carga["faltantes"]:
                    raise DomainError("ESTADO_INVALIDO", "La carga no está lista para confirmarse.")
                resultado = self._persistir(carga, actor)
        except DomainError:
            raise
        except Exception:
            # rollback completo ya aplicado por la transacción; se deja constancia del fallo
            self.cargas.actualizar(carga_id, {"estado": "fallida", "mensaje": "La carga falló y se revirtió por completo. No se guardó ningún registro."})
            raise DomainError("CARGA_FALLIDA", "La carga falló y se revirtió por completo. No se guardó ningún registro.", status=500) from None
        self.almacen.eliminar(carga["ruta_archivo"])
        return resultado

    def _persistir(self, carga, actor):
        tipo, lote = carga["tipo"], self.parametros.valor("tamano_lote")
        upsert = {"socios": self.datos.upsert_socios, "creditos": self.datos.upsert_creditos, "pagos": self.datos.upsert_pagos}[tipo]
        total = {"nuevos": 0, "actualizados": 0, "sin_cambio": 0, "cambios": [], "cambios_truncados": False}
        zonas, fechas = set(), []
        for filas in self.cargas.iterar_staging(carga["id"], "valido", lote):
            st = upsert([f["datos"] for f in filas], carga["id"])
            for k in ("nuevos", "actualizados", "sin_cambio"):
                total[k] += st[k]
            total["cambios"] += st["cambios"][: max(0, 200 - len(total["cambios"]))]
            total["cambios_truncados"] |= st["cambios_truncados"] or len(st["cambios"]) + len(total["cambios"]) > 200
            zonas |= {z for z in st["zonas"] if z}
            fechas += [f for f in st["fechas"] if f]
        obs = 0
        for filas in self.cargas.iterar_staging(carga["id"], "observado", lote):
            obs += self.observados.crear_lote(carga["id"], tipo, carga["periodo"], filas)
        self.cargas.borrar_staging(carga["id"], ["valido", "observado"])
        cargados = total["nuevos"] + total["actualizados"] + total["sin_cambio"]
        ahora = self.reloj()
        resumen = {"nuevos": total["nuevos"], "actualizados": total["actualizados"], "sin_cambio": total["sin_cambio"],
                   "observados": obs, "rechazados": carga["rechazados"], "leidos": carga["leidos"]}
        self.cargas.actualizar(carga["id"], {"estado": "completada", "cargados": cargados, "observados": obs, "confirmada_en": ahora,
                                             "resumen": resumen, "mensaje": "Carga completada."})
        periodos = self._periodos_afectados(carga, fechas)
        self.indicadores.recalcular(periodos, zonas or None)
        for cb in self.al_recalcular:
            cb(periodos)
        self._auditar(actor, "carga_confirmada", f"Carga confirmada: {cargados} cargados, {obs} observados, {carga['rechazados']} rechazados",
                      carga, nuevo={**resumen, "cambios": total["cambios"], "cambios_truncados": total["cambios_truncados"]})
        return {**self.obtener(carga["id"], con_muestra=False), "periodos_recalculados": periodos}

    def _periodos_afectados(self, carga, fechas):
        """Pagos: solo su período. Socios/créditos: períodos con datos desde la fecha más antigua del archivo."""
        if carga["tipo"] == "pagos":
            return [carga["periodo"]]
        existentes = set(self.indicadores.periodos()) | {carga["periodo"]}
        desde = min([carga["periodo"], *(f[:7] for f in fechas)])
        return sorted(p for p in existentes if p >= desde)

    def cancelar(self, carga_id, actor):
        with self.uow.atomic():
            carga = self.cargas.bloquear(carga_id)
            if not carga or carga["tipo"] == "limites":
                raise NoEncontrado()
            if carga["estado"] not in ("pendiente", "validando", "requiere_revision"):
                raise DomainError("ESTADO_INVALIDO", "Solo se pueden cancelar cargas que no se han confirmado.")
            self.cargas.borrar_staging(carga_id, ["valido", "observado", "rechazado"])
            self.cargas.actualizar(carga_id, {"estado": "cancelada", "mensaje": "Carga cancelada por el usuario."})
            self._auditar(actor, "carga_cancelada", "Carga cancelada antes de confirmar", carga)
        self.almacen.eliminar(carga["ruta_archivo"])
        return self.obtener(carga_id, con_muestra=False)

    def errores(self, carga_id):
        self.obtener(carga_id, con_muestra=False)
        return self.cargas.iterar_errores(carga_id)
