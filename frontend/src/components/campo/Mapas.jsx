import { AnimatePresence, motion } from 'motion/react'
import { useMediaQuery } from '../../hooks/useApi'
import { spring } from '../../utils/motion'

/** Detalle flotante sobre el mapa: hoja inferior en móvil, panel lateral en escritorio. */
export function HojaMapa({ abierta, children, etiqueta, clave = 'detalle' }) {
  const movil = useMediaQuery('(max-width: 767px)')
  return (
    <AnimatePresence>
      {abierta && (
        <motion.aside
          key={clave}
          aria-label={etiqueta}
          className="glass-strong thin-scroll absolute inset-x-2 bottom-2 z-20 max-h-[62%] overflow-y-auto rounded-panel p-4 md:inset-x-auto md:top-3 md:right-3 md:bottom-auto md:max-h-[calc(100%-24px)] md:w-[360px]"
          initial={{ opacity: 0, y: movil ? 40 : 0, x: movil ? 0 : 24 }}
          animate={{ opacity: 1, y: 0, x: 0, transition: spring }}
          exit={{ opacity: 0, y: movil ? 40 : 0, x: movil ? 0 : 24, transition: { duration: 0.16 } }}
        >
          {children}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

/** Aviso flotante sobre el mapa (cristal). */
export function AvisoMapa({ children, className = '' }) {
  return <p className={`glass-strong absolute z-10 rounded-xl px-3 py-1.5 text-xs font-medium text-ink-2 ${className}`}>{children}</p>
}
