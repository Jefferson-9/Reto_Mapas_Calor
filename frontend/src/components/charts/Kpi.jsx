import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { Area, AreaChart } from 'recharts'
import { SIN_DATOS } from '../../utils/format'
import { Chip, GlassCard, Skeleton } from '../glass/Glass'

/** Valor que interpola hasta el definitivo sin retrasar su lectura (el valor final queda en aria-label). */
export function AnimatedKPI({ valor, formato, className = '' }) {
  const ref = useRef(null)
  const previo = useRef(null)
  const reducido = useReducedMotion()
  const numero = valor === null || valor === undefined ? null : Number(valor)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (numero === null || Number.isNaN(numero)) {
      el.textContent = SIN_DATOS
      previo.current = null
      return undefined
    }
    const desde = previo.current ?? 0
    previo.current = numero
    if (reducido || desde === numero) {
      el.textContent = formato(numero)
      return undefined
    }
    const ctrl = animate(desde, numero, { duration: 0.7, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => (el.textContent = formato(v)) })
    return () => ctrl.stop()
  }, [numero, formato, reducido])
  return (
    <span ref={ref} aria-label={numero === null ? SIN_DATOS : formato(numero)} className={`tnum ${className}`}>
      {numero === null ? SIN_DATOS : formato(numero)}
    </span>
  )
}

export function Sparkline({ datos, clave, color = '#1f70c4' }) {
  const reducido = useReducedMotion()
  const id = `sp-${clave}`
  if (!datos?.length) return null
  return (
    <div className="h-12 w-20 shrink-0" aria-hidden>
      <AreaChart width={80} height={48} data={datos} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey={clave} stroke={color} strokeWidth={2.2} fill={`url(#${id})`} isAnimationActive={!reducido} animationDuration={900} connectNulls={false} dot={false} />
      </AreaChart>
    </div>
  )
}

/** Tarjeta KPI de la captura: etiqueta, chip de estado, valor grande, mini-gráfica y pie con dato secundario. */
export function KpiCard({ etiqueta, valor, formato, chip, serie, claveSerie, color, pie, pieValor, cargando }) {
  return (
    <GlassCard className="flex min-h-[168px] flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-ink-2">{etiqueta}</p>
        {chip && <Chip tono={chip.tono}>{chip.texto}</Chip>}
      </div>
      <div className="mt-2 flex min-w-0 items-end justify-between gap-3">
        {cargando ? <Skeleton className="h-10 w-36" /> : <AnimatedKPI valor={valor} formato={formato} className={`display min-w-0 truncate text-[clamp(1.5rem,1.95vw,2.125rem)] font-bold ${valor === null || valor === undefined ? 'text-muted text-2xl' : 'text-ink'}`} />}
        {!cargando && <Sparkline datos={serie} clave={claveSerie} color={color} />}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/80 pt-3 text-xs">
        <span className="text-muted">{pie}</span>
        <span className="tnum font-semibold text-ink-2">{pieValor}</span>
      </div>
    </GlassCard>
  )
}
