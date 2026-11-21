"""Privacidad de la cédula: solo se guarda una huella HMAC (para duplicados y búsqueda) y una máscara."""

import hashlib
import hmac
import re

from django.conf import settings


def normalizar_cedula(valor):
    return re.sub(r"\D", "", str(valor or ""))


def cedula_hash(valor):
    ced = normalizar_cedula(valor)
    if not ced:
        return ""
    return hmac.new(settings.CEDULA_HMAC_KEY.encode(), ced.encode(), hashlib.sha256).hexdigest()


def cedula_mascara(valor):
    ced = normalizar_cedula(valor)
    if not ced:
        return ""
    visibles = ced[-4:]
    return "*" * max(len(ced) - 4, 2) + visibles


def cedula_valida_formato(valor):
    ced = normalizar_cedula(valor)
    return 10 <= len(ced) <= 13
