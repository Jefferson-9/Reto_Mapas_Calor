"""Validación y normalización de filas (funciones puras, sin base de datos ni HTTP).

Clasificación (sección 8): válido · observado (incompleto, duplicado, sin ubicación válida, referencia faltante)
· rechazado (valor con formato imposible de interpretar en un campo núcleo).
"""

import datetime
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from core.security.privacy import cedula_hash, cedula_mascara, cedula_valida_formato
from core.utils.geo import validar_coordenadas
from core.utils.periodos import es_periodo

CAMPOS_MODELO = {
    "socios": {"codigo_socio", "cedula", "nombre", "agencia_codigo", "fecha_ingreso", "latitud", "longitud", "rango_ingreso", "direccion"},
    "creditos": {"codigo_credito", "codigo_socio", "monto", "fecha_desembolso", "plazo_meses", "estado"},
    "pagos": {"codigo_credito", "periodo", "valor_pagado", "valor_pendiente", "dias_atraso", "fecha_pago"},
}
ESTADOS_CREDITO = {"vigente", "vencido", "cancelado", "castigado"}


@dataclass
class Resultado:
    clasificacion: str = "valido"
    datos: dict = field(default_factory=dict)
    observaciones: list = field(default_factory=list)
    rechazos: list = field(default_factory=list)

    def observar(self, campo, motivo):
        self.observaciones.append({"campo": campo, "motivo": motivo})

    def rechazar(self, campo, motivo):
        self.rechazos.append({"campo": campo, "motivo": motivo})

    def cerrar(self):
        self.clasificacion = "rechazado" if self.rechazos else ("observado" if self.observaciones else "valido")
        return self

    @property
    def motivos(self):
        return self.rechazos + self.observaciones


def parse_fecha(texto):
    s = (texto or "").strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def parse_decimal(texto):
    s = (texto or "").strip()
    if not re.fullmatch(r"-?\d+(\.\d+)?", s):
        return None
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def parse_entero(texto):
    s = (texto or "").strip()
    return int(s) if re.fullmatch(r"-?\d+", s) else None


def parse_bool(texto):
    return {"si": True, "sí": True, "true": True, "1": True, "no": False, "false": False, "0": False}.get((texto or "").strip().lower())


PARSERS = {"fecha": parse_fecha, "numero": parse_decimal, "entero": parse_entero, "booleano": parse_bool, "texto": lambda s: (s or "").strip()}


def _json(v):
    if isinstance(v, (datetime.date, Decimal)):
        return str(v)
    return v


def enmascarar_fila(fila_original, mapeo, campos):
    """Copia de la fila con los campos sensibles enmascarados (para fila_raw y descargas)."""
    sensibles = {mapeo[c["campo"]] for c in campos if c.get("sensible") and c["campo"] in mapeo}
    out = {}
    for k, v in fila_original.items():
        if k in sensibles:
            out[k] = cedula_mascara(v) if v else ""
        else:
            out[k] = str(v)[:200]
    return out


def _requeridos(res, fila, campos):
    for c in campos:
        if c["campo"] == "cedula" and fila.get("cedula_hash"):
            continue  # en correcciones la cédula ya llega como huella HMAC
        if c["requerido"] and not str(fila.get(c["campo"], "") or "").strip():
            res.observar(c["campo"], f"Falta el dato obligatorio «{c['etiqueta']}»")


def _extras(res, tipo, fila, campos):
    atributos = {}
    for c in campos:
        if c["campo"] in CAMPOS_MODELO[tipo]:
            continue
        valor = str(fila.get(c["campo"], "") or "").strip()
        if not valor:
            continue
        parsed = PARSERS.get(c["tipo_dato"], PARSERS["texto"])(valor)
        if parsed is None:
            res.observar(c["campo"], f"Valor no válido en «{c['etiqueta']}»")
            continue
        atributos[c["campo"]] = "***" if c.get("sensible") else _json(parsed)
    res.datos["atributos"] = atributos


def validar_socio(fila, campos, ctx):
    res = Resultado()
    _requeridos(res, fila, campos)
    d = res.datos
    d["codigo_socio"] = (fila.get("codigo_socio") or "").strip()[:40]
    d["nombre"] = (fila.get("nombre") or "").strip()[:160]
    d["rango_ingreso"] = (fila.get("rango_ingreso") or "").strip()[:40]
    d["direccion"] = (fila.get("direccion") or "").strip()[:200]
    ced = fila.get("cedula") or ""
    if fila.get("cedula_hash"):  # corrección de un observado: la cédula ya viene como huella
        d["cedula_hash"], d["cedula_mascara"] = fila["cedula_hash"], fila.get("cedula_mascara", "")
    elif ced.strip():
        if not cedula_valida_formato(ced):
            res.observar("cedula", "Cédula con formato no válido (10 a 13 dígitos)")
        d["cedula_hash"], d["cedula_mascara"] = cedula_hash(ced), cedula_mascara(ced)
    ag = (fila.get("agencia_codigo") or "").strip().upper()
    if ag:
        if ag not in ctx["agencias"]:
            res.observar("agencia_codigo", f"Agencia «{ag}» no registrada")
        d["agencia_id"] = ctx["agencias"].get(ag)
    if (fila.get("fecha_ingreso") or "").strip():
        f = parse_fecha(fila["fecha_ingreso"])
        if f is None:
            res.rechazar("fecha_ingreso", "Fecha de ingreso con formato no válido (use AAAA-MM-DD o DD/MM/AAAA)")
        d["fecha_ingreso"] = _json(f)
    lat, lng, motivos = validar_coordenadas(fila.get("latitud"), fila.get("longitud"), ctx["decimales_min"])
    d["latitud"], d["longitud"] = (str(lat) if lat is not None else None), (str(lng) if lng is not None else None)
    d["precision_valida"] = lat is not None and not motivos
    for m in motivos:
        res.observar("latitud", f"Sin ubicación válida: {m}")
    # duplicados dentro del archivo y contra la base
    if d["codigo_socio"]:
        if d["codigo_socio"] in ctx["vistos"]:
            res.observar("codigo_socio", "Registro repetido en el archivo (código de socio)")
        ctx["vistos"].add(d["codigo_socio"])
    h = d.get("cedula_hash")
    if h:
        clave = "ced:" + h
        if clave in ctx["vistos"]:
            res.observar("cedula", "Cédula repetida en el archivo")
        ctx["vistos"].add(clave)
        otro = ctx["cedulas_db"].get(h)
        if otro and otro != d["codigo_socio"]:
            res.observar("cedula", "La cédula ya está registrada con otro código de socio")
    _extras(res, "socios", fila, campos)
    return res


def validar_credito(fila, campos, ctx):
    res = Resultado()
    _requeridos(res, fila, campos)
    d = res.datos
    d["codigo_credito"] = (fila.get("codigo_credito") or "").strip()[:40]
    d["codigo_socio"] = (fila.get("codigo_socio") or "").strip()[:40]
    if d["codigo_socio"] and d["codigo_socio"] not in ctx["socios_db"]:
        res.observar("codigo_socio", "El socio no está registrado (cargue primero el archivo de socios)")
    if (fila.get("monto") or "").strip():
        m = parse_decimal(fila["monto"])
        if m is None or m <= 0:
            res.rechazar("monto", "Monto no válido (número positivo con punto decimal)")
        d["monto"] = _json(m)
    if (fila.get("fecha_desembolso") or "").strip():
        f = parse_fecha(fila["fecha_desembolso"])
        if f is None:
            res.rechazar("fecha_desembolso", "Fecha de desembolso con formato no válido")
        d["fecha_desembolso"] = _json(f)
    if (fila.get("plazo_meses") or "").strip():
        p = parse_entero(fila["plazo_meses"])
        if p is None or p <= 0:
            res.rechazar("plazo_meses", "Plazo no válido (entero positivo)")
        d["plazo_meses"] = p
    if (fila.get("estado") or "").strip():
        e = fila["estado"].strip().lower()
        if e not in ESTADOS_CREDITO:
            res.rechazar("estado", "Estado no válido (vigente, vencido, cancelado o castigado)")
        d["estado"] = e
    if d["codigo_credito"]:
        if d["codigo_credito"] in ctx["vistos"]:
            res.observar("codigo_credito", "Registro repetido en el archivo (código de crédito)")
        ctx["vistos"].add(d["codigo_credito"])
    _extras(res, "creditos", fila, campos)
    return res


def validar_pago(fila, campos, ctx):
    res = Resultado()
    _requeridos(res, fila, campos)
    d = res.datos
    d["codigo_credito"] = (fila.get("codigo_credito") or "").strip()[:40]
    if d["codigo_credito"] and d["codigo_credito"] not in ctx["creditos_db"]:
        res.observar("codigo_credito", "El crédito no está registrado (cargue primero el archivo de créditos)")
    per = (fila.get("periodo") or "").strip()
    if per:
        if not es_periodo(per):
            res.rechazar("periodo", "Período con formato no válido (AAAA-MM)")
        elif ctx.get("periodo") and per != ctx["periodo"]:
            res.observar("periodo", f"El período {per} no coincide con el período de la carga ({ctx['periodo']})")
        d["periodo"] = per
    for campo in ("valor_pagado", "valor_pendiente"):
        if (fila.get(campo) or "").strip():
            v = parse_decimal(fila[campo])
            if v is None or v < 0:
                res.rechazar(campo, "Valor no válido (número no negativo con punto decimal)")
            d[campo] = _json(v)
    if (fila.get("dias_atraso") or "").strip():
        n = parse_entero(fila["dias_atraso"])
        if n is None or n < 0:
            res.rechazar("dias_atraso", "Días de atraso no válidos (entero no negativo)")
        d["dias_atraso"] = n
    if (fila.get("fecha_pago") or "").strip():
        f = parse_fecha(fila["fecha_pago"])
        if f is None:
            res.observar("fecha_pago", "Fecha de pago con formato no válido")
        d["fecha_pago"] = _json(f)
    clave = f"{d['codigo_credito']}|{d.get('periodo', '')}"
    if d["codigo_credito"]:
        if clave in ctx["vistos"]:
            res.observar("codigo_credito", "Registro repetido en el archivo (crédito y período)")
        ctx["vistos"].add(clave)
    _extras(res, "pagos", fila, campos)
    return res


VALIDADORES = {"socios": validar_socio, "creditos": validar_credito, "pagos": validar_pago}


def aplicar_mapeo(fila_original, mapeo):
    return {campo: (fila_original.get(col) or "") for campo, col in mapeo.items()}
