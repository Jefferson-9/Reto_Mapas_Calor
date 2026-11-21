"""Inicio y cierre de sesión, bloqueo por intentos e inactividad en servidor (CU-01)."""

import datetime

from core.exceptions import DomainError
from core.repositories.base import EventoAuditoria

MENSAJE_GENERICO = "No fue posible iniciar sesión. Verifique sus datos e intente nuevamente."
INTERVALO_TOQUE = datetime.timedelta(seconds=30)


class CredencialesInvalidas(DomainError):
    def __init__(self):
        super().__init__("CREDENCIALES_INVALIDAS", MENSAJE_GENERICO, status=401)


class SesionNoValida(DomainError):
    def __init__(self, code, message):
        super().__init__(code, message, status=401)


class ServicioAutenticacion:
    def __init__(self, usuarios, sesiones, intentos, auditoria, uow, reloj, max_intentos, ventana_minutos, minutos_inactividad):
        self.usuarios = usuarios
        self.sesiones = sesiones
        self.intentos = intentos
        self.auditoria = auditoria
        self.uow = uow
        self.reloj = reloj
        self.max_intentos = max_intentos
        self.ventana = datetime.timedelta(minutes=ventana_minutos)
        self.minutos_inactividad = minutos_inactividad  # callable -> int (parámetro institucional)

    def _auditar(self, accion, detalle, usuario_id=None, username=""):
        self.auditoria.registrar(
            EventoAuditoria(categoria="acceso", accion=accion, entidad_afectada="Sesion", detalle=detalle, usuario_id=usuario_id, username=username)
        )

    def iniciar_sesion(self, username, password, ip, user_agent):
        username = (username or "").strip()
        ahora = self.reloj()
        # Los rechazos se registran y confirman ANTES de lanzar el error (si no, el rollback los borraría).
        if self.intentos.fallidos_desde(username, ip, ahora - self.ventana) >= self.max_intentos:
            with self.uow.atomic():
                self.intentos.registrar(username, None, ip, False, "bloqueado")
                self._auditar("login_bloqueado", f"Intento rechazado por bloqueo temporal para «{username[:60]}»", username=username[:60])
            raise CredencialesInvalidas()
        resultado, usuario = self.usuarios.verificar_credenciales(username, password)
        if resultado != "ok":
            uid = usuario["id"] if usuario else None
            with self.uow.atomic():
                self.intentos.registrar(username, uid, ip, False, resultado)
                self._auditar("login_fallido", f"Intento de inicio de sesión fallido para «{username[:60]}»", usuario_id=uid, username=username[:60])
            raise CredencialesInvalidas()
        with self.uow.atomic():
            sesion_id = self.sesiones.crear(usuario["id"], ip, user_agent, ahora)
            self.intentos.registrar(username, usuario["id"], ip, True, "")
            self._auditar("login_exitoso", "Inicio de sesión exitoso", usuario_id=usuario["id"], username=usuario["username"])
        return {"usuario": usuario, "sesion_id": sesion_id}

    def validar_sesion(self, sesion_id, usuario_id, tocar=True):
        """Comprueba revocación e inactividad. Si se excedió el tiempo, cierra la sesión (RF-001.04)."""
        ahora = self.reloj()
        s = self.sesiones.obtener(sesion_id) if sesion_id else None
        if not s or s["usuario_id"] != usuario_id:
            raise SesionNoValida("SESION_INVALIDA", "La sesión no es válida. Inicie sesión nuevamente.")
        if s["revocada_en"] is not None:
            raise SesionNoValida("SESION_CERRADA", "La sesión fue cerrada. Inicie sesión nuevamente.")
        limite = datetime.timedelta(minutes=self.minutos_inactividad())
        if ahora - s["ultima_actividad"] > limite:
            with self.uow.atomic():
                self.sesiones.revocar(sesion_id, "inactividad", ahora)
                self._auditar("sesion_cerrada_inactividad", "Sesión cerrada automáticamente por inactividad", usuario_id=usuario_id)
            raise SesionNoValida("SESION_INACTIVA", "Su sesión se cerró por inactividad. Inicie sesión nuevamente.")
        if tocar and ahora - s["ultima_actividad"] > INTERVALO_TOQUE:
            self.sesiones.tocar(sesion_id, ahora)
        return True

    def usuario_activo(self, usuario_id):
        u = self.usuarios.obtener(usuario_id)
        if not u:
            raise SesionNoValida("SESION_INVALIDA", "La sesión no es válida. Inicie sesión nuevamente.")
        if not u["activo"]:
            # Solo se informa a quien presenta un refresh válido de esta misma cuenta (borrado de datos locales)
            raise SesionNoValida("USUARIO_DESACTIVADO", "Su cuenta está desactivada. Comuníquese con el administrador.")
        return u

    def cerrar_sesion(self, sesion_id):
        """RF-001.03: la sesión queda revocada; ni el access ni el refresh vuelven a ser aceptados."""
        s = self.sesiones.obtener(sesion_id)
        if not s:
            return
        u = self.usuarios.obtener(s["usuario_id"])
        with self.uow.atomic():
            self.sesiones.revocar(sesion_id, "logout", self.reloj())
            self._auditar("logout", "Cierre de sesión", usuario_id=s["usuario_id"], username=u["username"] if u else "")
