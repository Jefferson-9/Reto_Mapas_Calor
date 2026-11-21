import { api } from '../../api/client'

export const CATEGORIAS_HISTORIAL = {
  acceso: 'Acceso',
  usuarios: 'Usuarios',
  datos: 'Datos',
  geografia: 'Geografía',
  criterios: 'Criterios',
  campo: 'Trabajo de campo',
  analisis: 'Análisis',
  reportes: 'Reportes',
  configuracion: 'Configuración',
}

// Roles cuyo ámbito exige una agencia (espejo de ROLES_CON_AGENCIA del backend)
export const ROLES_CON_AGENCIA = ['jefe_agencia', 'oficial']

// Variables del puntaje de potencial (espejo de DESCRIPCION_VARIABLES)
export const VARIABLES_POTENCIAL = [
  { clave: 'penetracion_baja', etiqueta: 'Baja penetración', descripcion: 'Baja penetración de socios frente a hogares (1 − penetración normalizada)', crudo: 'penetracion', formato: 'pct' },
  { clave: 'hogares', etiqueta: 'Hogares estimados', descripcion: 'Hogares estimados de la zona (normalizado)', crudo: 'hogares', formato: 'entero' },
  { clave: 'crecimiento', etiqueta: 'Crecimiento de socios', descripcion: 'Variación % de socios en los últimos períodos (normalizado)', crudo: 'crecimiento', formato: 'pct' },
  { clave: 'prospectos', etiqueta: 'Posibles socios', descripcion: 'Posibles socios registrados en la zona (normalizado)', crudo: 'prospectos', formato: 'entero' },
  { clave: 'mora_baja', etiqueta: 'Baja morosidad', descripcion: 'Baja morosidad (1 − tasa de morosidad normalizada)', crudo: 'mora', formato: 'pct' },
]

export const BANDAS = {
  alto: { etiqueta: 'Potencial alto', color: '#1d8a5a', tono: 'verde' },
  medio: { etiqueta: 'Potencial medio', color: '#e0a526', tono: 'ambar' },
  bajo: { etiqueta: 'Potencial bajo', color: '#7d8da6', tono: 'neutro' },
  sin_datos: { etiqueta: 'Sin datos', color: '#c9c2b4', tono: 'neutro' },
}

export const adminApi = {
  // CU-06 historial
  historial: (params, signal) => api.get('/historial/', { params, signal }),
  filtrosHistorial: (signal) => api.get('/historial/filtros/', { signal, cacheTtl: 60000 }),
  verificarHistorial: () => api.get('/historial/verificar/'),
  // CU-02 usuarios, roles y permisos
  usuarios: (params, signal) => api.get('/usuarios/', { params, signal }),
  crearUsuario: (datos) => api.post('/usuarios/', datos),
  editarUsuario: (id, datos) => api.patch(`/usuarios/${id}/`, datos),
  estadoUsuario: (id, activar) => api.post(`/usuarios/${id}/${activar ? 'activar' : 'desactivar'}/`),
  contrasena: (id, password) => api.post(`/usuarios/${id}/contrasena/`, { password }),
  roles: (signal) => api.get('/roles/', { signal }),
  permisosRol: (codigo, permisos) => api.put(`/roles/${codigo}/permisos/`, { permisos }),
  agencias: (signal) => api.get('/agencias/', { signal, cacheTtl: 120000 }),
  // Parámetros institucionales
  parametros: (signal) => api.get('/parametros/', { signal }),
  guardarParametros: (cambios) => api.patch('/parametros/', cambios),
  // CU-20 / CU-21 potencial de captación
  potencialEstado: (signal) => api.get('/potencial/estado/', { signal }),
  potencial: (params, signal) => api.get('/potencial/', { params, signal }),
  potencialZona: (id, params, signal) => api.get(`/potencial/zonas/${id}/`, { params, signal }),
  configuracionAnalisis: (signal) => api.get('/analisis/configuracion/', { signal }),
  guardarConfiguracion: (datos) => api.post('/analisis/configuracion/', datos),
  ejecutarAnalisis: (periodo, nivel) => api.post('/analisis/ejecutar/', { periodo, nivel }),
}
