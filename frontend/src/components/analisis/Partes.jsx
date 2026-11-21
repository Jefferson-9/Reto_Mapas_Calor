import { CircleHelp, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useId } from 'react'
import { Chip } from '../glass/Glass'

/** Chip de categoría: color + nombre (el estado nunca se comunica solo con color). */
export function ChipCategoria({ categoria, className = '' }) {
  if (!categoria) return <Chip className={className}>Sin clasificar</Chip>
  const color = categoria.color_hex || categoria.color
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-0.5 text-xs font-semibold text-ink ring-1 ring-ink/5 ${className}`}>
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className="truncate">{categoria.nombre}</span>
    </span>
  )
}

const TENDENCIAS = {
  aumento: { icono: TrendingUp, texto: 'Aumentó', tono: 'azul' },
  disminuyo: { icono: TrendingDown, texto: 'Disminuyó', tono: 'violeta' },
  se_mantuvo: { icono: Minus, texto: 'Se mantuvo', tono: 'neutro' },
}

/** Tendencia con ícono y texto (RF-010.03/04). Sin uno de los dos valores: «Falta información». */
export function Tendencia({ tendencia, falta }) {
  const t = !falta && TENDENCIAS[tendencia]
  if (!t) return <Chip tono="ambar" icono={CircleHelp}>Falta información</Chip>
  return (
    <Chip tono={t.tono} icono={t.icono}>
      {t.texto}
    </Chip>
  )
}

/** Campo de formulario accesible: etiqueta, ayuda y error asociados al control (aria-invalid / aria-describedby). */
export function Campo({ etiqueta, error, ayuda, children, className = '', oculta = false }) {
  const id = useId()
  const idErr = `${id}-err`
  const idAyuda = `${id}-ayuda`
  const describedby = [error && idErr, ayuda && idAyuda].filter(Boolean).join(' ') || undefined
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className={oculta ? 'sr-only' : 'text-sm font-semibold text-ink-2'}>
        {etiqueta}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedby })}
      {ayuda && (
        <span id={idAyuda} className="text-xs text-muted">
          {ayuda}
        </span>
      )}
      {error && (
        <span id={idErr} className="text-xs font-medium text-danger-ink">
          {error}
        </span>
      )}
    </div>
  )
}
