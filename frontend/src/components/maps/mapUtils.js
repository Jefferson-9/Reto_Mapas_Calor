// Utilidades puras del mapa (sin componentes) para que el refresco rápido funcione
export const ESTILO_MAPA = import.meta.env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/positron'
export const VACIO = { type: 'FeatureCollection', features: [] }
export const COLOR_SIN_DATOS = '#c9c2b4'
export const CENTRO_LOJA = [-79.22, -3.99]
export const ESTILO_NEUTRO = {
  version: 8,
  sources: {},
  layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#ece6d8' } }],
}

export function soportaWebGL() {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

// Expresión `step` con los mismos cortes que la leyenda (RF-008.02)
export function expresionColor(leyenda, propiedad = 'valor') {
  if (!leyenda?.length) return COLOR_SIN_DATOS
  const exp = ['step', ['to-number', ['get', propiedad]], leyenda[0].color]
  leyenda.slice(1).forEach((r) => exp.push(r.desde, r.color))
  return ['case', ['==', ['get', 'sin_datos'], true], COLOR_SIN_DATOS, exp]
}

export function bbox(fc) {
  let b = null
  const recorrer = (c) => {
    if (typeof c[0] === 'number') {
      b = b ? [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])] : [c[0], c[1], c[0], c[1]]
    } else c.forEach(recorrer)
  }
  fc?.features?.forEach((f) => f.geometry && recorrer(f.geometry.coordinates))
  return b
}

