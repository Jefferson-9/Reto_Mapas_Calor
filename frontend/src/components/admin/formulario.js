// Utilidades puras de formularios administrativos (sin componentes, para el refresco rápido)

/** Clase de un control de formulario de cristal (≥ 44 px de alto y 16 px de texto para evitar el zoom de iOS). */
export const claseControl = (error, extra = '') =>
  `glass-control min-h-12 w-full rounded-control px-3 text-base text-ink outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-60 ${error ? 'ring-2 ring-danger/55' : ''} ${extra}`

/** Atributos accesibles de un campo: id, aria-invalid y aria-describedby con su error y su ayuda. */
export const ariaCampo = (id, error, ayuda) => {
  const desc = [error ? `${id}-err` : null, ayuda ? `${id}-ayuda` : null].filter(Boolean).join(' ')
  return { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': desc || undefined }
}

/**
 * Lleva los errores por campo de un ApiError (details[{campo, mensaje}]) al formulario de react-hook-form.
 * Devuelve los mensajes que no corresponden a ningún campo conocido para mostrarlos junto al formulario.
 */
export function aplicarErroresServidor(error, setError, campos = [], alias = {}) {
  const sueltos = []
  let enfocado = false
  for (const d of error?.details || []) {
    const campo = alias[d.campo] || d.campo
    if (campo && campos.includes(campo)) {
      setError(campo, { type: 'server', message: d.mensaje }, { shouldFocus: !enfocado })
      enfocado = true
    } else if (d.mensaje) sueltos.push(d.campo && !alias[d.campo] ? `${d.campo}: ${d.mensaje}` : d.mensaje)
  }
  return sueltos
}

/** Período AAAA-MM del mes actual en la zona horaria de Ecuador. */
export const periodoActual = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit' }).format(new Date())
  return p.slice(0, 7)
}

export const RE_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/

/** Etiqueta legible de una acción técnica del historial (carga_confirmada → Carga confirmada). */
export const humanizar = (s = '') => {
  const t = String(s).replaceAll('_', ' ').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : '—'
}

export const tamanoLegible = (bytes) => {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('es-EC', { maximumFractionDigits: 1 })} KB`
  return `${(bytes / 1024 / 1024).toLocaleString('es-EC', { maximumFractionDigits: 1 })} MB`
}
