import { motion, useReducedMotion } from 'motion/react'
import { contenedorEnsamblado, piezaEnsamblado, stagger } from '../../utils/motion'

/**
 * Coreografía de ensamblado (sección 11.5): una sola fuente por pantalla.
 * Los hijos con `variants` de pieza (GlassPanel, GlassCard, Pieza) entran en orden: encabezado → KPI → principal → lateral → inferiores.
 */
export function Ensamblado({ children, className = '', escalon = stagger.panel, as = 'div' }) {
  const reducido = useReducedMotion()
  const Comp = motion[as]
  return (
    <Comp className={className} variants={contenedorEnsamblado(reducido ? 0.02 : escalon)} initial="oculto" animate="visible">
      {children}
    </Comp>
  )
}

/** Grupo interno escalonado (fila de KPI, ítems de lista en cascada). */
export function Grupo({ children, className = '', escalon = stagger.kpi, as = 'div' }) {
  const reducido = useReducedMotion()
  const Comp = motion[as]
  return (
    <Comp className={className} variants={contenedorEnsamblado(reducido ? 0.01 : escalon, 0)}>
      {children}
    </Comp>
  )
}

export function Pieza({ children, className = '', as = 'div', ...rest }) {
  const reducido = useReducedMotion()
  const Comp = motion[as]
  return (
    <Comp className={className} variants={piezaEnsamblado(reducido)} {...rest}>
      {children}
    </Comp>
  )
}

/** Panel que se arma al entrar en pantalla (pantallas largas), una sola vez. */
export function AlEntrar({ children, className = '' }) {
  const reducido = useReducedMotion()
  return (
    <motion.div className={className} variants={piezaEnsamblado(reducido)} initial="oculto" whileInView="visible" viewport={{ once: true, margin: '-40px' }}>
      {children}
    </motion.div>
  )
}

export function EncabezadoPagina({ titulo, subtitulo, extra, insignias }) {
  return (
    <Pieza className="flex flex-wrap items-end justify-between gap-3 px-1">
      <div className="min-w-0">
        <h1 className="display text-2xl font-bold text-ink md:text-[28px]">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-muted">{subtitulo}</p>}
        {insignias && <div className="mt-2 flex flex-wrap gap-2">{insignias}</div>}
      </div>
      {extra && <div className="flex flex-wrap items-center gap-2">{extra}</div>}
    </Pieza>
  )
}
