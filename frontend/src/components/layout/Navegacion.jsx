import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Lock, MoreHorizontal, PanelLeftClose, PanelLeftOpen, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { destinosVisibles } from '../../app/navegacion'
import { useAuth } from '../../context/AuthContext'
import { funcionaSinConexion, useEnLinea } from '../../offline/conexion'
import { useSpecularHover } from '../../hooks/useSpecularHover'
import { spring } from '../../utils/motion'
import { GlassModal } from '../glass/Overlay'

const leerPreferencia = () => {
  try {
    return localStorage.getItem('coac.sidebar') === 'expandida'
  } catch {
    return false
  }
}
const guardarPreferencia = (v) => {
  try {
    localStorage.setItem('coac.sidebar', v ? 'expandida' : 'rail')
  } catch {
    /* almacenamiento no disponible: solo se pierde la preferencia */
  }
}

/** Motivo por el que un destino no está disponible: función condicionada apagada o «requiere conexión». */
function useMotivoBloqueo() {
  const { parametros, sinConexion } = useAuth()
  const enLinea = useEnLinea()
  const sinRed = sinConexion || (!enLinea && parametros?.habilitar_modo_offline)
  return (i) => (sinRed && !funcionaSinConexion(i.to) ? 'requiere conexión' : i.interruptor && !parametros?.[i.interruptor] ? 'no habilitado' : null)
}

function ItemRail({ item, bloqueado }) {
  const spec = useSpecularHover()
  const [tip, setTip] = useState(false)
  const Icono = item.icono
  return (
    <li className="relative" onPointerEnter={() => setTip(true)} onPointerLeave={() => setTip(false)}>
      <NavLink
        ref={spec}
        to={item.to}
        aria-label={item.etiqueta + (bloqueado ? ` (${bloqueado})` : '')}
        onFocus={() => setTip(true)}
        onBlur={() => setTip(false)}
        className={({ isActive }) =>
          `press specular grid size-12 place-items-center rounded-full transition-colors ${isActive ? 'bg-white text-brand-600 shadow-[0_10px_22px_-10px_rgb(16_34_61/0.45),inset_0_1px_0_#fff]' : 'text-ink-2/80 hover:bg-white/55 hover:text-ink'}`
        }
      >
        <Icono className="size-[21px]" aria-hidden />
        {bloqueado === 'requiere conexión' ? <WifiOff className="absolute right-1.5 bottom-1.5 size-3 text-muted" aria-hidden /> : bloqueado && <Lock className="absolute right-1.5 bottom-1.5 size-3 text-muted" aria-hidden />}
      </NavLink>
      {tip && (
        <span role="tooltip" className="glass-strong pointer-events-none absolute top-1/2 left-full z-50 ml-3 w-max -translate-y-1/2 rounded-xl px-3 py-1.5 text-xs font-semibold text-ink">
          {item.etiqueta}
          {bloqueado === 'requiere conexión' && <span className="block font-medium text-muted">Requiere conexión</span>}
        </span>
      )}
    </li>
  )
}

function ListaExpandida({ grupos, alNavegar }) {
  const motivo = useMotivoBloqueo()
  return (
    <nav aria-label="Navegación principal" className="flex flex-col gap-4">
      {grupos.map((g) => (
        <div key={g.grupo}>
          <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">{g.grupo}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((i) => {
              const Icono = i.icono
              const bloqueado = motivo(i)
              return (
                <li key={i.to}>
                  <NavLink
                    to={i.to}
                    onClick={alNavegar}
                    className={({ isActive }) => `press flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm ${isActive ? 'bg-white font-semibold text-brand-700 shadow-[0_8px_18px_-10px_rgb(16_34_61/0.4)]' : 'text-ink-2 hover:bg-white/60'}`}
                  >
                    <Icono className="size-5 shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{i.etiqueta}</span>
                    {bloqueado === 'requiere conexión' ? (
                      <span className="flex items-center gap-1 text-[11px] text-muted">
                        <WifiOff className="size-3.5" aria-hidden /> Requiere conexión
                      </span>
                    ) : (
                      bloqueado && <Lock className="size-3.5 text-muted" aria-label="No habilitado" />
                    )}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/** Barra lateral flotante en cápsula: rail de íconos ↔ panel expandido (spring interrumpible, solo transform). */
export function FloatingSidebar() {
  const { puede } = useAuth()
  const motivo = useMotivoBloqueo()
  const grupos = destinosVisibles(puede)
  const [expandida, setExpandida] = useState(leerPreferencia)
  const reducido = useReducedMotion()
  const { pathname } = useLocation()
  const toggleSpec = useSpecularHover()
  const cambiar = (v) => {
    setExpandida(v)
    guardarPreferencia(v)
  }
  useEffect(() => {
    if (!expandida) return undefined
    const k = (e) => e.key === 'Escape' && cambiar(false)
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [expandida])

  return (
    <div className="no-print fixed top-[calc(var(--bar-h)+32px)] bottom-4 left-4 z-30 hidden md:block">
      <nav aria-label="Navegación (íconos)" className="glass-strong flex h-auto max-h-full w-[var(--rail-w)] flex-col items-center gap-2 rounded-full px-3 py-4">
        <ul className="thin-scroll no-scrollbar flex min-h-0 flex-col items-center gap-2 overflow-y-auto">
          {grupos.flatMap((g) => g.items).map((i) => (
            <ItemRail key={i.to} item={i} bloqueado={motivo(i)} />
          ))}
        </ul>
        <div className="mt-2 border-t border-white/80 pt-3">
          <button
            ref={toggleSpec}
            type="button"
            onClick={() => cambiar(!expandida)}
            aria-expanded={expandida}
            aria-controls="sidebar-expandida"
            aria-label={expandida ? 'Contraer navegación' : 'Expandir navegación'}
            className="press specular grid size-12 place-items-center rounded-full bg-white text-brand-600 shadow-[0_10px_22px_-10px_rgb(16_34_61/0.45)]"
          >
            {expandida ? <PanelLeftClose className="size-5" aria-hidden /> : <PanelLeftOpen className="size-5" aria-hidden />}
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {expandida && (
          <motion.aside
            id="sidebar-expandida"
            key={pathname.split('/')[1]}
            className="glass-strong thin-scroll absolute top-0 left-[calc(var(--rail-w)+12px)] max-h-full w-[260px] overflow-y-auto rounded-panel p-3"
            initial={reducido ? { opacity: 0 } : { opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0, transition: spring }}
            exit={reducido ? { opacity: 0 } : { opacity: 0, x: -24, transition: { duration: 0.16 } }}
          >
            <ListaExpandida grupos={grupos} />
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Barra inferior de cristal en móvil: hasta 4 destinos principales del rol + «Más». */
export function MobileTabBar() {
  const { puede } = useAuth()
  const grupos = destinosVisibles(puede)
  const todos = grupos.flatMap((g) => g.items)
  const principales = todos.filter((i) => i.principal).slice(0, 4)
  const [mas, setMas] = useState(false)
  return (
    <>
      <nav aria-label="Navegación principal" className="no-print fixed inset-x-3 bottom-[calc(10px+var(--safe-bottom))] z-40 md:hidden">
        <ul className="glass-bar flex items-stretch justify-around rounded-full px-2 py-1.5">
          {principales.map((i) => {
            const Icono = i.icono
            return (
              <li key={i.to} className="flex-1">
                <NavLink to={i.to} className={({ isActive }) => `press flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium ${isActive ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-2'}`}>
                  <Icono className="size-5" aria-hidden />
                  <span className="max-w-full truncate px-1">{i.etiqueta.split(' ')[0]}</span>
                </NavLink>
              </li>
            )
          })}
          <li className="flex-1">
            <button type="button" onClick={() => setMas(true)} className="press flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium text-ink-2" aria-haspopup="dialog">
              <MoreHorizontal className="size-5" aria-hidden />
              Más
            </button>
          </li>
        </ul>
      </nav>
      <GlassModal abierto={mas} alCerrar={() => setMas(false)} titulo="Todas las secciones">
        <ListaExpandida grupos={grupos} alNavegar={() => setMas(false)} />
      </GlassModal>
    </>
  )
}
