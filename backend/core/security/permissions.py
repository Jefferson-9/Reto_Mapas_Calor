"""Autorización por permisos (matriz roles × permisos), validada siempre en el servidor."""

from rest_framework.permissions import BasePermission

# Roles que pueden ver marcadores individuales (socios/prospectos puntuales) dentro de su ámbito.
ROLES_MARCADORES_INDIVIDUALES = frozenset({"admin", "jefe_agencia", "oficial"})


def tiene_permiso(user, codigo):
    return bool(user and getattr(user, "is_authenticated", False) and user.tiene_permiso(codigo))


def requiere(*codigos, todos=False):
    """Fábrica de clases de permiso DRF. Por defecto basta con uno de los códigos."""

    class _Requiere(BasePermission):
        message = "No tiene permiso para realizar esta acción."

        def has_permission(self, request, view):
            user = request.user
            if not (user and user.is_authenticated):
                return False
            checks = [user.tiene_permiso(c) for c in codigos]
            return all(checks) if todos else any(checks)

    _Requiere.__name__ = "Requiere_" + "_".join(c.replace(".", "_") for c in codigos)
    _Requiere.codigos = codigos
    return _Requiere
