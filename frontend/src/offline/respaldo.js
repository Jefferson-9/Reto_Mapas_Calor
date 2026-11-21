// Respuestas sin conexión construidas a partir del paquete guardado y de la cola (funciones puras).
// Imitan la forma de las respuestas de la API para que las pantallas de campo no necesiten ramas especiales.

const VACIO = { type: 'FeatureCollection', features: [] }
export const AVISO_APROXIMADO = 'Validación aproximada sin conexión: el servidor la confirmará al sincronizar'

const itemsZonas = (p) => p?.mis_zonas?.items || []

export const misZonas = (p) => ({ ...p.mis_zonas, sin_conexion: true, generado_en: p.generado_en })

export const periodos = (p) => ({ items: [p.periodo], ultimo: p.periodo, ultima_carga_at: null, sin_conexion: true })

export const zonasBarrio = (p) => ({
  items: itemsZonas(p).map((i) => ({ id: i.zona.id, codigo: i.zona.codigo, nombre: i.zona.nombre, tipo_zona: 'barrio', zona_superior_id: null, es_hoja: true })),
  sin_conexion: true,
})

export const mapaZonas = (p) => ({
  periodo: p.periodo,
  nivel: 'barrio',
  zonas: p.poligonos || VACIO,
  calor: VACIO,
  leyenda: [],
  max_peso: 0,
  sin_datos_suficientes: false,
  sin_conexion: true,
})

export function explicacion(p, zonaId) {
  const i = itemsZonas(p).find((x) => x.zona.id === Number(zonaId))
  return i?.explicacion || { zona_id: Number(zonaId), periodo: p.periodo, sin_datos: true, mensaje: 'La explicación de esta zona no está guardada en el dispositivo.' }
}

/** Orden sugerido local: igual que el servidor (prioridad de la categoría y, a igual prioridad, mayor morosidad). */
export function sugerirOrden(p, zonaIds) {
  const por = new Map(itemsZonas(p).map((i) => [i.zona.id, i]))
  const clave = (id) => {
    const i = por.get(id)
    return [i?.categoria ? i.categoria.prioridad : 1e6, -(Number(i?.indicadores?.tasa_morosidad) || 0)]
  }
  return { zona_ids: [...zonaIds].sort((a, b) => clave(a)[0] - clave(b)[0] || clave(a)[1] - clave(b)[1]), sin_conexion: true }
}

const ACTIVOS = new Set(['pendiente', 'enviando', 'rechazado'])

/** Ruta creada sin conexión, con la forma de una ruta del servidor. */
export function rutaLocal(p, item) {
  const por = new Map(itemsZonas(p).map((i) => [i.zona.id, i.zona]))
  return {
    id: `local-${item.client_uuid}`,
    client_uuid: item.client_uuid,
    nombre: item.datos.nombre,
    fecha_prevista: item.datos.fecha_prevista,
    activa: true,
    local: true,
    estado_cola: item.estado,
    error_cola: item.error,
    created_at: item.client_created_at,
    updated_at: item.client_created_at,
    detalles: (item.datos.zona_ids || []).map((zid, k) => {
      const z = por.get(zid)
      return { orden: k + 1, zona_id: zid, zona: z?.nombre || `Zona ${zid}`, zona_codigo: z?.codigo || '', centroide: z?.centroide || null }
    }),
  }
}

export function rutas(p, cola = []) {
  const locales = cola.filter((i) => i.tipo === 'ruta' && ACTIVOS.has(i.estado)).map((i) => rutaLocal(p, i))
  return { items: [...locales, ...(p.rutas || [])], sin_conexion: true }
}

export function ruta(p, id, cola = []) {
  const r = rutas(p, cola).items.find((x) => String(x.id) === String(id))
  if (!r) return undefined
  const geoms = new Map((p.poligonos?.features || []).map((f) => [f.properties.id, f.geometry]))
  return { ...r, detalles: r.detalles.map((d) => ({ ...d, geometria: geoms.get(d.zona_id) || null })) }
}

/** Posibles socios aún en la cola (las filas del servidor no se guardan en el dispositivo). */
export function prospectos(cola = []) {
  const items = cola
    .filter((i) => i.tipo === 'prospecto' && i.estado !== 'sincronizado')
    .map((i) => ({
      id: `local-${i.client_uuid}`,
      local: true,
      estado_cola: i.estado,
      nombre_negocio: i.datos.nombre_negocio,
      referencia: i.datos.referencia,
      actividad: i.datos.actividad,
      latitud: i.datos.latitud,
      longitud: i.datos.longitud,
      zona: 'Pendiente de sincronizar',
      created_at: i.client_created_at,
      registrado_por: 'Usted',
    }))
  return { items, next_cursor: null, has_more: false, total_count: items.length, sin_conexion: true }
}

export function visitas(p, cola = []) {
  const nombres = new Map(itemsZonas(p).map((i) => [i.zona.id, i.zona.nombre]))
  const items = cola
    .filter((i) => i.tipo === 'visita' && i.estado !== 'sincronizado')
    .map((i) => ({
      id: `local-${i.client_uuid}`,
      local: true,
      estado_cola: i.estado,
      ...i.datos,
      zona: nombres.get(i.datos.zona_id) || `Zona ${i.datos.zona_id}`,
      ruta: null,
      created_at: i.client_created_at,
    }))
  return { items, next_cursor: null, has_more: false, total_count: items.length, sin_conexion: true }
}

// ---- Punto dentro de polígono (GeoJSON en lng/lat), con huecos ----
function enAnillo([x, y], anillo) {
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i]
    const [xj, yj] = anillo[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}
const enPoligono = (pt, anillos) => enAnillo(pt, anillos[0]) && !anillos.slice(1).some((h) => enAnillo(pt, h))
export function contiene(geometria, pt) {
  if (!geometria) return false
  if (geometria.type === 'Polygon') return enPoligono(pt, geometria.coordinates)
  if (geometria.type === 'MultiPolygon') return geometria.coordinates.some((poli) => enPoligono(pt, poli))
  return false
}

/** Validación previa local de la zona de un punto contra los polígonos simplificados de MIS zonas. */
export function zonaPorPunto(p, lat, lng) {
  const pt = [Number(lng), Number(lat)]
  const features = p.poligonos?.features || []
  if (!features.length) return { zona: null, dentro_de_zona: null, en_ambito: null, sin_verificar: true, advertencias: [AVISO_APROXIMADO], sin_conexion: true }
  const f = features.find((x) => contiene(x.geometry, pt))
  if (!f) return { zona: null, dentro_de_zona: false, en_ambito: false, aproximado: true, advertencias: [AVISO_APROXIMADO], sin_conexion: true }
  return { zona: { id: f.properties.id, codigo: f.properties.codigo, nombre: f.properties.nombre }, dentro_de_zona: true, en_ambito: true, aproximado: true, advertencias: [AVISO_APROXIMADO], sin_conexion: true }
}
