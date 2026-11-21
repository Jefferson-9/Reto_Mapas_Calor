import { ChevronDown, TriangleAlert } from 'lucide-react'
import { Chip } from '../glass/Glass'

const cx = (...c) => c.filter(Boolean).join(' ')
const CONTROL =
  'glass-control w-full rounded-control px-3 text-base text-ink outline-none placeholder:text-muted/80 focus-visible:ring-2 focus-visible:ring-brand-400 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger/60 disabled:opacity-60'

/** Campo de formulario accesible: etiqueta, control, ayuda y error junto al control (aria-describedby). */
export function Campo({ id, etiqueta, error, ayuda, opcional = false, children, className = '' }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink-2">
        {etiqueta}
        {opcional && <span className="ml-1 font-normal text-muted">(opcional)</span>}
      </label>
      {children}
      {ayuda && !error && (
        <p id={`${id}-ayuda`} className="text-xs text-muted">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-1 text-xs font-medium text-danger-ink">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}

/** Atributos ARIA del control según su estado de error/ayuda. */
function aria(id, error, ayuda) {
  return { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined }
}

export function Entrada({ id, error, ayuda, className = '', ...rest }) {
  return <input {...aria(id, error, ayuda)} className={cx(CONTROL, 'h-12', className)} {...rest} />
}

export function AreaTexto({ id, error, ayuda, className = '', rows = 3, ...rest }) {
  return <textarea {...aria(id, error, ayuda)} rows={rows} className={cx(CONTROL, 'min-h-24 resize-y py-2.5', className)} {...rest} />
}

export function Selector({ id, error, ayuda, className = '', children, ...rest }) {
  return (
    <span className="relative block">
      <select {...aria(id, error, ayuda)} className={cx(CONTROL, 'h-12 appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </span>
  )
}

/** Chip de categoría: color + nombre (nunca solo color). */
export function CategoriaChip({ categoria, className = '' }) {
  if (!categoria) return <Chip className={className}>Sin clasificar</Chip>
  const color = categoria.color_hex || categoria.color
  return (
    <span className={cx('inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-ink/5', className)} style={{ color }}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className="truncate">{categoria.nombre}</span>
    </span>
  )
}

/** Error general de formulario (cuando el servidor no lo asocia a un campo). */
export function AvisoFormulario({ error, children }) {
  if (!error && !children) return null
  return (
    <div role="alert" className="flex items-start gap-2 rounded-card bg-[#fbe9e5] px-4 py-3 text-sm font-medium text-danger-ink">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {error?.message && <p>{error.message}</p>}
        {children}
      </div>
    </div>
  )
}

/** Casilla de verificación con área táctil de 44 px. */
export function Casilla({ checked, onChange, etiqueta, disabled = false, className = '' }) {
  return (
    <label className={cx('press grid size-11 shrink-0 cursor-pointer place-items-center rounded-full hover:bg-white/60', disabled && 'cursor-not-allowed opacity-50', className)}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="size-5 cursor-pointer accent-brand-600" aria-label={etiqueta} />
    </label>
  )
}
