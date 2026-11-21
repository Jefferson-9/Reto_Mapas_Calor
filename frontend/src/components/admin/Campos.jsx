import { Lock } from 'lucide-react'
import { claseControl } from './formulario'

/** Campo de formulario: etiqueta asociada, control, ayuda y error junto al campo (ids `${id}-ayuda` / `${id}-err`). */
export function Campo({ id, etiqueta, error, ayuda, opcional = false, children, className = '' }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-semibold text-ink-2">
        {etiqueta}
        {opcional && <span className="font-normal text-muted"> (opcional)</span>}
      </label>
      {children}
      {ayuda && (
        <p id={`${id}-ayuda`} className="text-xs text-muted">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-xs font-medium text-danger-ink">
          {error}
        </p>
      )}
    </div>
  )
}

/** Interruptor accesible (role="switch") con el estado escrito, no solo por color. */
export function Interruptor({ id, activo, alCambiar, etiqueta, descripcion, deshabilitado = false, cargando = false, bloqueado = false, insignia }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p id={`${id}-l`} className="flex flex-wrap items-center gap-2 font-semibold text-ink">
          {etiqueta}
          {insignia}
        </p>
        {descripcion && (
          <p id={`${id}-d`} className="mt-1 text-sm text-muted">
            {descripcion}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={activo}
        aria-labelledby={`${id}-l`}
        aria-describedby={descripcion ? `${id}-d` : undefined}
        aria-busy={cargando || undefined}
        disabled={deshabilitado || cargando || bloqueado}
        onClick={() => alCambiar?.(!activo)}
        className="press flex min-h-11 shrink-0 items-center gap-3 self-start rounded-full py-1 pr-1 pl-3 hover:bg-white/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`flex items-center gap-1 text-sm font-semibold ${activo ? 'text-brand-700' : 'text-muted'}`}>
          {bloqueado && <Lock className="size-3.5" aria-hidden />}
          {bloqueado ? 'Bloqueado' : activo ? 'Activado' : 'Desactivado'}
        </span>
        <span aria-hidden className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${activo ? 'bg-brand-500' : 'bg-ink/15'}`}>
          <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow-[0_2px_6px_rgb(16_34_61/0.3)] transition-transform duration-200 ${activo ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
        </span>
      </button>
    </div>
  )
}

/** Casilla de verificación con área táctil ≥ 44 px. Acepta las props de `register` (ref incluida). */
export function Casilla({ id, etiqueta, descripcion, className = '', ...rest }) {
  return (
    <label htmlFor={id} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl px-1 py-2 ${className}`}>
      <input type="checkbox" id={id} className="mt-0.5 size-5 shrink-0 cursor-pointer accent-brand-600 disabled:cursor-not-allowed" aria-describedby={descripcion ? `${id}-d` : undefined} {...rest} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{etiqueta}</span>
        {descripcion && (
          <span id={`${id}-d`} className="block text-xs text-muted">
            {descripcion}
          </span>
        )}
      </span>
    </label>
  )
}

/** Filtro de lista con etiqueta visible (select nativo, accesible y cómodo en móvil). */
export function FiltroSelect({ id, etiqueta, valor, alCambiar, opciones, todos = 'Todos', className = '' }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="px-1 text-xs font-semibold text-muted">
        {etiqueta}
      </label>
      <select id={id} value={valor ?? ''} onChange={(e) => alCambiar(e.target.value || null)} className={claseControl(false, 'pr-8')}>
        {todos !== null && <option value="">{todos}</option>}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Filtro de texto o fecha con etiqueta visible. */
export function FiltroTexto({ id, etiqueta, valor, alCambiar, type = 'text', placeholder, className = '', ...rest }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="px-1 text-xs font-semibold text-muted">
        {etiqueta}
      </label>
      <input id={id} type={type} value={valor} placeholder={placeholder} onChange={(e) => alCambiar(e.target.value)} className={claseControl(false)} {...rest} />
    </div>
  )
}
