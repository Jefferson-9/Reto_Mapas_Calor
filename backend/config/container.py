"""Raíz de composición: único lugar donde se eligen implementaciones de repositorios y se inyectan en servicios.

`settings.DB_BACKEND` selecciona la familia de repositorios (hoy solo "postgres").
"""

from django.conf import settings
from django.db import transaction

from core.repositories.base import IUnitOfWork


class DjangoUnitOfWork(IUnitOfWork):
    def atomic(self):
        return transaction.atomic()


def _check_backend():
    if settings.DB_BACKEND != "postgres":
        raise RuntimeError(f"DB_BACKEND no soportado: {settings.DB_BACKEND}")


def uow():
    return DjangoUnitOfWork()


def auditoria():
    _check_backend()
    from modules.auditoria.repositories.historial import PostgresHistorialRepository
    from modules.auditoria.services.auditoria import ServicioAuditoria

    return ServicioAuditoria(PostgresHistorialRepository())


def servicio_parametros():
    from core.parametros import ServicioParametros
    from core.repositories.parametros import PostgresParametrosRepository

    return ServicioParametros(PostgresParametrosRepository(), auditoria(), uow())


def reloj():
    from django.utils import timezone

    return timezone.now


def _repos_usuarios():
    from modules.usuarios.repositories.usuarios import (
        PostgresIntentoRepository,
        PostgresSesionRepository,
        PostgresUsuarioRepository,
    )

    return PostgresUsuarioRepository(), PostgresSesionRepository(), PostgresIntentoRepository()


def servicio_autenticacion():
    from modules.usuarios.services.autenticacion import ServicioAutenticacion

    usuarios, sesiones, intentos = _repos_usuarios()
    return ServicioAutenticacion(
        usuarios, sesiones, intentos, auditoria(), uow(), reloj(),
        max_intentos=settings.LOGIN_MAX_INTENTOS,
        ventana_minutos=settings.LOGIN_VENTANA_MINUTOS,
        minutos_inactividad=lambda: servicio_parametros().valor("minutos_inactividad_sesion"),
    )


def repo_territorio():
    from modules.territorio.repositories.territorio import PostgresTerritorioRepository

    return PostgresTerritorioRepository()


def servicio_territorio():
    from modules.territorio.services.territorio import ServicioTerritorio

    return ServicioTerritorio(repo_territorio())


def _repos_cartera():
    from modules.cartera.repositories.cargas import (
        PostgresCargaRepository,
        PostgresEsquemaRepository,
        PostgresObservadoRepository,
    )
    from modules.cartera.repositories.datos import PostgresDatosRepository, PostgresIndicadorRepository

    return {
        "cargas": PostgresCargaRepository(), "esquemas": PostgresEsquemaRepository(), "observados": PostgresObservadoRepository(),
        "datos": PostgresDatosRepository(), "indicadores": PostgresIndicadorRepository(),
    }


def almacen():
    from modules.cartera.almacen import AlmacenPrivado

    return AlmacenPrivado(settings.PRIVATE_UPLOAD_ROOT)


def servicio_indicadores():
    from modules.cartera.services.indicadores import ServicioIndicadores

    r = _repos_cartera()
    return ServicioIndicadores(r["indicadores"], repo_territorio(), r["cargas"], servicio_parametros(), reloj())


def servicio_esquemas():
    from modules.cartera.services.esquemas import ServicioEsquemas

    return ServicioEsquemas(_repos_cartera()["esquemas"], auditoria(), uow())


def _al_recalcular():
    # Observador: tras recalcular indicadores, se recalcula la clasificación vigente de esos períodos
    return [lambda periodos: servicio_clasificacion().recalcular_periodos(periodos)]


def servicio_cargas():
    from modules.cartera.services.cargas import ServicioCargas

    r = _repos_cartera()
    return ServicioCargas(
        r["cargas"], r["esquemas"], r["datos"], r["observados"], repo_territorio(), servicio_indicadores(), auditoria(), uow(),
        servicio_parametros(), almacen(), reloj(), servicio_esquemas(), al_recalcular=_al_recalcular(),
    )


def servicio_observados():
    from modules.cartera.services.observados import ServicioObservados

    r = _repos_cartera()
    return ServicioObservados(r["observados"], servicio_esquemas(), r["datos"], servicio_cargas(), servicio_indicadores(), auditoria(),
                              uow(), reloj(), al_recalcular=_al_recalcular())


def servicio_limites():
    from modules.cartera.services.limites import ServicioLimites

    r = _repos_cartera()
    return ServicioLimites(
        r["cargas"], servicio_esquemas(), repo_territorio(), r["datos"], servicio_indicadores(), auditoria(), uow(), servicio_parametros(),
        almacen(), reloj(), al_cambiar_limites=[lambda: servicio_campo().sincronizar_zonas_prospectos()], al_recalcular=_al_recalcular(),
    )


def servicio_clasificacion():
    from modules.clasificacion.repositories.clasificacion import PostgresClasificacionRepository
    from modules.clasificacion.services.clasificacion import ServicioClasificacion

    return ServicioClasificacion(PostgresClasificacionRepository(), _repos_cartera()["indicadores"], servicio_territorio(), auditoria(), uow(), reloj())


def servicio_campo():
    from modules.campo.repositories.campo import PostgresCampoRepository
    from modules.campo.services.campo import ServicioCampo

    return ServicioCampo(PostgresCampoRepository(), servicio_territorio(), repo_territorio(), servicio_clasificacion(),
                         _repos_cartera()["indicadores"], auditoria(), uow(), servicio_parametros(), reloj())


def servicio_sincronizacion():
    from modules.campo.services.sincronizacion import ServicioSincronizacion

    return ServicioSincronizacion(servicio_campo(), servicio_clasificacion(), servicio_territorio(), auditoria(), uow(), servicio_parametros(), reloj())


def _repo_campo():
    from modules.campo.repositories.campo import PostgresCampoRepository

    return PostgresCampoRepository()


def servicio_consultas():
    from modules.analitica.services.consultas import ServicioConsultas

    r = _repos_cartera()
    return ServicioConsultas(servicio_territorio(), r["indicadores"], r["cargas"], r["datos"], servicio_clasificacion(), _repo_campo(),
                             servicio_parametros())


def servicio_potencial():
    from modules.analitica.repositories.potencial import PostgresPotencialRepository
    from modules.analitica.services.potencial import ServicioPotencial

    r = _repos_cartera()
    return ServicioPotencial(PostgresPotencialRepository(), servicio_territorio(), r["indicadores"], _repo_campo(), r["cargas"], auditoria(), uow(),
                             servicio_parametros())


def servicio_reportes():
    from modules.reportes.services.reportes import ServicioReportes

    return ServicioReportes(servicio_consultas(), servicio_clasificacion(), servicio_territorio(), _repos_cartera(), auditoria(), reloj())


def servicio_usuarios():
    from modules.usuarios.services.usuarios import ServicioUsuarios

    usuarios, sesiones, _ = _repos_usuarios()
    return ServicioUsuarios(usuarios, sesiones, auditoria(), uow(), reloj())
