// Utilidades de presentación compartidas por las pantallas de análisis (indicadores, comparación, clasificación, criterios).
import { OPERADORES_CRITERIO, VARIABLES_CRITERIO } from '../../features/clasificacion/api'
import { INDICADORES, fmtIndicador } from '../../utils/format'

const dec2 = new Intl.NumberFormat('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const usd = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' })
const entero = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 0 })

export const CLASE_CONTROL =
  'glass-control h-11 w-full min-w-0 rounded-control px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-400 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger/60 disabled:opacity-55'

export const etiquetaVariable = (v) => VARIABLES_CRITERIO.find((x) => x.valor === v)?.etiqueta || INDICADORES[v]?.etiqueta || v
export const operador = (op) => OPERADORES_CRITERIO.find((o) => o.valor === op)

export const fmtUmbral = (variable, op, umbral) =>
  op === 'entre' && Array.isArray(umbral) ? `${fmtIndicador(variable, umbral[0])} y ${fmtIndicador(variable, umbral[1])}` : fmtIndicador(variable, umbral)

export const textoRegla = (r) => `${etiquetaVariable(r.variable)} ${operador(r.operador)?.etiqueta || r.operador} ${fmtUmbral(r.variable, r.operador, r.umbral)}`

/** Diferencia con signo y en la unidad del indicador; las razones se expresan en puntos porcentuales. */
export function fmtDiferencia(indicador, v) {
  if (v === null || v === undefined || v === '') return 'Falta información'
  const n = Number(v)
  const signo = n > 0 ? '+' : n < 0 ? '−' : ''
  const a = Math.abs(n)
  if (indicador === 'tasa_morosidad' || indicador === 'penetracion_pct') return `${signo}${dec2.format(a)} pts`
  if (indicador === 'monto_cartera' || indicador === 'saldo_vencido') return `${signo}${usd.format(a)}`
  return `${signo}${Number.isInteger(a) ? entero.format(a) : dec2.format(a)}`
}

const sinTildes = (s = '') => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
export const coincide = (texto, consulta) => sinTildes(texto).includes(sinTildes(consulta.trim()))

export const TIPOS_ZONA = { provincia: 'Provincia', canton: 'Cantón', parroquia: 'Parroquia', barrio: 'Barrio o sector' }
