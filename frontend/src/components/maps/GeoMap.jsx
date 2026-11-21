import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// Worker empaquetado por Vite (incluye sus dependencias) para desarrollo y producción
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { CENTRO_LOJA, COLOR_SIN_DATOS, ESTILO_MAPA, ESTILO_NEUTRO, VACIO, bbox, expresionColor, soportaWebGL } from './mapUtils'

/**
 * Mapa MapLibre imperativo. Se crea una vez; al cambiar filtros solo se actualizan las fuentes con setData.
 */
maplibregl.setWorkerUrl(workerUrl)

export const GeoMap = forwardRef(function GeoMap(
  { zonas = VACIO, leyenda, modoColor = 'valor', calor = VACIO, maxPeso = 1, puntos = VACIO, prospectos = VACIO, ruta = VACIO, marcador = VACIO, capas = {}, seleccion, encuadre, onZona, onMover, onClickMapa, modoMarcar = false, className = '', etiqueta = 'Mapa', fallback },
  ref,
) {
  const contenedor = useRef(null)
  const mapa = useRef(null)
  const datos = useRef({})
  const cb = useRef({})
  const [listo, setListo] = useState(false)
  const [sinBase, setSinBase] = useState(false)
  const [webgl] = useState(soportaWebGL)
  datos.current = { zonas, calor, puntos, prospectos, ruta, marcador, leyenda, modoColor, maxPeso, capas, seleccion }
  cb.current = { onZona, onMover, onClickMapa, modoMarcar }

  useImperativeHandle(ref, () => ({
    volarA: (lngLat, zoom = 15) => mapa.current?.flyTo({ center: lngLat, zoom, essential: true }),
    encuadrar: (fc) => {
      const b = bbox(fc)
      if (b) mapa.current?.fitBounds(b, { padding: 48, maxZoom: 15, duration: 600 })
    },
  }))

  useEffect(() => {
    if (!webgl || !contenedor.current) return undefined
    // Sin conexión el mapa base no está disponible: polígonos y puntos sobre un fondo neutro (20.4)
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    if (offline) setSinBase(true)
    const m = new maplibregl.Map({
      container: contenedor.current,
      style: offline ? ESTILO_NEUTRO : ESTILO_MAPA,
      center: CENTRO_LOJA,
      zoom: 12,
      attributionControl: { compact: true },
      cooperativeGestures: false,
      dragRotate: false,
      pitchWithRotate: false,
    })
    mapa.current = m
    m.touchZoomRotate.disableRotation()
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    let estiloFallido = false
    m.on('error', (e) => {
      // Sin acceso al mapa base (sin internet o servicio caído): se continúa sobre un fondo neutro
      if (!estiloFallido && !m.isStyleLoaded() && /style|Failed to fetch|NetworkError/i.test(String(e?.error?.message || ''))) {
        estiloFallido = true
        setSinBase(true)
        m.setStyle(ESTILO_NEUTRO)
      }
    })
    m.on('style.load', () => {
      instalarCapas(m, datos.current)
      setListo(true)
    })
    m.on('click', (e) => {
      if (cb.current.modoMarcar) {
        cb.current.onClickMapa?.(e.lngLat)
        return
      }
      const f = m.queryRenderedFeatures(e.point, { layers: ['zonas-fill'].filter((l) => m.getLayer(l)) })[0]
      if (f) cb.current.onZona?.(f.properties.id, f.properties, e.lngLat)
    })
    m.on('click', 'puntos-cluster', (e) => {
      const f = e.features[0]
      m.getSource('puntos')
        .getClusterExpansionZoom(f.properties.cluster_id)
        .then((z) => m.easeTo({ center: f.geometry.coordinates, zoom: z }))
        .catch(() => {})
    })
    const hover = (estado) => () => (m.getCanvas().style.cursor = cb.current.modoMarcar ? 'crosshair' : estado)
    m.on('mouseenter', 'zonas-fill', hover('pointer'))
    m.on('mouseleave', 'zonas-fill', hover(''))
    // Estado observable (pruebas E2E y lectores): polígonos realmente dibujados al quedar en reposo
    m.on('idle', () => {
      if (contenedor.current && m.getLayer('zonas-fill')) contenedor.current.dataset.renderizadas = String(m.queryRenderedFeatures({ layers: ['zonas-fill'] }).length)
    })
    let t = null
    m.on('moveend', () => {
      clearTimeout(t)
      t = setTimeout(() => {
        const b = m.getBounds()
        cb.current.onMover?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], m.getZoom())
      }, 250)
    })
    const ro = new ResizeObserver(() => m.resize())
    ro.observe(contenedor.current)
    return () => {
      clearTimeout(t)
      ro.disconnect()
      m.remove()
      mapa.current = null
    }
  }, [webgl])

  // Actualizaciones de datos: setData, sin recrear el mapa ni las capas
  useEffect(() => {
    const m = mapa.current
    if (!listo || !m) return
    const set = (id, d) => m.getSource(id)?.setData(d || VACIO)
    set('zonas', zonas)
    set('calor', calor)
    set('puntos', puntos)
    set('prospectos', prospectos)
    set('ruta', ruta)
    set('marcador', marcador)
    if (m.getLayer('zonas-fill')) {
      m.setPaintProperty('zonas-fill', 'fill-color', modoColor === 'categoria' ? ['coalesce', ['get', 'categoria_color'], COLOR_SIN_DATOS] : expresionColor(leyenda))
    }
    if (m.getLayer('calor')) m.setPaintProperty('calor', 'heatmap-weight', ['interpolate', ['linear'], ['get', 'peso'], 0, 0, Math.max(maxPeso, 1e-6), 1])
  }, [listo, zonas, calor, puntos, prospectos, ruta, marcador, leyenda, modoColor, maxPeso])

  useEffect(() => {
    const m = mapa.current
    if (!listo || !m) return
    const vis = (id, v) => m.getLayer(id) && m.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none')
    vis('zonas-fill', capas.zonas !== false)
    vis('zonas-line', capas.zonas !== false)
    vis('calor', Boolean(capas.calor))
    ;['puntos-cluster', 'puntos-cluster-n', 'puntos-uno'].forEach((id) => vis(id, Boolean(capas.puntos)))
    vis('prospectos', Boolean(capas.prospectos))
    if (m.getLayer('zonas-sel')) m.setFilter('zonas-sel', ['==', ['get', 'id'], seleccion ?? -1])
  }, [listo, capas, seleccion])

  // Encuadra una vez por cada valor de `encuadre`, en cuanto haya zonas (aunque lleguen después de cargar el mapa)
  const encuadrado = useRef(null)
  useEffect(() => {
    if (!listo || !mapa.current || !encuadre || encuadrado.current === encuadre) return
    const b = bbox(zonas)
    if (!b) return
    encuadrado.current = encuadre
    mapa.current.fitBounds(b, { padding: 40, maxZoom: 15, duration: 500 })
  }, [listo, encuadre, zonas])

  if (!webgl) return fallback || <p className="p-6 text-sm text-muted">Su navegador no admite WebGL; use la vista de tabla.</p>
  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      {/* Posición en línea: el CSS de MapLibre (.maplibregl-map { position: relative }) anularía la utilidad `absolute` */}
      <div ref={contenedor} role="region" aria-label={etiqueta} style={{ position: 'absolute', inset: 0, cursor: modoMarcar ? 'crosshair' : undefined }} />
      {sinBase && (
        <p className="glass-strong absolute bottom-3 left-3 z-10 rounded-xl px-3 py-1.5 text-xs font-medium text-ink-2">{typeof navigator !== 'undefined' && navigator.onLine === false ? 'Mapa base no disponible sin conexión' : 'Mapa base no disponible: se muestran solo las zonas y los puntos.'}</p>
      )}
    </div>
  )
})

function instalarCapas(m, d) {
  const conGlifos = Boolean(m.getStyle()?.glyphs)
  const fuente = (id, data, extra = {}) => !m.getSource(id) && m.addSource(id, { type: 'geojson', data: data || VACIO, ...extra })
  fuente('zonas', d.zonas, { promoteId: 'id' })
  fuente('calor', d.calor)
  fuente('puntos', d.puntos, { cluster: true, clusterRadius: 44, clusterMaxZoom: 16 })
  fuente('prospectos', d.prospectos)
  fuente('ruta', d.ruta)
  fuente('marcador', d.marcador)
  const capa = (def) => !m.getLayer(def.id) && m.addLayer(def)
  capa({
    id: 'zonas-fill',
    type: 'fill',
    source: 'zonas',
    paint: {
      'fill-color': d.modoColor === 'categoria' ? ['coalesce', ['get', 'categoria_color'], COLOR_SIN_DATOS] : expresionColor(d.leyenda),
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.62, 15, 0.42],
    },
  })
  capa({ id: 'zonas-line', type: 'line', source: 'zonas', paint: { 'line-color': '#ffffff', 'line-width': 1.4, 'line-opacity': 0.9 } })
  capa({ id: 'zonas-sel', type: 'line', source: 'zonas', filter: ['==', ['get', 'id'], d.seleccion ?? -1], paint: { 'line-color': '#0f5daa', 'line-width': 3.2 } })
  capa({
    id: 'calor',
    type: 'heatmap',
    source: 'calor',
    maxzoom: 16,
    layout: { visibility: d.capas?.calor ? 'visible' : 'none' },
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'peso'], 0, 0, Math.max(d.maxPeso || 1, 1e-6), 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.9, 15, 1.6],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 26, 13, 60, 16, 120],
      'heatmap-opacity': 0.78,
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(255,239,184,0)', 0.2, '#ffe184', 0.45, '#f8b54a', 0.7, '#e8710c', 1, '#b3261e'],
    },
  })
  capa({ id: 'ruta-linea', type: 'line', source: 'ruta', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#0f5daa', 'line-width': 3, 'line-dasharray': [2, 1.2] } })
  capa({ id: 'puntos-cluster', type: 'circle', source: 'puntos', minzoom: 12, filter: ['has', 'point_count'], layout: { visibility: d.capas?.puntos ? 'visible' : 'none' }, paint: { 'circle-color': '#1f70c4', 'circle-opacity': 0.88, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2, 'circle-radius': ['step', ['get', 'point_count'], 14, 20, 18, 60, 24] } })
  if (conGlifos) capa({ id: 'puntos-cluster-n', type: 'symbol', source: 'puntos', minzoom: 12, filter: ['has', 'point_count'], layout: { visibility: d.capas?.puntos ? 'visible' : 'none', 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['Noto Sans Bold'] }, paint: { 'text-color': '#fff' } })
  capa({ id: 'puntos-uno', type: 'circle', source: 'puntos', minzoom: 12, filter: ['!', ['has', 'point_count']], layout: { visibility: d.capas?.puntos ? 'visible' : 'none' }, paint: { 'circle-color': '#0f5daa', 'circle-radius': 5, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } })
  // Posibles socios diferenciados de los socios (RF-013.04): ámbar con borde oscuro
  capa({ id: 'prospectos', type: 'circle', source: 'prospectos', layout: { visibility: d.capas?.prospectos ? 'visible' : 'none' }, paint: { 'circle-color': '#f5b400', 'circle-radius': 8, 'circle-stroke-color': '#8a4f00', 'circle-stroke-width': 2.5 } })
  capa({ id: 'ruta-paradas', type: 'circle', source: 'ruta', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': '#f5b400', 'circle-radius': 13, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } })
  // Punto que el usuario está marcando (visible a cualquier zoom, sin agrupación)
  capa({ id: 'marcador', type: 'circle', source: 'marcador', paint: { 'circle-color': '#0f5daa', 'circle-radius': 10, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } })
  if (conGlifos) capa({ id: 'ruta-num', type: 'symbol', source: 'ruta', filter: ['==', ['geometry-type'], 'Point'], layout: { 'text-field': ['to-string', ['get', 'orden']], 'text-size': 12, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true }, paint: { 'text-color': '#082a52' } })
}
