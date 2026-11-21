"""Catálogo de 22 permisos y matriz inicial roles × permisos (sección 7.2).

Matriz por defecto, editable por seed/configuración y pendiente de validación con la cooperativa.
"""

PERMISOS = [
    ("panel.ver", "Ver panel de resumen", "Consulta y análisis"),
    ("mapa.ver", "Consultar mapa y mapa de calor", "Consulta y análisis"),
    ("indicadores.ver", "Consultar indicadores por zona", "Consulta y análisis"),
    ("comparar.ver", "Comparar evolución de zonas", "Consulta y análisis"),
    ("clasificacion.ver", "Consultar clasificación de zonas", "Consulta y análisis"),
    ("reportes.generar", "Generar y descargar reportes", "Consulta y análisis"),
    ("potencial.ver", "Consultar potencial de captación", "Consulta y análisis"),
    ("criterios.definir", "Definir versiones de criterios", "Criterios"),
    ("criterios.aprobar", "Aprobar o rechazar criterios", "Criterios"),
    ("zonas.asignar", "Asignar zonas a oficiales", "Trabajo de campo"),
    ("zonas.propias", "Limitar a zonas asignadas", "Trabajo de campo"),
    ("rutas.gestionar", "Organizar rutas de visita", "Trabajo de campo"),
    ("visitas.registrar", "Registrar visitas", "Trabajo de campo"),
    ("seguimiento.ver", "Supervisar visitas previstas y realizadas", "Trabajo de campo"),
    ("prospectos.registrar", "Registrar ubicación de posibles socios", "Trabajo de campo"),
    ("datos.cargar", "Cargar archivos CSV", "Datos y administración"),
    ("datos.validar", "Validar y depurar registros", "Datos y administración"),
    ("limites.gestionar", "Gestionar límites geográficos", "Datos y administración"),
    ("historial.ver", "Consultar historial", "Datos y administración"),
    ("usuarios.gestionar", "Gestionar usuarios y permisos", "Datos y administración"),
    ("analisis.ejecutar", "Ejecutar análisis y configurar variables", "Datos y administración"),
    ("config.gestionar", "Configuración y parámetros", "Datos y administración"),
]

_TODOS_CONSULTA = ["panel.ver", "mapa.ver", "indicadores.ver", "clasificacion.ver"]

MATRIZ = {
    "admin": _TODOS_CONSULTA
    + ["comparar.ver", "reportes.generar", "potencial.ver", "datos.cargar", "datos.validar", "limites.gestionar",
       "historial.ver", "usuarios.gestionar", "analisis.ejecutar", "config.gestionar"],
    "gerencia": _TODOS_CONSULTA + ["comparar.ver", "seguimiento.ver", "reportes.generar", "potencial.ver"],
    "jefe_agencia": _TODOS_CONSULTA
    + ["comparar.ver", "zonas.asignar", "seguimiento.ver", "prospectos.registrar", "reportes.generar", "potencial.ver"],
    "oficial": _TODOS_CONSULTA + ["zonas.propias", "rutas.gestionar", "visitas.registrar", "prospectos.registrar"],
    "supervisor": _TODOS_CONSULTA + ["comparar.ver", "seguimiento.ver", "reportes.generar"],
    "metodologia": _TODOS_CONSULTA + ["comparar.ver", "criterios.definir", "criterios.aprobar", "reportes.generar", "potencial.ver"],
}

ROLES = {
    "admin": "Administrador de la plataforma",
    "gerencia": "Gerencia",
    "jefe_agencia": "Jefe de agencia",
    "oficial": "Oficial de crédito",
    "supervisor": "Supervisor de apoyo metodológico",
    "metodologia": "Jefatura de metodología de crédito",
}

# Roles cuyo ámbito exige una agencia
ROLES_CON_AGENCIA = {"jefe_agencia", "oficial"}
