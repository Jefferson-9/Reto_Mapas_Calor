// Formato es-EC, USD y zona horaria America/Guayaquil. «Sin datos» nunca se muestra como 0.
const TZ = 'America/Guayaquil'
const usd = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' })
const usdEntero = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usdCompacto = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })
const entero = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 0 })
const dec2 = new Intl.NumberFormat('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fecha = new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeZone: TZ })
const fechaHora = new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ })
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export const SIN_DATOS = 'Sin datos'
const vacio = (v) => v === null || v === undefined || v === ''
const num = (v) => (typeof v === 'number' ? v : Number(v))

export const fmtUSD = (v) => (vacio(v) ? SIN_DATOS : usd.format(num(v)))
export const fmtUSDEntero = (v) => (vacio(v) ? SIN_DATOS : usdEntero.format(num(v)))
export const fmtUSDCompacto = (v) => (vacio(v) ? SIN_DATOS : usdCompacto.format(num(v)))
export const fmtEntero = (v) => (vacio(v) ? SIN_DATOS : entero.format(num(v)))
export const fmtDecimal = (v) => (vacio(v) ? SIN_DATOS : dec2.format(num(v)))
export const fmtPct = (v) => (vacio(v) ? SIN_DATOS : `${dec2.format(num(v))} %`)
export const fmtFecha = (v) => (vacio(v) ? '—' : fecha.format(new Date(v)))
export const fmtFechaHora = (v) => (vacio(v) ? '—' : fechaHora.format(new Date(v)))
export const periodoCorto = (p) => {
  if (!p) return '—'
  const [y, m] = p.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}
export const periodoLargo = (p) => {
  if (!p) return '—'
  const [y, m] = p.split('-').map(Number)
  return `${MESES_LARGO[m - 1]} de ${y}`
}

// Formateador por indicador (lista blanca del backend)
export const INDICADORES = {
  total_socios: { etiqueta: 'Socios', fmt: fmtEntero },
  total_creditos: { etiqueta: 'Créditos activos', fmt: fmtEntero },
  monto_cartera: { etiqueta: 'Monto de cartera', fmt: fmtUSD },
  creditos_atrasados: { etiqueta: 'Créditos con pagos atrasados', fmt: fmtEntero },
  saldo_vencido: { etiqueta: 'Saldo vencido', fmt: fmtUSD },
  tasa_morosidad: { etiqueta: 'Tasa de morosidad', fmt: fmtPct },
  penetracion_pct: { etiqueta: 'Penetración de socios', fmt: fmtPct },
}
export const fmtIndicador = (clave, v) => (INDICADORES[clave]?.fmt ?? fmtDecimal)(v)

export const iniciales = (nombre = '') =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

// Conversión centralizada: formularios usan latitud/longitud; GeoJSON y MapLibre usan [lng, lat]
export const aLngLat = (latitud, longitud) => [Number(longitud), Number(latitud)]
export const desdeLngLat = ([lng, lat], decimales = 6) => ({ latitud: lat.toFixed(decimales), longitud: lng.toFixed(decimales) })
