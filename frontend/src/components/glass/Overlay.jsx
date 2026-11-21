import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from '../../hooks/useApi'
import { spring } from '../../utils/motion'

const FOCUSABLES = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function useFocoAtrapado(abierto, contenedor, alCerrar) {
  // Evento estable: un `alCerrar` en línea del padre no reinicia la trampa de foco
  const cerrar = useEffectEvent(() => alCerrar?.())
  useEffect(() => {
    if (!abierto) return undefined
    const previo = document.activeElement
    const el = contenedor.current
    const t = setTimeout(() => (el?.querySelector('[data-autofocus]') || el?.querySelector(FOCUSABLES))?.focus(), 30)
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        cerrar()
      }
      if (e.key !== 'Tab' || !el) return
      const f = [...el.querySelectorAll(FOCUSABLES)]
      if (!f.length) return
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault()
        f[f.length - 1].focus()
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault()
        f[0].focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      previo?.focus?.()
    }
  }, [abierto, contenedor])
}

/** Modal de cristal: centrado en escritorio, hoja inferior en móvil. Foco atrapado y cierre accesible. */
export function GlassModal({ abierto, alCerrar, titulo, descripcion, children, pie, ancho = 'max-w-lg' }) {
  const ref = useRef(null)
  const id = useId()
  const movil = useMediaQuery('(max-width: 767px)')
  const reducido = useReducedMotion()
  useFocoAtrapado(abierto, ref, alCerrar)
  const anim = movil
    ? { initial: { y: reducido ? 0 : '100%', opacity: reducido ? 0 : 1 }, animate: { y: 0, opacity: 1, transition: spring }, exit: { y: reducido ? 0 : '100%', opacity: reducido ? 0 : 1, transition: { duration: 0.2 } } }
    : { initial: { opacity: 0, scale: 0.97, y: 8 }, animate: { opacity: 1, scale: 1, y: 0, transition: spring }, exit: { opacity: 0, scale: 0.98, transition: { duration: 0.14 } } }
  return createPortal(
    <AnimatePresence>
      {abierto && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center md:p-6">
          <motion.div className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={alCerrar} aria-hidden />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-t`}
            aria-describedby={descripcion ? `${id}-d` : undefined}
            className={`glass-strong relative flex max-h-[92dvh] w-full ${ancho} flex-col overflow-hidden rounded-t-panel md:rounded-panel`}
            style={{ paddingBottom: movil ? 'var(--safe-bottom)' : undefined }}
            {...anim}
          >
            <div className="flex items-start gap-3 px-5 pt-5 pb-3 md:px-6">
              <div className="min-w-0 flex-1">
                <h2 id={`${id}-t`} className="text-lg font-bold">{titulo}</h2>
                {descripcion && <p id={`${id}-d`} className="mt-1 text-sm text-muted">{descripcion}</p>}
              </div>
              <button type="button" onClick={alCerrar} className="press -mr-1 grid size-11 place-items-center rounded-full text-muted hover:bg-white/70" aria-label="Cerrar">
                <X className="size-5" />
              </button>
            </div>
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5 md:px-6">{children}</div>
            {pie && <div className="flex flex-wrap justify-end gap-2 border-t border-white/70 bg-white/35 px-5 py-4 md:px-6">{pie}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** Popover de cristal anclado a su disparador (transform-origin desde el disparador). */
export function GlassPopover({ abierto, alCerrar, ancla, children, ancho = 260, alinear = 'inicio', etiqueta }) {
  const ref = useRef(null)
  useFocoAtrapado(abierto, ref, alCerrar)
  // Se posiciona de forma imperativa respecto de su disparador (origen de la animación = disparador)
  useLayoutEffect(() => {
    const el = ref.current
    if (!abierto || !el || !ancla?.current) return
    const r = ancla.current.getBoundingClientRect()
    const w = Math.min(ancho, window.innerWidth - 16)
    let left = alinear === 'fin' ? r.right - w : r.left
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    Object.assign(el.style, { top: `${r.bottom + 8}px`, left: `${left}px`, width: `${w}px`, transformOrigin: `${r.left + r.width / 2 - left}px 0px`, visibility: 'visible' })
  }, [abierto, ancla, ancho, alinear])
  useEffect(() => {
    if (!abierto) return undefined
    const cerrarFuera = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !ancla?.current?.contains(e.target)) alCerrar()
    }
    document.addEventListener('pointerdown', cerrarFuera)
    return () => document.removeEventListener('pointerdown', cerrarFuera)
  }, [abierto, alCerrar, ancla])
  return createPortal(
    <AnimatePresence>
      {abierto && (
        <motion.div
          ref={ref}
          role="dialog"
          aria-label={etiqueta}
          className="glass-strong fixed z-[65] max-h-[70dvh] overflow-y-auto rounded-card p-2 thin-scroll"
          style={{ visibility: 'hidden', top: 0, left: 0, width: ancho }}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0, transition: spring }}
          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** Tooltip accesible: se abre con hover, foco o toque. */
export function GlassTooltip({ texto, children, lado = 'arriba' }) {
  const [v, setV] = useState(false)
  const id = useId()
  return (
    <span className="relative inline-flex" onPointerEnter={() => setV(true)} onPointerLeave={() => setV(false)} onFocus={() => setV(true)} onBlur={() => setV(false)}>
      <span aria-describedby={id} onClick={() => setV((x) => !x)}>
        {children}
      </span>
      {/* Solo se monta visible: un tooltip oculto no debe ensanchar la página (scroll horizontal) */}
      {v && (
        <span
          id={id}
          role="tooltip"
          className={`glass-strong pointer-events-none absolute left-1/2 z-50 w-max max-w-[min(16rem,80vw)] -translate-x-1/2 rounded-xl px-3 py-2 text-xs font-medium text-ink ${lado === 'arriba' ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
          {texto}
        </span>
      )}
    </span>
  )
}
