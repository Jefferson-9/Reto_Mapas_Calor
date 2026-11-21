from abc import ABC, abstractmethod

from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db.models import Max, Q

from core.pagination import cursor_page
from modules.usuarios.models import IntentoAcceso, Permiso, Rol, SesionUsuario, Usuario


class IUsuarioRepository(ABC):
    @abstractmethod
    def obtener(self, usuario_id) -> dict | None: ...

    @abstractmethod
    def verificar_credenciales(self, username, password) -> tuple[str, dict | None]: ...

    @abstractmethod
    def listar(self, filtros, cursor, tamano) -> dict: ...

    @abstractmethod
    def existe_username(self, username, excluir_id=None) -> bool: ...

    @abstractmethod
    def crear(self, datos, password) -> dict: ...

    @abstractmethod
    def actualizar(self, usuario_id, cambios) -> dict: ...

    @abstractmethod
    def cambiar_password(self, usuario_id, password) -> None: ...

    @abstractmethod
    def validar_password(self, password, datos) -> list: ...

    @abstractmethod
    def rol_existe(self, codigo) -> bool: ...

    @abstractmethod
    def agencia_existe(self, agencia_id) -> bool: ...

    @abstractmethod
    def roles(self) -> list: ...

    @abstractmethod
    def permisos(self) -> list: ...

    @abstractmethod
    def actualizar_permisos_rol(self, codigo, permisos) -> dict: ...

    @abstractmethod
    def oficiales(self, agencia_id) -> list: ...


def usuario_dto(u):
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "nombre_completo": u.nombre_completo,
        "cargo": u.cargo,
        "rol": {"codigo": u.rol.codigo, "nombre": u.rol.nombre},
        "agencia": {"id": u.agencia.id, "codigo": u.agencia.codigo, "nombre": u.agencia.nombre} if u.agencia_id else None,
        "activo": u.activo,
        "created_at": u.created_at,
        "updated_at": u.updated_at,
        "ultimo_acceso": getattr(u, "ultimo_acceso", None),
    }


def _qs():
    return Usuario.objects.select_related("rol", "agencia")


class PostgresUsuarioRepository(IUsuarioRepository):
    def obtener(self, usuario_id):
        u = _qs().filter(id=usuario_id).first()
        if not u:
            return None
        dto = usuario_dto(u)
        dto["permisos"] = sorted(u.permisos_codigos)
        return dto

    def verificar_credenciales(self, username, password):
        u = _qs().filter(username__iexact=(username or "").strip()).first()
        if u is None:
            make_password(password)  # iguala el tiempo de respuesta (no revela si el usuario existe)
            return "invalido", None
        if not check_password(password, u.password):
            return "invalido", {"id": u.id, "username": u.username}
        if not u.activo:
            return "inactivo", {"id": u.id, "username": u.username}
        return "ok", self.obtener(u.id)

    def listar(self, filtros, cursor, tamano):
        qs = _qs().annotate(ultimo_acceso=Max("intentos__fecha_hora", filter=Q(intentos__exitoso=True)))
        if filtros.get("q"):
            q = filtros["q"]
            qs = qs.filter(Q(username__icontains=q) | Q(nombre_completo__icontains=q) | Q(cargo__icontains=q))
        if filtros.get("rol"):
            qs = qs.filter(rol__codigo=filtros["rol"])
        if filtros.get("agencia"):
            qs = qs.filter(agencia_id=filtros["agencia"])
        if filtros.get("activo") in (True, False):
            qs = qs.filter(activo=filtros["activo"])
        return cursor_page(qs, ["username"], cursor, tamano, usuario_dto)

    def existe_username(self, username, excluir_id=None):
        qs = Usuario.objects.filter(username__iexact=username.strip())
        if excluir_id:
            qs = qs.exclude(id=excluir_id)
        return qs.exists()

    def crear(self, datos, password):
        rol = Rol.objects.get(codigo=datos["rol"])
        u = Usuario(
            username=datos["username"].strip(),
            email=datos.get("email", ""),
            nombre_completo=datos["nombre_completo"].strip(),
            cargo=datos.get("cargo", "").strip(),
            rol=rol,
            agencia_id=datos.get("agencia_id"),
            activo=datos.get("activo", True),
        )
        u.set_password(password)
        u.save()
        return self.obtener(u.id)

    def actualizar(self, usuario_id, cambios):
        u = Usuario.objects.select_for_update().get(id=usuario_id)
        for k, v in cambios.items():
            if k == "rol":
                u.rol = Rol.objects.get(codigo=v)
            elif k == "agencia_id":
                u.agencia_id = v
            else:
                setattr(u, k, v)
        u.save()
        return self.obtener(u.id)

    def cambiar_password(self, usuario_id, password):
        u = Usuario.objects.get(id=usuario_id)
        u.set_password(password)
        u.save(update_fields=["password", "updated_at"])

    def validar_password(self, password, datos):
        tmp = Usuario(username=datos.get("username", ""), nombre_completo=datos.get("nombre_completo", ""), email=datos.get("email", ""))
        try:
            validate_password(password, user=tmp)
            return []
        except ValidationError as e:
            return list(e.messages)

    def rol_existe(self, codigo):
        return Rol.objects.filter(codigo=codigo).exists()

    def agencia_existe(self, agencia_id):
        from django.apps import apps

        return apps.get_model("territorio", "Agencia").objects.filter(id=agencia_id, activa=True).exists()

    def roles(self):
        return [
            {"codigo": r.codigo, "nombre": r.nombre, "permisos": sorted(p.codigo for p in r.permisos.all()), "usuarios": r.usuarios.count()}
            for r in Rol.objects.prefetch_related("permisos").order_by("id")
        ]

    def permisos(self):
        return [{"codigo": p.codigo, "descripcion": p.descripcion, "grupo": p.grupo} for p in Permiso.objects.all()]

    def actualizar_permisos_rol(self, codigo, permisos):
        rol = Rol.objects.get(codigo=codigo)
        rol.permisos.set(Permiso.objects.filter(codigo__in=permisos))
        return {"codigo": rol.codigo, "nombre": rol.nombre, "permisos": sorted(p.codigo for p in rol.permisos.all())}

    def oficiales(self, agencia_id):
        qs = _qs().filter(activo=True, rol__permisos__codigo="zonas.propias").distinct()
        if agencia_id is not None:
            qs = qs.filter(agencia_id=agencia_id)
        return [usuario_dto(u) for u in qs.order_by("nombre_completo")]


class ISesionRepository(ABC):
    @abstractmethod
    def crear(self, usuario_id, ip, user_agent, ahora) -> str: ...

    @abstractmethod
    def obtener(self, sesion_id) -> dict | None: ...

    @abstractmethod
    def tocar(self, sesion_id, ahora) -> None: ...

    @abstractmethod
    def revocar(self, sesion_id, motivo, ahora) -> None: ...

    @abstractmethod
    def revocar_de_usuario(self, usuario_id, motivo, ahora) -> int: ...


class PostgresSesionRepository(ISesionRepository):
    def crear(self, usuario_id, ip, user_agent, ahora):
        s = SesionUsuario.objects.create(usuario_id=usuario_id, ip=ip, user_agent=(user_agent or "")[:200], ultima_actividad=ahora)
        return str(s.id)

    def obtener(self, sesion_id):
        try:
            s = SesionUsuario.objects.filter(id=sesion_id).values("id", "usuario_id", "ultima_actividad", "revocada_en").first()
        except (ValueError, ValidationError):
            return None
        return s

    def tocar(self, sesion_id, ahora):
        SesionUsuario.objects.filter(id=sesion_id, revocada_en__isnull=True).update(ultima_actividad=ahora)

    def revocar(self, sesion_id, motivo, ahora):
        SesionUsuario.objects.filter(id=sesion_id, revocada_en__isnull=True).update(revocada_en=ahora, motivo_cierre=motivo)

    def revocar_de_usuario(self, usuario_id, motivo, ahora):
        return SesionUsuario.objects.filter(usuario_id=usuario_id, revocada_en__isnull=True).update(revocada_en=ahora, motivo_cierre=motivo)


class IIntentoRepository(ABC):
    @abstractmethod
    def registrar(self, username, usuario_id, ip, exitoso, motivo) -> None: ...

    @abstractmethod
    def fallidos_desde(self, username, ip, desde) -> int: ...


class PostgresIntentoRepository(IIntentoRepository):
    def registrar(self, username, usuario_id, ip, exitoso, motivo):
        IntentoAcceso.objects.create(username=(username or "")[:150].lower(), usuario_id=usuario_id, ip=ip, exitoso=exitoso, motivo=motivo)

    def fallidos_desde(self, username, ip, desde):
        return IntentoAcceso.objects.filter(username=(username or "")[:150].lower(), ip=ip, exitoso=False, fecha_hora__gte=desde).count()
