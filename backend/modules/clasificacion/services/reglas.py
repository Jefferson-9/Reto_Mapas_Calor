"""Reglas de clasificación de zonas (sección 6.2). Funciones puras: sin base de datos ni HTTP.

Extensible por registro: para un operador nuevo basta con agregarlo a OPERADORES e INTERVALOS.
"""

import math
import re
from decimal import Decimal

VARIABLES = {
    "total_socios": "Total de socios",
    "total_creditos": "Créditos activos",
    "monto_cartera": "Monto de cartera",
    "creditos_atrasados": "Créditos con pagos atrasados",
    "saldo_vencido": "Saldo vencido",
    "tasa_morosidad": "Tasa de morosidad (%)",
    "penetracion_pct": "Penetración de socios (%)",
}

OPERADORES = {
    ">": lambda v, u: v > u,
    ">=": lambda v, u: v >= u,
    "<": lambda v, u: v < u,
    "<=": lambda v, u: v <= u,
    "==": lambda v, u: v == u,
    "entre": lambda v, u: u[0] <= v <= u[1],
}

# Intervalo (lo, lo_incluido, hi, hi_incluido) que describe cada operador
INTERVALOS = {
    ">": lambda u: (u, False, math.inf, False),
    ">=": lambda u: (u, True, math.inf, False),
    "<": lambda u: (-math.inf, False, u, False),
    "<=": lambda u: (-math.inf, False, u, True),
    "==": lambda u: (u, True, u, True),
    "entre": lambda u: (u[0], True, u[1], True),
}

_COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _num(x):
    if isinstance(x, bool):
        raise ValueError
    return float(Decimal(str(x)))


def normalizar_umbral(operador, umbral):
    if operador == "entre":
        if not isinstance(umbral, (list, tuple)) or len(umbral) != 2:
            raise ValueError
        return [_num(umbral[0]), _num(umbral[1])]
    return _num(umbral)


def intersectar(a, b):
    lo, lo_inc = (a[0], a[1]) if a[0] > b[0] else ((b[0], b[1]) if b[0] > a[0] else (a[0], a[1] and b[1]))
    hi, hi_inc = (a[2], a[3]) if a[2] < b[2] else ((b[2], b[3]) if b[2] < a[2] else (a[2], a[3] and b[3]))
    return (lo, lo_inc, hi, hi_inc)


def vacio(i):
    lo, lo_inc, hi, hi_inc = i
    return lo > hi or (lo == hi and not (lo_inc and hi_inc))


def intervalos_categoria(reglas):
    out = {}
    for r in reglas:
        i = INTERVALOS[r["operador"]](r["umbral"])
        out[r["variable"]] = intersectar(out[r["variable"]], i) if r["variable"] in out else i
    return out


def validar_version(categorias):
    """RF-011.02. Devuelve (errores, advertencias). Con errores no se permite guardar."""
    errores, advertencias = [], []
    if not categorias:
        errores.append({"campo": "categorias", "mensaje": "Defina al menos una categoría."})
    prioridades, nombres = {}, set()
    for i, c in enumerate(categorias):
        pref = f"categorias[{i}]"
        nombre = str(c.get("nombre", "")).strip()
        if not nombre:
            errores.append({"campo": f"{pref}.nombre", "mensaje": "La categoría necesita un nombre."})
        elif nombre.lower() in nombres:
            errores.append({"campo": f"{pref}.nombre", "mensaje": f"Nombre de categoría repetido «{nombre}»."})
        nombres.add(nombre.lower())
        if not _COLOR.match(str(c.get("color_hex", ""))):
            errores.append({"campo": f"{pref}.color_hex", "mensaje": "Color no válido (#RRGGBB)."})
        p = c.get("prioridad")
        if not isinstance(p, int) or p < 1:
            errores.append({"campo": f"{pref}.prioridad", "mensaje": "La prioridad debe ser un entero mayor o igual a 1."})
        elif p in prioridades:
            errores.append({"campo": f"{pref}.prioridad", "mensaje": f"Prioridad {p} repetida con «{prioridades[p]}»."})
        else:
            prioridades[p] = nombre
        f = c.get("frecuencia_visita_dias")
        if f is not None and (not isinstance(f, int) or f < 1):
            errores.append({"campo": f"{pref}.frecuencia_visita_dias", "mensaje": "La frecuencia debe ser un entero positivo o vacía."})
        reglas = c.get("reglas") or []
        if not reglas:
            errores.append({"campo": f"{pref}.reglas", "mensaje": f"La categoría «{nombre or i + 1}» no tiene reglas definidas."})
        validas = True
        for j, r in enumerate(reglas):
            rp = f"{pref}.reglas[{j}]"
            if r.get("variable") not in VARIABLES:
                errores.append({"campo": f"{rp}.variable", "mensaje": "Variable no permitida."})
                validas = False
            if r.get("operador") not in OPERADORES:
                errores.append({"campo": f"{rp}.operador", "mensaje": "Operador no permitido."})
                validas = False
                continue
            try:
                r["umbral"] = normalizar_umbral(r["operador"], r.get("umbral"))
            except (ValueError, TypeError, ArithmeticError):
                errores.append({"campo": f"{rp}.umbral", "mensaje": "Umbral no numérico (para «entre» use mínimo y máximo)."})
                validas = False
                continue
            if r["operador"] == "entre" and not r["umbral"][0] < r["umbral"][1]:
                errores.append({"campo": f"{rp}.umbral", "mensaje": "En «entre», el mínimo debe ser menor que el máximo."})
                validas = False
        if validas and reglas:
            for var, iv in intervalos_categoria(reglas).items():
                if vacio(iv):
                    errores.append({"campo": f"{pref}.reglas", "mensaje": f"Las reglas de «{nombre}» sobre «{VARIABLES[var]}» se contradicen: ninguna zona podría cumplirlas."})
    if not errores:
        ordenadas = sorted(categorias, key=lambda c: c["prioridad"])
        for a_idx, a in enumerate(ordenadas):
            ia = intervalos_categoria(a["reglas"])
            for b in ordenadas[a_idx + 1:]:
                ib = intervalos_categoria(b["reglas"])
                if all(not vacio(intersectar(ia[v], ib[v])) for v in set(ia) & set(ib)):
                    advertencias.append(f"«{a['nombre']}» y «{b['nombre']}» pueden coincidir en algunas zonas; se aplica la de mayor prioridad («{a['nombre']}»).")
    return errores, advertencias


def evaluar(indicador, categorias):
    """Evalúa por prioridad ascendente; gana la primera categoría que cumple todas sus reglas (AND)."""
    evaluadas = []
    for c in sorted(categorias, key=lambda c: c["prioridad"]):
        detalle, cumple_todas = [], True
        for r in c["reglas"]:
            valor = indicador.get(r["variable"])
            if valor is None:
                ok = False
            else:
                ok = OPERADORES[r["operador"]](float(valor), r["umbral"])
            cumple_todas &= ok
            detalle.append({"variable": r["variable"], "etiqueta": VARIABLES[r["variable"]], "operador": r["operador"], "umbral": r["umbral"],
                            "valor": None if valor is None else str(valor), "cumple": ok, "sin_datos": valor is None})
        evaluadas.append({"categoria_id": c.get("id"), "categoria": c["nombre"], "prioridad": c["prioridad"], "cumple": cumple_todas, "reglas": detalle})
        if cumple_todas:
            return c, {"categoria": c["nombre"], "evaluadas": evaluadas}
    return None, {"categoria": None, "evaluadas": evaluadas}
