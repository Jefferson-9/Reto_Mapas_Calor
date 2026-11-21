"""Funciones puras de la cadena de hash del historial (serialización canónica + SHA-256)."""

import datetime
import decimal
import hashlib
import json
import uuid

GENESIS = "0" * 64
CAMPOS_HASH = [
    "secuencia", "usuario_id", "username", "fecha_hora", "categoria", "accion", "entidad_afectada",
    "detalle", "valor_anterior", "valor_nuevo", "metadatos", "correlation_id", "prev_hash",
]


def _canon(obj):
    if isinstance(obj, datetime.datetime):
        if obj.tzinfo is not None:
            obj = obj.astimezone(datetime.timezone.utc)
        return obj.replace(tzinfo=None).isoformat(timespec="microseconds") + "Z"
    if isinstance(obj, datetime.date):
        return obj.isoformat()
    if isinstance(obj, decimal.Decimal):
        return format(obj, "f")
    if isinstance(obj, uuid.UUID):
        return str(obj)
    if isinstance(obj, dict):
        return {str(k): _canon(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set, frozenset)):
        return [_canon(v) for v in obj]
    if isinstance(obj, float):
        # los floats se normalizan como texto decimal para que el hash no dependa de la representación
        return format(decimal.Decimal(repr(obj)), "f")
    return obj


def serializacion_canonica(registro):
    payload = {k: registro.get(k) for k in CAMPOS_HASH}
    return json.dumps(_canon(payload), sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def calcular_hash(registro):
    return hashlib.sha256(serializacion_canonica(registro)).hexdigest()


def normalizar_json(valor):
    """Convierte valores a tipos JSON estables antes de persistir (decimales y fechas como texto)."""
    if valor is None:
        return None
    return _canon(valor)


def verificar(registros):
    """Recorre registros ordenados por secuencia. Devuelve dict con resultado y primera inconsistencia."""
    prev = GENESIS
    esperado = 1
    total = 0
    for r in registros:
        total += 1
        if r["secuencia"] != esperado:
            return {"integra": False, "total": total, "secuencia_error": r["secuencia"], "motivo": "Secuencia faltante o reordenada"}
        if r["prev_hash"] != prev:
            return {"integra": False, "total": total, "secuencia_error": r["secuencia"], "motivo": "Encadenamiento roto (prev_hash)"}
        if calcular_hash(r) != r["hash"]:
            return {"integra": False, "total": total, "secuencia_error": r["secuencia"], "motivo": "Contenido alterado (hash no coincide)"}
        prev = r["hash"]
        esperado += 1
    return {"integra": True, "total": total, "secuencia_error": None, "motivo": None}
