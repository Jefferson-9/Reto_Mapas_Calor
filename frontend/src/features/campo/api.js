import { api } from '../../api/client'
import * as respaldo from '../../offline/respaldo'
import { conRespaldo, desdeLocal, enviarOEncolar } from '../../offline/servicio'
import { fmtIndicador } from '../../utils/format'

/** Contratos del módulo de campo (CU-13 a CU-18). Rutas relativas a /api/v1; las respuestas llegan desenvueltas. */
export const campoApi = {
  // Territorio y mapa
  zonas: (tipo, signal) => conRespaldo(() => api.get('/zonas/', { params: { tipo }, signal, cacheTtl: 120000 }), (p) => (tipo === 'barrio' ? respaldo.zonasBarrio(p) : undefined)),
  zonaPorPunto: (lat, lng, signal) => conRespaldo(() => api.get('/zonas/por-punto/', { params: { lat, lng }, signal }), (p) => respaldo.zonaPorPunto(p, lat, lng)),
  // Sin conexión solo hay polígonos simplificados de MIS zonas (paquete del modo campo)
  mapaZonas: (params, signal) => conRespaldo(() => api.get('/mapa/zonas/', { params, signal, cacheTtl: 30000 }), (p) => respaldo.mapaZonas(p)),
  explicacion: (zonaId, periodo, signal) => conRespaldo(() => api.get(`/clasificacion/zonas/${zonaId}/`, { params: { periodo }, signal }), (p) => respaldo.explicacion(p, zonaId)),

  // CU-14 / CU-15
  oficiales: (signal) => api.get('/usuarios/oficiales/', { signal, cacheTtl: 60000 }),
  asignaciones: (oficial, signal) => api.get('/asignaciones/', { params: { oficial }, signal }),
  asignar: (oficial_id, zona_ids) => api.post('/asignaciones/', { oficial_id, zona_ids }),
  retirar: (id) => api.del(`/asignaciones/${id}/`),
  misZonas: (periodo, signal) => conRespaldo(() => api.get('/mis-zonas/', { params: { periodo }, signal }), (p) => respaldo.misZonas(p)),
  listaOficial: (oficialId, periodo, signal) => api.get(`/oficiales/${oficialId}/zonas-priorizadas/`, { params: { periodo }, signal }),

  // CU-13
  prospectos: ({ q, zona, cursor }, signal) => conRespaldo(() => api.get('/prospectos/', { params: { q, zona, cursor }, signal }), (_p, cola) => respaldo.prospectos(cola)),
  // Sin conexión (modo campo activo): se guarda en la cola de salida con el mismo client_uuid → { encolado: true, item }
  registrarProspecto: (datos) => enviarOEncolar('prospecto', datos, () => api.post('/prospectos/', datos)),

  // CU-16
  rutas: (signal) => conRespaldo(() => api.get('/rutas/', { signal }), (p, cola) => respaldo.rutas(p, cola)),
  // Las rutas creadas sin conexión («local-…») viven en la cola hasta sincronizarse
  ruta: (id, signal) => (String(id).startsWith('local-') ? desdeLocal((p, cola) => respaldo.ruta(p, id, cola)) : conRespaldo(() => api.get(`/rutas/${id}/`, { signal }), (p, cola) => respaldo.ruta(p, id, cola))),
  crearRuta: (datos, periodo) => enviarOEncolar('ruta', { ...datos, periodo }, () => api.post('/rutas/', datos, { params: { periodo } })),
  sugerirOrden: (zona_ids, periodo) => conRespaldo(() => api.post('/rutas/sugerir-orden/', { zona_ids }, { params: { periodo } }), (p) => respaldo.sugerirOrden(p, zona_ids)),
  actualizarRuta: (id, cambios, periodo) => api.patch(`/rutas/${id}/`, cambios, { params: { periodo } }),

  // CU-17 / CU-18 (condicionados)
  visitas: ({ desde, hasta, zona, cursor }, signal) => conRespaldo(() => api.get('/visitas/', { params: { desde, hasta, zona, cursor }, signal }), (p, cola) => respaldo.visitas(p, cola)),
  registrarVisita: (datos) => enviarOEncolar('visita', datos, () => api.post('/visitas/', datos)),
  seguimiento: ({ oficial, desde, hasta }, signal) => api.get('/seguimiento/', { params: { oficial, desde, hasta }, signal }),
  antesDespues: (zonaId, antes, despues, signal) => api.get(`/seguimiento/zonas/${zonaId}/antes-despues/`, { params: { antes, despues }, signal }),
}

// Opciones iniciales de resultado de visita (sujetas a aprobación de la cooperativa)
export const RESULTADOS_VISITA = [
  { valor: 'socio_captado', etiqueta: 'Socio captado' },
  { valor: 'credito_colocado', etiqueta: 'Crédito colocado' },
  { valor: 'pago_comprometido', etiqueta: 'Pago comprometido' },
  { valor: 'interes', etiqueta: 'Mostró interés' },
  { valor: 'sin_interes', etiqueta: 'Sin interés' },
]
export const etiquetaResultado = (v) => RESULTADOS_VISITA.find((r) => r.valor === v)?.etiqueta || '—'

const OPERADORES = { '>': 'mayor que', '>=': 'mayor o igual que', '<': 'menor que', '<=': 'menor o igual que', '==': 'igual a', entre: 'entre' }

/** Texto legible de una regla evaluada: «Tasa de morosidad mayor que 5,00 %». */
export function textoRegla(r) {
  const f = (v) => fmtIndicador(r.variable, v)
  const umbral = r.operador === 'entre' && Array.isArray(r.umbral) ? `${f(r.umbral[0])} y ${f(r.umbral[1])}` : f(r.umbral)
  return `${r.etiqueta} ${OPERADORES[r.operador] || r.operador} ${umbral}`
}

// Fechas locales de Ecuador como AAAA-MM-DD (para inputs type="date"). Llamar solo en manejadores o inicializadores.
const fechaISO = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
export const hoyISO = () => fechaISO(new Date())
export const inicioMesISO = () => `${hoyISO().slice(0, 8)}01`
/** Fecha AAAA-MM-DD (sin hora) formateada sin desfase de zona horaria. */
export const fmtDia = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

export const VACIO_FC = { type: 'FeatureCollection', features: [] }

/** FeatureCollection de ruta para GeoMap: un LineString con el recorrido y Points numerados con `orden`. */
export function fcRuta(paradas) {
  const conCentro = paradas.filter((p) => Array.isArray(p.centroide))
  const features = conCentro.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p.centroide }, properties: { orden: p.orden, zona_id: p.zona_id, nombre: p.nombre } }))
  if (conCentro.length > 1) features.unshift({ type: 'Feature', geometry: { type: 'LineString', coordinates: conCentro.map((p) => p.centroide) }, properties: {} })
  return { type: 'FeatureCollection', features }
}

/** Filtra los polígonos del mapa a un conjunto de ids de zona. */
export function filtrarZonas(fc, ids) {
  if (!fc?.features) return VACIO_FC
  const set = ids instanceof Set ? ids : new Set(ids)
  return { type: 'FeatureCollection', features: fc.features.filter((f) => set.has(f.properties?.id)) }
}

/** Puntos de posibles socios para la capa ámbar del mapa. */
export function fcProspectos(items) {
  return {
    type: 'FeatureCollection',
    features: items
      .filter((p) => p.latitud && p.longitud)
      .map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [Number(p.longitud), Number(p.latitud)] }, properties: { id: p.id, nombre: p.nombre_negocio } })),
  }
}

/** Copia los errores por campo de un ApiError al formulario (react-hook-form). Devuelve true si aplicó alguno. */
export function aplicarErroresCampos(error, setError, alias = {}) {
  const campos = error?.campos || {}
  let aplicado = false
  Object.entries(campos).forEach(([campo, mensaje]) => {
    const destino = alias[campo] ?? campo
    if (destino) {
      setError(destino, { type: 'servidor', message: mensaje })
      aplicado = true
    }
  })
  return aplicado
}
