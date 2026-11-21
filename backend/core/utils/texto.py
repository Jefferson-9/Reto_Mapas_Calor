import re
import unicodedata


def normalizar_encabezado(texto):
    """minúsculas, sin tildes, espacios y guiones convertidos en '_' (para comparar alias de columnas)."""
    s = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    s = s.strip().lower()
    s = re.sub(r"[\s\-\.]+", "_", s)
    s = re.sub(r"[^a-z0-9_]", "", s)
    return s.strip("_")


def nombre_archivo_seguro(nombre, max_len=120):
    base = unicodedata.normalize("NFKD", str(nombre or "archivo")).encode("ascii", "ignore").decode()
    base = re.sub(r"[^A-Za-z0-9._-]", "_", base.split("/")[-1].split("\\")[-1])
    base = base.lstrip(".") or "archivo"
    return base[:max_len]
