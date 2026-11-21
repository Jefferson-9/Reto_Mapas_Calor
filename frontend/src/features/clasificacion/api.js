import { api, cacheInvalidate } from '../../api/client'

/** CU-11 (criterios) y CU-12 (clasificación y explicación de zonas). */
export const clasificacionApi = {
  versiones: (signal) => api.get('/criterios/', { signal }),
  validar: (version) => api.post('/criterios/validar/', version),
  crear: (version) => api.post('/criterios/', version),
  aprobar: async (id) => {
    const r = await api.post(`/criterios/${id}/aprobar/`)
    // La aprobación recalcula la clasificación: se invalidan las vistas que la muestran
    cacheInvalidate('/clasificacion', '/panel', '/mapa')
    return r
  },
  rechazar: (id, motivo) => api.post(`/criterios/${id}/rechazar/`, { motivo }),
  clasificacion: ({ periodo }, signal) => api.get('/clasificacion/', { params: { periodo }, signal, cacheTtl: 30000 }),
  explicacion: (zonaId, periodo, signal) => api.get(`/clasificacion/zonas/${zonaId}/`, { params: { periodo }, signal }),
}

// Lista blanca del backend (modules/clasificacion/services/reglas.py)
export const VARIABLES_CRITERIO = [
  { valor: 'total_socios', etiqueta: 'Total de socios' },
  { valor: 'total_creditos', etiqueta: 'Créditos activos' },
  { valor: 'monto_cartera', etiqueta: 'Monto de cartera' },
  { valor: 'creditos_atrasados', etiqueta: 'Créditos con pagos atrasados' },
  { valor: 'saldo_vencido', etiqueta: 'Saldo vencido' },
  { valor: 'tasa_morosidad', etiqueta: 'Tasa de morosidad (%)' },
  { valor: 'penetracion_pct', etiqueta: 'Penetración de socios (%)' },
]

export const OPERADORES_CRITERIO = [
  { valor: '>', etiqueta: 'mayor que', simbolo: '>' },
  { valor: '>=', etiqueta: 'mayor o igual que', simbolo: '≥' },
  { valor: '<', etiqueta: 'menor que', simbolo: '<' },
  { valor: '<=', etiqueta: 'menor o igual que', simbolo: '≤' },
  { valor: '==', etiqueta: 'igual a', simbolo: '=' },
  { valor: 'entre', etiqueta: 'entre (incluye límites)', simbolo: 'entre' },
]

export const ESTADOS_VERSION = {
  pendiente: { etiqueta: 'Pendiente de aprobación', tono: 'ambar' },
  vigente: { etiqueta: 'Vigente', tono: 'verde' },
  anterior: { etiqueta: 'Anterior', tono: 'neutro' },
  rechazada: { etiqueta: 'Rechazada', tono: 'rojo' },
}
