import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { spring } from '../utils/motion'

const ToastContext = createContext(null)
const ICONOS = { exito: CheckCircle2, error: XCircle, aviso: TriangleAlert, info: Info }
const COLOR = { exito: 'text-ok-ink', error: 'text-danger-ink', aviso: 'text-warn-ink', info: 'text-brand-700' }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const cerrar = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const mostrar = useCallback(
    (mensaje, tipo = 'info', ms = 4500) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((t) => [...t.slice(-3), { id, mensaje, tipo }])
      setTimeout(() => cerrar(id), ms)
    },
    [cerrar],
  )
  const valor = useMemo(
    () => ({ exito: (m) => mostrar(m, 'exito'), error: (m) => mostrar(m, 'error', 6500), aviso: (m) => mostrar(m, 'aviso'), info: (m) => mostrar(m, 'info') }),
    [mostrar],
  )
  return (
    <ToastContext.Provider value={valor}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-[calc(88px+var(--safe-bottom))] z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icono = ICONOS[t.tipo]
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: spring }}
                exit={{ opacity: 0, y: 8, transition: { duration: 0.14 } }}
                className="glass-strong pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card px-4 py-3 text-sm"
              >
                <Icono className={`mt-0.5 size-5 shrink-0 ${COLOR[t.tipo]}`} aria-hidden />
                <p className="flex-1 font-medium text-ink">{t.mensaje}</p>
                <button type="button" onClick={() => cerrar(t.id)} className="press -m-2 grid size-9 place-items-center rounded-full text-muted hover:bg-white/60" aria-label="Cerrar aviso">
                  <X className="size-4" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- el hook acompaña a su proveedor
export const useToast = () => useContext(ToastContext)
