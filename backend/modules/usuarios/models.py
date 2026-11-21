import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models
from django.db.models.functions import Lower


class Permiso(models.Model):
    codigo = models.CharField(max_length=40, unique=True)
    descripcion = models.CharField(max_length=160)
    grupo = models.CharField(max_length=60)

    class Meta:
        db_table = "permiso"
        ordering = ["codigo"]

    def __str__(self):
        return self.codigo


class Rol(models.Model):
    CODIGOS = [
        ("admin", "Administrador de la plataforma"),
        ("gerencia", "Gerencia"),
        ("jefe_agencia", "Jefe de agencia"),
        ("oficial", "Oficial de crédito"),
        ("supervisor", "Supervisor de apoyo metodológico"),
        ("metodologia", "Jefatura de metodología de crédito"),
    ]
    codigo = models.CharField(max_length=30, unique=True, choices=CODIGOS)
    nombre = models.CharField(max_length=80)
    permisos = models.ManyToManyField(Permiso, related_name="roles", blank=True)

    class Meta:
        db_table = "rol"
        ordering = ["id"]

    def __str__(self):
        return self.nombre


class UsuarioManager(BaseUserManager):
    def get_by_natural_key(self, username):
        return self.get(username__iexact=username)


class Usuario(AbstractBaseUser):
    username = models.CharField(max_length=60, unique=True)
    email = models.EmailField(blank=True, default="")
    nombre_completo = models.CharField(max_length=120)
    cargo = models.CharField(max_length=120, blank=True, default="")
    rol = models.ForeignKey(Rol, on_delete=models.PROTECT, related_name="usuarios")
    # NULL = alcance de toda la cooperativa
    agencia = models.ForeignKey(
        "territorio.Agencia", null=True, blank=True, on_delete=models.PROTECT, related_name="usuarios"
    )
    activo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "username"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = UsuarioManager()

    class Meta:
        db_table = "usuario"
        ordering = ["id"]
        constraints = [models.UniqueConstraint(Lower("username"), name="usuario_username_ci_unico")]

    @property
    def is_active(self):
        return self.activo

    @property
    def rol_codigo(self):
        return self.rol.codigo if self.rol_id else None

    @property
    def permisos_codigos(self):
        if not hasattr(self, "_permisos_cache"):
            self._permisos_cache = frozenset(self.rol.permisos.values_list("codigo", flat=True)) if self.rol_id else frozenset()
        return self._permisos_cache

    def tiene_permiso(self, codigo):
        return self.activo and codigo in self.permisos_codigos

    def __str__(self):
        return self.username


class SesionUsuario(models.Model):
    """Sesión de servidor: controla inactividad (RF-001.04) y cierre real (RF-001.03)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    usuario = models.ForeignKey(Usuario, on_delete=models.PROTECT, related_name="sesiones")
    creada_en = models.DateTimeField(auto_now_add=True)
    ultima_actividad = models.DateTimeField()
    revocada_en = models.DateTimeField(null=True, blank=True)
    motivo_cierre = models.CharField(max_length=30, blank=True, default="")
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        db_table = "sesion_usuario"
        indexes = [models.Index(fields=["usuario", "revocada_en"])]


class IntentoAcceso(models.Model):
    """Registro de intentos de inicio de sesión (RF-001.05). Nunca guarda contraseñas."""

    username = models.CharField(max_length=150)
    usuario = models.ForeignKey(Usuario, null=True, blank=True, on_delete=models.PROTECT, related_name="intentos")
    ip = models.GenericIPAddressField(null=True, blank=True)
    exitoso = models.BooleanField()
    motivo = models.CharField(max_length=30, blank=True, default="")
    fecha_hora = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "intento_acceso"
        indexes = [models.Index(fields=["username", "ip", "fecha_hora"])]
