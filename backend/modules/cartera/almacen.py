"""Almacenamiento privado de archivos subidos: fuera de directorios públicos, nombres generados (sin path traversal)."""

import hashlib
import uuid
from pathlib import Path

from core.exceptions import DomainError


class AlmacenPrivado:
    def __init__(self, raiz):
        self.raiz = Path(raiz)

    def guardar(self, archivo, extension, max_bytes):
        self.raiz.mkdir(parents=True, exist_ok=True)
        nombre = f"{uuid.uuid4().hex}.{extension}"
        destino = self.raiz / nombre
        sha = hashlib.sha256()
        total = 0
        try:
            with open(destino, "wb") as fh:
                for chunk in archivo.chunks():
                    total += len(chunk)
                    if total > max_bytes:
                        raise DomainError("ARCHIVO_DEMASIADO_GRANDE", f"El archivo supera el límite de {max_bytes // (1024 * 1024)} MB.")
                    sha.update(chunk)
                    fh.write(chunk)
        except DomainError:
            destino.unlink(missing_ok=True)
            raise
        if total == 0:
            destino.unlink(missing_ok=True)
            raise DomainError("ARCHIVO_VACIO", "El archivo está vacío.")
        return nombre, sha.hexdigest(), total

    def ruta(self, nombre):
        p = (self.raiz / nombre).resolve()
        if self.raiz.resolve() not in p.parents:
            raise DomainError("RUTA_INVALIDA", "Ruta de archivo no válida.")
        return p

    def muestra(self, nombre, n=65536):
        with open(self.ruta(nombre), "rb") as fh:
            return fh.read(n)

    def leer_todo(self, nombre):
        return self.ruta(nombre).read_bytes()

    def eliminar(self, nombre):
        if nombre:
            self.ruta(nombre).unlink(missing_ok=True)
