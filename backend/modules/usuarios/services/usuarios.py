"""Gestión de usuarios, roles, permisos y ámbito (CU-02)."""

import re

from core.exceptions import DomainError, NoEncontrado
from core.repositories.base import EventoAuditoria
from modules.usuarios.catalogo import ROLES_CON_AGENCIA

_USERNAME = re.compile(r"^[A-Za-z0-9._-]{3,60}$")
CAMPOS_AUDITABLES = ["username", "email", "nombre_completo", "cargo", "rol", "agencia", "activo"]


def _resumen(u):
    return {
        "username": u["username"], "email": u["email"], "nombre_completo": u["nombre_completo"], "cargo": u["cargo"],
        "rol": u["rol"]["codigo"], "agencia": u["agencia"]["codigo"] if u["agencia"] else None, "activo": u["activo"],
    }


class ServicioUsuarios:
    def __init__(self, usuarios, sesiones, auditoria, uow, reloj):
        self.usuarios = usuarios
        self.sesiones = sesiones
        self.auditoria = auditoria
        self.uow = uow
        self.reloj = reloj

    def _auditar(self, actor, accion, detalle, antes=None, despues=None, entidad="Usuario"):
        self.auditoria.registrar(
            EventoAuditoria(
                categoria="usuarios", accion=accion, entidad_afectada=entidad, detalle=detalle,
                usuario_id=actor.id, username=actor.username, valor_anterior=antes, valor_nuevo=despues,
            )
        )

    def _validar(self, datos, usuario_id=None, parcial=False):
        """RF-002.05: obligatorios, identificador no repetido; señala cada dato a corregir."""
        errores = []
        req = ["username", "nombre_completo", "rol"]
        for campo in req:
            if (not parcial or campo in datos) and not str(datos.get(campo) or "").strip():
                errores.append({"campo": campo, "mensaje": "Este dato es obligatorio."})
        if "username" in datos and datos.get("username"):
            if not _USERNAME.match(datos["username"].strip()):
                errores.append({"campo": "username", "mensaje": "Use 3 a 60 caracteres: letras, números, punto, guion o guion bajo."})
            elif self.usuarios.existe_username(datos["username"], excluir_id=usuario_id):
                errores.append({"campo": "username", "mensaje": "El identificador ya está registrado."})
        if datos.get("rol") and not self.usuarios.rol_existe(datos["rol"]):
            errores.append({"campo": "rol", "mensaje": "Rol no válido."})
        if datos.get("agencia_id") is not None and not self.usuarios.agencia_existe(datos["agencia_id"]):
            errores.append({"campo": "agencia_id", "mensaje": "Agencia no válida."})
        return errores

    def listar(self, filtros, cursor, tamano):
        return self.usuarios.listar(filtros, cursor, tamano)

    def obtener(self, usuario_id):
        u = self.usuarios.obtener(usuario_id)
        if not u:
            raise NoEncontrado()
        return u

    def crear(self, datos, password, actor):
        errores = self._validar(datos)
        rol = datos.get("rol")
        if rol in ROLES_CON_AGENCIA and not datos.get("agencia_id"):
            errores.append({"campo": "agencia_id", "mensaje": "Este rol requiere una agencia como ámbito."})
        if not password:
            errores.append({"campo": "password", "mensaje": "Este dato es obligatorio."})
        else:
            errores += [{"campo": "password", "mensaje": m} for m in self.usuarios.validar_password(password, datos)]
        if errores:
            raise DomainError("VALIDACION", "Revise los datos marcados.", errores)
        with self.uow.atomic():
            u = self.usuarios.crear(datos, password)
            self._auditar(actor, "usuario_creado", f"Usuario «{u['username']}» creado con rol {u['rol']['codigo']}", None, _resumen(u))
        return u

    def actualizar(self, usuario_id, cambios, actor):
        actual = self.obtener(usuario_id)
        errores = self._validar(cambios, usuario_id=usuario_id, parcial=True)
        rol = cambios.get("rol", actual["rol"]["codigo"])
        agencia = cambios["agencia_id"] if "agencia_id" in cambios else (actual["agencia"]["id"] if actual["agencia"] else None)
        if rol in ROLES_CON_AGENCIA and not agencia:
            errores.append({"campo": "agencia_id", "mensaje": "Este rol requiere una agencia como ámbito."})
        if usuario_id == actor.id and cambios.get("activo") is False:
            errores.append({"campo": "activo", "mensaje": "No puede desactivar su propia cuenta."})
        if usuario_id == actor.id and "rol" in cambios and cambios["rol"] != actual["rol"]["codigo"]:
            errores.append({"campo": "rol", "mensaje": "No puede cambiar su propio rol."})
        if errores:
            raise DomainError("VALIDACION", "Revise los datos marcados.", errores)
        with self.uow.atomic():
            nuevo = self.usuarios.actualizar(usuario_id, cambios)
            antes, despues = _resumen(actual), _resumen(nuevo)
            dif = [k for k in CAMPOS_AUDITABLES if antes[k] != despues[k]]
            if dif:
                self._auditar(actor, "usuario_actualizado", f"Usuario «{nuevo['username']}» modificado: {', '.join(dif)}",
                              {k: antes[k] for k in dif}, {k: despues[k] for k in dif})
            # RF-002.03 / RF-002.04: permisos y ámbito nuevos rigen desde el siguiente acceso
            if {"rol", "agencia", "activo"} & set(dif):
                self.sesiones.revocar_de_usuario(usuario_id, "cambio_permisos", self.reloj())
        return nuevo

    def desactivar(self, usuario_id, actor):
        return self.actualizar(usuario_id, {"activo": False}, actor)

    def activar(self, usuario_id, actor):
        return self.actualizar(usuario_id, {"activo": True}, actor)

    def restablecer_password(self, usuario_id, password, actor):
        u = self.obtener(usuario_id)
        errores = [{"campo": "password", "mensaje": m} for m in self.usuarios.validar_password(password, u)]
        if errores:
            raise DomainError("VALIDACION", "Revise los datos marcados.", errores)
        with self.uow.atomic():
            self.usuarios.cambiar_password(usuario_id, password)
            self.sesiones.revocar_de_usuario(usuario_id, "cambio_contrasena", self.reloj())
            self._auditar(actor, "contrasena_restablecida", f"Contraseña restablecida para «{u['username']}»")
        return {"ok": True}

    def roles(self):
        return self.usuarios.roles()

    def permisos(self):
        return self.usuarios.permisos()

    def actualizar_permisos_rol(self, codigo, permisos, actor):
        roles = {r["codigo"]: r for r in self.usuarios.roles()}
        if codigo not in roles:
            raise NoEncontrado("El rol no existe.")
        validos = {p["codigo"] for p in self.usuarios.permisos()}
        invalidos = sorted(set(permisos) - validos)
        if invalidos:
            raise DomainError("VALIDACION", "Permisos desconocidos: " + ", ".join(invalidos))
        if codigo == "admin" and "usuarios.gestionar" not in permisos:
            raise DomainError("VALIDACION", "El rol administrador debe conservar «usuarios.gestionar».")
        with self.uow.atomic():
            antes = roles[codigo]["permisos"]
            nuevo = self.usuarios.actualizar_permisos_rol(codigo, permisos)
            self._auditar(actor, "permisos_rol_actualizados", f"Permisos del rol «{codigo}» actualizados",
                          {"permisos": antes}, {"permisos": nuevo["permisos"]}, entidad="Rol")
        return nuevo

    def oficiales(self, agencia_id):
        return self.usuarios.oficiales(agencia_id)
