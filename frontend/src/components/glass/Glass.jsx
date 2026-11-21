import { motion, useReducedMotion } from 'motion/react'
import { forwardRef } from 'react'
import { useSpecularHover } from '../../hooks/useSpecularHover'
import { piezaEnsamblado } from '../../utils/motion'

const cx = (...c) => c.filter(Boolean).join(' ')

/** Panel principal de cristal (radio de panel). `pieza` lo integra en la coreografía de ensamblado. */
export function GlassPanel({ as = 'section', className = '', children, pieza = true, specular = false, ...rest }) {
  const reducido = useReducedMotion()
  const ref = useSpecularHover()
  const Comp = pieza ? motion[as] : as
  const props = pieza ? { variants: piezaEnsamblado(reducido) } : {}
  return (
    <Comp ref={specular ? ref : undefined} className={cx('glass rounded-panel', specular && 'specular', className)} {...props} {...rest}>
      {children}
    </Comp>
  )
}

/** Tarjeta de cristal (KPI, gráficas, ítems de lista) con brillo especular. */
export function GlassCard({ as = 'div', className = '', children, pieza = true, specular = true, ...rest }) {
  const reducido = useReducedMotion()
  const ref = useSpecularHover()
  const Comp = pieza ? motion[as] : as
  const props = pieza ? { variants: piezaEnsamblado(reducido) } : {}
  return (
    <Comp ref={specular ? ref : undefined} className={cx('glass rounded-card', specular && 'specular', className)} {...props} {...rest}>
      {children}
    </Comp>
  )
}

const VARIANTES = {
  primario: 'bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[0_10px_24px_-12px_rgb(15_93_170/0.8),inset_0_1px_0_rgb(255_255_255/0.3)] hover:from-brand-500 hover:to-brand-700',
  acento: 'bg-gradient-to-b from-sun-300 to-sun-500 text-brand-900 shadow-[0_10px_24px_-12px_rgb(168_118_0/0.75),inset_0_1px_0_rgb(255_255_255/0.6)]',
  cristal: 'glass-control text-ink hover:bg-white/90',
  fantasma: 'text-ink-2 hover:bg-white/60',
  peligro: 'bg-gradient-to-b from-[#d9472f] to-danger text-white shadow-[0_10px_24px_-12px_rgb(200_52_28/0.7)]',
}
const TAMANOS = { sm: 'h-9 px-3 text-sm gap-1.5', md: 'h-11 px-4 text-sm gap-2', lg: 'h-12 px-5 text-[15px] gap-2' }

/** Botón con estados pressed (pointerdown), loading, disabled y brillo especular. */
export const GlassButton = forwardRef(function GlassButton(
  { variante = 'cristal', tam = 'md', icono: Icono, cargando = false, className = '', children, disabled, type = 'button', redondo = false, ...rest },
  refExt,
) {
  const spec = useSpecularHover()
  const setRef = (el) => {
    if (typeof refExt === 'function') refExt(el)
    else if (refExt) refExt.current = el
    return spec(el)
  }
  return (
    <button
      ref={setRef}
      type={type}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={cx(
        'press specular relative inline-flex min-h-11 shrink-0 select-none items-center justify-center whitespace-nowrap font-semibold',
        redondo ? 'rounded-full' : 'rounded-control',
        VARIANTES[variante],
        TAMANOS[tam],
        'disabled:cursor-not-allowed disabled:opacity-55',
        className,
      )}
      {...rest}
    >
      {cargando ? <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden /> : Icono && <Icono className="size-4" aria-hidden />}
      {children && <span>{children}</span>}
    </button>
  )
})

/** Botón redondo solo con ícono (44×44 mínimo). */
export function IconButton({ icono: Icono, etiqueta, className = '', ...rest }) {
  const spec = useSpecularHover()
  return (
    <button ref={spec} type="button" aria-label={etiqueta} title={etiqueta} className={cx('press specular glass-control grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:text-ink', className)} {...rest}>
      <Icono className="size-[18px]" aria-hidden />
    </button>
  )
}

const TONOS = {
  neutro: 'bg-white/70 text-ink-2 ring-1 ring-ink/5',
  azul: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200/60',
  verde: 'bg-[#e6f5ee] text-ok-ink ring-1 ring-ok/20',
  ambar: 'bg-sun-100 text-sun-700 ring-1 ring-sun-400/40',
  rojo: 'bg-[#fbe9e5] text-danger-ink ring-1 ring-danger/20',
  violeta: 'bg-[#efeafb] text-[#5b3fa6] ring-1 ring-[#5b3fa6]/15',
}
export function Chip({ tono = 'neutro', icono: Icono, children, className = '', title }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', TONOS[tono], className)}>
      {Icono && <Icono className="size-3.5" aria-hidden />}
      {children}
    </span>
  )
}

export function Skeleton({ className = '' }) {
  return <span aria-hidden className={cx('block animate-pulse rounded-xl bg-white/55 [animation-duration:1.6s] motion-reduce:animate-none', className)} />
}
