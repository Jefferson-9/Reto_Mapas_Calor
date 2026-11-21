import calendar
import datetime
import re

_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def es_periodo(p):
    return bool(p) and bool(_RE.match(str(p)))


def sumar_meses(p, n):
    y, m = map(int, p.split("-"))
    t = y * 12 + (m - 1) + n
    return f"{t // 12:04d}-{t % 12 + 1:02d}"


def periodo_anterior(p):
    return sumar_meses(p, -1)


def fin_de_periodo(p):
    y, m = map(int, p.split("-"))
    return datetime.date(y, m, calendar.monthrange(y, m)[1])


def inicio_de_periodo(p):
    y, m = map(int, p.split("-"))
    return datetime.date(y, m, 1)


def periodo_de_fecha(d):
    return f"{d.year:04d}-{d.month:02d}"


def meses_entre(a, b):
    ya, ma = map(int, a.split("-"))
    yb, mb = map(int, b.split("-"))
    return (yb * 12 + mb) - (ya * 12 + ma)
