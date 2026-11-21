"""Esquemas de carga configurables y versionados (sección 6.3)."""

import csv
import io
import re

from core.exceptions import DomainError
from core.repositories.base import EventoAuditoria
from core.utils.texto import normalizar_encabezado
from modules.cartera.esquemas_iniciales import EJEMPLOS

TIPOS_DATO = {"texto", "numero", "entero", "fecha", "booleano"}
_NOMBRE = re.compile(r"^[a-z][a-z0-9_]{1,39}$")


class ServicioEsquemas:
    def __init__(self, repo, auditoria, uow):
        self.repo = repo
        self.auditoria = auditoria
        self.uow = uow

    def vigente(self, tipo):
        e = self.repo.vigente(tipo)
        if not e:
            raise DomainError("ESQUEMA_NO_CONFIGURADO", f"No existe un esquema vigente para «{tipo}».")
        return e

    def versiones(self, tipo):
        return self.repo.versiones(tipo)

    def validar(self, tipo, campos, actual):
        errores = []
        nombres, alias_vistos = set(), {}
        for i, c in enumerate(campos):
            nombre = str(c.get("campo", "")).strip()
            if not _NOMBRE.match(nombre):
                errores.append({"campo": f"campos[{i}].campo", "mensaje": "Nombre interno no válido (minúsculas, números y _)."})
            if nombre in nombres:
                errores.append({"campo": f"campos[{i}].campo", "mensaje": f"Campo repetido «{nombre}»."})
            nombres.add(nombre)
            if not str(c.get("etiqueta", "")).strip():
                errores.append({"campo": f"campos[{i}].etiqueta", "mensaje": "La etiqueta es obligatoria."})
            if c.get("tipo_dato") not in TIPOS_DATO:
                errores.append({"campo": f"campos[{i}].tipo_dato", "mensaje": "Tipo de dato no válido."})
            for a in [nombre, *c.get("alias", [])]:
                n = normalizar_encabezado(a)
                if n in alias_vistos and alias_vistos[n] != nombre:
                    errores.append({"campo": f"campos[{i}].alias", "mensaje": f"El alias «{a}» ya pertenece a «{alias_vistos[n]}»."})
                alias_vistos[n] = nombre
        nucleo_actual = {c["campo"]: c for c in actual["campos"] if c["nucleo"]} if actual else {}
        nuevos = {c.get("campo"): c for c in campos}
        for nombre, c in nucleo_actual.items():
            n = nuevos.get(nombre)
            if not n:
                errores.append({"campo": "campos", "mensaje": f"El campo núcleo «{c['etiqueta']}» no se puede eliminar."})
            elif bool(n.get("requerido")) != bool(c["requerido"]) or not n.get("nucleo") or n.get("tipo_dato") != c["tipo_dato"]:
                errores.append({"campo": "campos", "mensaje": f"El campo núcleo «{c['etiqueta']}» no puede cambiar de tipo ni de obligatoriedad."})
        for nombre, n in nuevos.items():
            if n.get("nucleo") and nombre not in nucleo_actual:
                errores.append({"campo": "campos", "mensaje": f"«{nombre}» no puede declararse núcleo: los campos adicionales son opcionales."})
        return errores

    def actualizar(self, tipo, campos, actor, motivo="Esquema actualizado"):
        actual = self.repo.vigente(tipo)
        # Un campo núcleo conserva su obligatoriedad original (p. ej. `zona_superior_codigo` es núcleo pero opcional)
        req_nucleo = {c["campo"]: c["requerido"] for c in (actual["campos"] if actual else []) if c["nucleo"]}
        limpios = [{
            "campo": str(c["campo"]).strip(), "etiqueta": str(c["etiqueta"]).strip()[:80], "tipo_dato": c["tipo_dato"],
            "requerido": req_nucleo.get(str(c["campo"]).strip(), True) if c.get("nucleo") else bool(c.get("requerido")), "nucleo": bool(c.get("nucleo")),
            "sensible": bool(c.get("sensible")), "alias": sorted({str(a).strip()[:60] for a in c.get("alias", []) if str(a).strip()}),
        } for c in campos]
        errores = self.validar(tipo, limpios, actual)
        if errores:
            raise DomainError("VALIDACION", "El esquema no es válido.", errores)
        with self.uow.atomic():
            nuevo = self.repo.crear_version(tipo, limpios, actor.id)
            self.auditoria.registrar(EventoAuditoria(
                categoria="configuracion", accion="esquema_actualizado", entidad_afectada=f"EsquemaCarga:{tipo}",
                detalle=f"{motivo}: «{tipo}» versión {nuevo['version']}", usuario_id=actor.id, username=actor.username,
                valor_anterior={"version": actual["version"], "campos": actual["campos"]} if actual else None,
                valor_nuevo={"version": nuevo["version"], "campos": limpios},
            ))
        return nuevo

    def agregar_alias(self, tipo, mapeo, actor):
        """Guarda el mapeo manual como alias para las siguientes cargas."""
        actual = self.vigente(tipo)
        campos = [dict(c, alias=list(c.get("alias", []))) for c in actual["campos"]]
        cambio = False
        for c in campos:
            col = mapeo.get(c["campo"])
            if col and normalizar_encabezado(col) not in {normalizar_encabezado(a) for a in [c["campo"], *c["alias"]]}:
                c["alias"].append(col)
                cambio = True
        return self.actualizar(tipo, campos, actor, "Alias agregados desde el mapeo de una carga") if cambio else actual

    def plantilla(self, tipo):
        e = self.vigente(tipo)
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow([c["campo"] for c in e["campos"]])
        ejemplo = EJEMPLOS.get(tipo, [])
        w.writerow([ejemplo[i] if i < len(ejemplo) else "" for i in range(len(e["campos"]))])
        return "﻿" + buf.getvalue()
