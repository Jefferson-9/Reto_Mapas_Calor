import { api, descargar } from '../../api/client'

// Catálogos de la gestión de datos (CU-03, CU-04, CU-05 y esquemas de carga)
export const TIPOS_CARGA = [
  { valor: 'socios', etiqueta: 'Socios' },
  { valor: 'creditos', etiqueta: 'Créditos' },
  { valor: 'pagos', etiqueta: 'Pagos' },
]
export const TIPOS_ESQUEMA = [...TIPOS_CARGA, { valor: 'limites', etiqueta: 'Límites geográficos' }]
export const etiquetaTipo = (t) => TIPOS_ESQUEMA.find((x) => x.valor === t)?.etiqueta || t

export const ESTADOS_CARGA = [
  { valor: 'requiere_revision', etiqueta: 'Requiere revisión' },
  { valor: 'completada', etiqueta: 'Completada' },
  { valor: 'cancelada', etiqueta: 'Cancelada' },
  { valor: 'fallida', etiqueta: 'Fallida' },
  { valor: 'validando', etiqueta: 'Validando' },
]

export const ESTADOS_OBSERVADO = [
  { valor: 'pendiente', etiqueta: 'Pendientes' },
  { valor: 'corregido', etiqueta: 'Corregidos' },
  { valor: 'descartado', etiqueta: 'Descartados' },
  { valor: 'conservado', etiqueta: 'Conservados con observación' },
]

// Campos editables al corregir un observado (espejo de EDITABLES en services/observados.py)
export const EDITABLES = {
  socios: ['codigo_socio', 'cedula', 'nombre', 'agencia_codigo', 'fecha_ingreso', 'latitud', 'longitud', 'rango_ingreso', 'direccion'],
  creditos: ['codigo_credito', 'codigo_socio', 'monto', 'fecha_desembolso', 'plazo_meses', 'estado'],
  pagos: ['codigo_credito', 'periodo', 'valor_pagado', 'valor_pendiente', 'dias_atraso', 'fecha_pago'],
}

// Etiquetas y tipo de control por campo del esquema inicial (sección 6.3)
export const CAMPOS_INFO = {
  codigo_socio: { etiqueta: 'Código de socio' },
  cedula: { etiqueta: 'Cédula', sensible: true },
  nombre: { etiqueta: 'Nombre', autoComplete: 'off' },
  agencia_codigo: { etiqueta: 'Código de agencia' },
  fecha_ingreso: { etiqueta: 'Fecha de ingreso', tipo: 'fecha' },
  latitud: { etiqueta: 'Latitud', tipo: 'decimal', ayuda: 'Grados decimales, p. ej. -3.996800' },
  longitud: { etiqueta: 'Longitud', tipo: 'decimal', ayuda: 'Grados decimales, p. ej. -79.201800' },
  rango_ingreso: { etiqueta: 'Rango de ingreso' },
  direccion: { etiqueta: 'Dirección' },
  codigo_credito: { etiqueta: 'Código de crédito' },
  monto: { etiqueta: 'Monto (USD)', tipo: 'decimal' },
  fecha_desembolso: { etiqueta: 'Fecha de desembolso', tipo: 'fecha' },
  plazo_meses: { etiqueta: 'Plazo (meses)', tipo: 'entero' },
  estado: { etiqueta: 'Estado del crédito', ayuda: 'vigente, vencido, cancelado o castigado' },
  periodo: { etiqueta: 'Período', tipo: 'periodo', ayuda: 'Formato AAAA-MM' },
  valor_pagado: { etiqueta: 'Valor pagado (USD)', tipo: 'decimal' },
  valor_pendiente: { etiqueta: 'Valor pendiente (USD)', tipo: 'decimal' },
  dias_atraso: { etiqueta: 'Días de atraso', tipo: 'entero' },
  fecha_pago: { etiqueta: 'Fecha de pago', tipo: 'fecha' },
}
export const etiquetaCampo = (c) => CAMPOS_INFO[c]?.etiqueta || c

export const datosApi = {
  // CU-03 cargas
  cargas: (params, signal) => api.get('/cargas/', { params, signal }),
  carga: (id, signal) => api.get(`/cargas/${id}/`, { signal }),
  subir: (formData) => api.post('/cargas/', formData),
  mapeo: (id, mapeo, guardarAlias) => api.put(`/cargas/${id}/mapeo/`, { mapeo, guardar_alias: guardarAlias }),
  confirmar: (id) => api.post(`/cargas/${id}/confirmar/`),
  cancelar: (id) => api.post(`/cargas/${id}/cancelar/`),
  errores: (id) => descargar(`/cargas/${id}/errores.csv`),
  plantilla: (tipo) => descargar(`/esquemas/${tipo}/plantilla.csv`),
  conexionBD: (signal) => api.get('/cargas/conexion-bd/', { signal }),
  // Esquemas de carga
  esquema: (tipo, signal) => api.get(`/esquemas/${tipo}/`, { signal }),
  editarEsquema: (tipo, campos) => api.put(`/esquemas/${tipo}/editar/`, { campos }),
  // CU-04 observados
  observados: (params, signal) => api.get('/observados/', { params, signal }),
  resumenObservados: (signal) => api.get('/observados/resumen/', { signal }),
  corregir: (id, datos, nota) => api.post(`/observados/${id}/corregir/`, { datos, nota }),
  descartar: (id, nota) => api.post(`/observados/${id}/descartar/`, { nota }),
  conservar: (id, nota) => api.post(`/observados/${id}/conservar/`, { nota }),
  // CU-05 límites
  limites: (params, signal) => api.get('/limites/', { params, signal }),
  subirLimites: (formData) => api.post('/limites/', formData),
  confirmarLimites: (id, retirarAusentes) => api.post(`/limites/${id}/confirmar/`, { retirar_ausentes: retirarAusentes }),
  cancelarLimites: (id) => api.post(`/limites/${id}/cancelar/`),
}
