"""Bandeja de depuración (CU-04): corregir y revalidar, descartar o conservar con observación."""

from core.exceptions import DomainError, NoEncontrado
from core.repositories.base import EventoAuditoria
from modules.cartera.services.cargas import fila_para_staging

PERSONALES = {"nombre", "cedula", "latitud", "longitud", "direccion", "rango_ingreso"}
EDITABLES = {
    "socios": ["codigo_socio", "cedula", "nombre", "agencia_codigo", "fecha_ingreso", "latitud", "longitud", "rango_ingreso", "direccion"],
    "creditos": ["codigo_credito", "codigo_socio", "monto", "fecha_desembolso", "plazo_meses", "estado"],
    "pagos": ["codigo_credito", "periodo", "valor_pagado", "valor_pendiente", "dias_atraso", "fecha_pago"],
}


class ServicioObservados:
    def __init__(self, observados, esquemas, datos, servicio_cargas, indicadores, auditoria, uow, reloj, al_recalcular=()):
        self.observados = observados
        self.esquemas = esquemas
        self.datos = datos
        self.cargas = servicio_cargas
        self.indicadores = indicadores
        self.auditoria = auditoria
        self.uow = uow
        self.reloj = reloj
        self.al_recalcular = list(al_recalcular)

    def listar(self, filtros, cursor, tamano):
        return self.observados.listar(filtros, cursor, tamano)

    def resumen(self):
        r = self.observados.resumen()
        r.update(self.datos.resumen_excluidos())
        return r

    def _bloquear_pendiente(self, obs_id, permitidos=("pendiente", "conservado")):
        o = self.observados.obtener(obs_id, bloquear=True)
        if not o:
            raise NoEncontrado()
        if o["estado"] not in permitidos:
            raise DomainError("ESTADO_INVALIDO", f"El registro ya fue {o['estado']}.")
        return o

    def _auditar(self, actor, accion, detalle, o, anterior=None, nuevo=None):
        self.auditoria.registrar(EventoAuditoria(
            categoria="datos", accion=accion, entidad_afectada=f"RegistroObservado#{o['id']}", detalle=detalle,
            usuario_id=actor.id, username=actor.username, valor_anterior=anterior, valor_nuevo=nuevo,
            metadatos={"carga_id": o["carga_id"], "tipo": o["tipo"], "fila": o["numero_fila"]},
        ))

    def corregir(self, obs_id, cambios, nota, actor):
        """RF-004.05: la corrección se revalida antes de incorporarse a mapas e indicadores."""
        with self.uow.atomic():
            o = self._bloquear_pendiente(obs_id)
            tipo = o["tipo"]
            invalidos = set(cambios) - set(EDITABLES[tipo])
            if invalidos:
                raise DomainError("VALIDACION", "Campos no editables: " + ", ".join(sorted(invalidos)))
            base = dict(o["datos_internos"].get("_fila", {}))
            fila = {**base, **{k: str(v) for k, v in cambios.items()}}
            if "cedula" in cambios:
                fila.pop("cedula_hash", None)
                fila.pop("cedula_mascara", None)
            campos = self.esquemas.vigente(tipo)["campos"]
            ctx = self.cargas._contexto({"periodo": o["periodo"]})
            r = self.cargas._validar_filas(tipo, [fila], campos, ctx)[0]
            if r.clasificacion != "valido":
                raise DomainError("REGISTRO_AUN_OBSERVADO", "El registro corregido todavía no cumple las validaciones.",
                                  [{"campo": m["campo"], "mensaje": m["motivo"]} for m in r.motivos])
            upsert = {"socios": self.datos.upsert_socios, "creditos": self.datos.upsert_creditos, "pagos": self.datos.upsert_pagos}[tipo]
            st = upsert([r.datos], o["carga_id"])
            datos_guardar = {**r.datos, "_fila": fila_para_staging(fila, r.datos)}
            self.observados.resolver(obs_id, "corregido", actor.id, nota or "", self.reloj(), datos=datos_guardar)
            periodos = self.cargas._periodos_afectados({"tipo": tipo, "periodo": o["periodo"] or r.datos.get("periodo")},
                                                       [f for f in st["fechas"] if f])
            self.indicadores.recalcular(periodos, {z for z in st["zonas"] if z} or None)
            for cb in self.al_recalcular:
                cb(periodos)
            ant = {k: ("[dato personal]" if k in PERSONALES else base.get(k)) for k in cambios}
            nue = {k: ("[dato personal modificado]" if k in PERSONALES else cambios[k]) for k in cambios}
            self._auditar(actor, "observado_corregido", f"Registro observado corregido e incorporado ({tipo}, fila {o['numero_fila']})", o, ant, nue)
        return self.observados.obtener(obs_id) | {"datos_internos": None}

    def descartar(self, obs_id, nota, actor):
        return self._resolver(obs_id, "descartado", nota, actor, "observado_descartado", "Registro observado descartado")

    def conservar(self, obs_id, nota, actor):
        """Se conserva con observación: queda excluido de mapas e indicadores y se cuenta como excluido (RF-004.06)."""
        return self._resolver(obs_id, "conservado", nota, actor, "observado_conservado", "Registro conservado con observación", ("pendiente",))

    def _resolver(self, obs_id, estado, nota, actor, accion, detalle, permitidos=("pendiente", "conservado")):
        if not (nota or "").strip():
            raise DomainError("VALIDACION", "Indique la justificación.", [{"campo": "nota", "mensaje": "La justificación es obligatoria."}])
        with self.uow.atomic():
            o = self._bloquear_pendiente(obs_id, permitidos)
            res = self.observados.resolver(obs_id, estado, actor.id, nota.strip(), self.reloj())
            self._auditar(actor, accion, f"{detalle} ({o['tipo']}, fila {o['numero_fila']})", o, {"estado": o["estado"]}, {"estado": estado, "nota": nota.strip()[:300]})
        res.pop("datos_internos", None)
        return res
