"""Paginación por cursor (keyset) con orden estable y desempate por ID.

Se usa solo dentro de los repositorios: recibe un QuerySet y devuelve un DTO de página.
"""

import base64
import datetime
import decimal
import json

from django.db.models import Q

from core.exceptions import DomainError


def _ser(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.isoformat()
    if isinstance(v, decimal.Decimal):
        return str(v)
    return v


def encode_cursor(values):
    raw = json.dumps([_ser(v) for v in values], separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor, n):
    try:
        pad = "=" * (-len(cursor) % 4)
        values = json.loads(base64.urlsafe_b64decode(cursor + pad))
        if not isinstance(values, list) or len(values) != n:
            raise ValueError
        return values
    except (ValueError, TypeError, json.JSONDecodeError):
        raise DomainError("CURSOR_INVALIDO", "El cursor de paginación no es válido.") from None


def _keyset_filter(ordering, values):
    fields = [(f.lstrip("-"), f.startswith("-")) for f in ordering]
    q = Q()
    for i, (name, desc) in enumerate(fields):
        cond = Q(**{f"{name}__{'lt' if desc else 'gt'}": values[i]})
        for j in range(i):
            cond &= Q(**{fields[j][0]: values[j]})
        q |= cond
    return q


def cursor_page(qs, ordering, cursor, size, to_dto):
    """Devuelve {items, next_cursor, has_more, total_count}. total_count solo en la primera página."""
    size = max(1, min(int(size or 15), 100))
    if ordering[-1].lstrip("-") != "id":
        ordering = [*ordering, "-id" if ordering[0].startswith("-") else "id"]
    total = qs.count() if not cursor else None
    page_qs = qs.order_by(*ordering)
    if cursor:
        page_qs = page_qs.filter(_keyset_filter(ordering, decode_cursor(cursor, len(ordering))))
    rows = list(page_qs[: size + 1])
    has_more = len(rows) > size
    rows = rows[:size]
    next_cursor = None
    if has_more and rows:
        last = rows[-1]
        next_cursor = encode_cursor([_attr(last, f.lstrip("-")) for f in ordering])
    return {"items": [to_dto(r) for r in rows], "next_cursor": next_cursor, "has_more": has_more, "total_count": total}


def _attr(obj, path):
    for part in path.split("__"):
        obj = getattr(obj, part)
    return obj
