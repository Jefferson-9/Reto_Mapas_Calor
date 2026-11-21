"""Lectura segura de CSV por bloques (nunca el archivo completo sin límite)."""

import csv
import io

import pandas as pd

from core.exceptions import DomainError

TAMANO_BLOQUE = 5000


def detectar_formato(muestra: bytes):
    """Verifica que el contenido sea texto CSV real en UTF-8 y detecta el separador (',' o ';')."""
    if b"\x00" in muestra[:4096]:
        raise DomainError("ARCHIVO_INVALIDO", "El archivo no tiene formato CSV (contenido binario).")
    encoding = "utf-8-sig" if muestra.startswith(b"\xef\xbb\xbf") else "utf-8"
    try:
        texto = muestra.decode(encoding)
    except UnicodeDecodeError as e:
        # la muestra puede cortar un carácter multibyte al final
        if e.start < len(muestra) - 4:
            raise DomainError("CODIFICACION_INVALIDA", "El archivo debe estar codificado en UTF-8.") from None
        texto = muestra[: e.start].decode(encoding)
    primera = texto.splitlines()[0] if texto.strip() else ""
    if not primera:
        raise DomainError("ARCHIVO_VACIO", "El archivo está vacío o no tiene encabezados.")
    sep = ";" if primera.count(";") > primera.count(",") else ","
    try:
        encabezados = next(csv.reader(io.StringIO(primera), delimiter=sep))
    except (csv.Error, StopIteration):
        raise DomainError("ARCHIVO_INVALIDO", "No se pudo interpretar la fila de encabezados.") from None
    encabezados = [h.strip() for h in encabezados]
    if len(encabezados) < 2 or any(not h for h in encabezados):
        raise DomainError("ARCHIVO_INVALIDO", "El archivo no tiene formato CSV válido: encabezados vacíos o una sola columna.")
    if len(set(encabezados)) != len(encabezados):
        raise DomainError("ARCHIVO_INVALIDO", "El archivo tiene encabezados repetidos.")
    return {"encoding": encoding, "sep": sep, "encabezados": encabezados}


def leer_bloques(ruta, formato, max_filas):
    """Itera bloques de filas como listas de dicts {encabezado: texto}. Lanza error si excede max_filas."""
    total = 0
    try:
        lector = pd.read_csv(
            ruta, sep=formato["sep"], encoding=formato["encoding"], dtype=str, keep_default_na=False,
            chunksize=TAMANO_BLOQUE, skipinitialspace=True, on_bad_lines="error", engine="python",
        )
        for bloque in lector:
            bloque.columns = [str(c).strip() for c in bloque.columns]
            total += len(bloque)
            if total > max_filas:
                raise DomainError("ARCHIVO_DEMASIADO_GRANDE", f"El archivo supera el límite de {max_filas:,} filas.".replace(",", "."))
            yield bloque.to_dict("records")
    except pd.errors.ParserError:
        raise DomainError("ARCHIVO_INVALIDO", "El CSV tiene filas con un número de columnas distinto al encabezado.") from None
    except UnicodeDecodeError:
        raise DomainError("CODIFICACION_INVALIDA", "El archivo debe estar codificado en UTF-8.") from None
