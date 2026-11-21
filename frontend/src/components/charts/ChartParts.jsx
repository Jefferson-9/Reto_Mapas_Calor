import { motion, useReducedMotion } from 'motion/react'
import { GlassPanel } from '../glass/Glass'

/** Tooltip de cristal para Recharts. */
export function ChartTooltip({ active, payload, label, formatos = {}, etiquetaX }) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-strong rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink">{etiquetaX ? etiquetaX(label) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-ink-2">
          <span className="size-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
          <span>{p.name}:</span>
          <span className="tnum font-semibold text-ink">{(formatos[p.dataKey] || ((v) => v))(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

export function ChartLegend({ items }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-2">
      {items.map((i) => (
        <li key={i.etiqueta} className="flex items-center gap-2">
          <span className={i.linea ? 'h-1 w-4 rounded-full' : 'size-3 rounded-[4px]'} style={{ background: i.color }} aria-hidden />
          {i.etiqueta}
        </li>
      ))}
    </ul>
  )
}

/** Panel de gráfica: título, subtítulo, controles a la derecha y área de gráfica que se redimensiona con el contenedor. */
export function ChartCard({ titulo, subtitulo, controles, children, className = '', pie }) {
  return (
    <GlassPanel className={`flex flex-col p-5 md:p-6 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">{titulo}</h2>
          {subtitulo && <p className="mt-0.5 text-sm text-muted">{subtitulo}</p>}
        </div>
        {controles}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      {pie}
    </GlassPanel>
  )
}

/** Barra de progreso animada (crece desde su base). */
export function BarraProgreso({ valor, max = 100, color = 'linear-gradient(90deg,#f8c46a,#d89a00)', etiqueta }) {
  const reducido = useReducedMotion()
  const pct = valor == null ? 0 : Math.max(0, Math.min(100, (Number(valor) / max) * 100))
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/70" role="progressbar" aria-label={etiqueta} aria-valuenow={valor ?? undefined} aria-valuemin={0} aria-valuemax={max}>
      <motion.div className="h-full origin-left rounded-full" style={{ background: color, width: `${pct}%` }} initial={reducido ? false : { scaleX: 0 }} animate={{ scaleX: 1, transition: { type: 'spring', duration: 0.8, bounce: 0 } }} />
    </div>
  )
}
