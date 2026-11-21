import { api } from '../../api/client'

export const analiticaApi = {
  periodos: (signal) => api.get('/periodos/', { signal }),
  panel: ({ periodo, nivel, zona }, signal) => api.get('/panel/', { params: { periodo, nivel, zona }, signal, cacheTtl: 30000 }),
  indicadores: (params, signal) => api.get('/indicadores/', { params, signal }),
  mapaZonas: (params, signal) => api.get('/mapa/zonas/', { params, signal, cacheTtl: 30000 }),
  mapaPuntos: (params, signal) => api.get('/mapa/puntos/', { params, signal }),
  detalleZona: (id, periodo, signal) => api.get(`/mapa/zonas/${id}/`, { params: { periodo }, signal }),
  comparar: (params, signal) => api.get('/comparar/', { params, signal }),
}
