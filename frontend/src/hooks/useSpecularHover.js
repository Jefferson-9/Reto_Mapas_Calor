import { useCallback } from 'react'

const prefiereMenosMovimiento = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Instala el brillo especular en un nodo; devuelve la función de limpieza. */
export function instalarBrillo(el, suavizado = 0.18) {
  const s = { x: 0, y: 0, tx: 0, ty: 0, raf: 0, activo: false }
  const reducido = prefiereMenosMovimiento()

  const paso = () => {
    s.x += (s.tx - s.x) * suavizado
    s.y += (s.ty - s.y) * suavizado
    el.style.setProperty('--mx', `${s.x.toFixed(1)}px`)
    el.style.setProperty('--my', `${s.y.toFixed(1)}px`)
    s.raf = s.activo || Math.abs(s.tx - s.x) > 0.4 || Math.abs(s.ty - s.y) > 0.4 ? requestAnimationFrame(paso) : 0
  }
  const objetivo = (e) => {
    const r = el.getBoundingClientRect()
    s.tx = reducido ? r.width / 2 : e.clientX - r.left
    s.ty = reducido ? r.height / 2 : e.clientY - r.top
  }
  const encender = (e) => {
    objetivo(e)
    if (!s.activo) {
      // nace donde está el puntero, sin saltos; luego lo persigue con suavizado
      s.x = s.tx
      s.y = s.ty
    }
    s.activo = true
    el.dataset.spec = 'on'
    el.style.willChange = 'opacity'
    if (!s.raf) s.raf = requestAnimationFrame(paso)
  }
  const apagar = () => {
    s.activo = false
    delete el.dataset.spec
    el.style.willChange = ''
  }
  const enter = (e) => e.pointerType !== 'touch' && encender(e)
  const move = (e) => s.activo && objetivo(e)
  const down = (e) => e.pointerType === 'touch' && encender(e)
  const up = (e) => e.pointerType === 'touch' && apagar()
  const leave = (e) => e.pointerType !== 'touch' && apagar()
  const opts = { passive: true } // nunca bloquea el scroll táctil
  el.addEventListener('pointerenter', enter, opts)
  el.addEventListener('pointermove', move, opts)
  el.addEventListener('pointerdown', down, opts)
  el.addEventListener('pointerup', up, opts)
  el.addEventListener('pointercancel', up, opts)
  el.addEventListener('pointerleave', leave, opts)
  return () => {
    el.removeEventListener('pointerenter', enter)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
    el.removeEventListener('pointerleave', leave)
    cancelAnimationFrame(s.raf)
  }
}

/**
 * Brillo especular tipo vidrio líquido (sección 10.4) como ref callback.
 * Mouse/lápiz: aparece al entrar y sigue al cursor. Táctil: aparece donde toca y sigue al dedo.
 * Actualiza --mx/--my en requestAnimationFrame, sin re-renders. Con movimiento reducido queda estático.
 */
export function useSpecularHover({ suavizado = 0.18 } = {}) {
  return useCallback(
    (el) => {
      if (!el) return undefined
      return instalarBrillo(el, suavizado) // React 19: la función devuelta limpia al desmontar
    },
    [suavizado],
  )
}
