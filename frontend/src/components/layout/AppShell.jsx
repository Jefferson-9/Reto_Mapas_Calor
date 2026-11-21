import { AnimatePresence, motion } from 'motion/react'
import { Suspense } from 'react'
import { Navigate, ScrollRestoration, useLocation, useOutlet } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { FiltrosProvider } from '../../context/FiltrosContext'
import { LoadingState } from '../feedback/Estados'
import { CapaOffline } from '../offline/Conexion'
import { FloatingSidebar, MobileTabBar } from './Navegacion'
import { TopGlassBar } from './TopGlassBar'

function Fondo() {
  return (
    <div className="backdrop" aria-hidden>
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <path d="M-80 640 C 320 520, 760 760, 1520 560" stroke="white" strokeOpacity="0.55" strokeWidth="1.4" fill="none" />
        <path d="M-80 700 C 420 600, 840 820, 1520 640" stroke="white" strokeOpacity="0.35" strokeWidth="1" fill="none" />
        <path d="M-60 180 C 380 60, 900 260, 1500 120" stroke="white" strokeOpacity="0.3" strokeWidth="1" fill="none" />
      </svg>
    </div>
  )
}

/** Solo se anima el área de contenido; la barra superior y la lateral permanecen (11.2). */
function ContenidoAnimado() {
  const outlet = useOutlet()
  const { pathname } = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={pathname} exit={{ opacity: 0, transition: { duration: 0.14 } }}>
        <Suspense fallback={<div className="pt-6"><LoadingState filas={6} alto="h-24" /></div>}>{outlet}</Suspense>
      </motion.div>
    </AnimatePresence>
  )
}

export function AppShell() {
  const { usuario, iniciando } = useAuth()
  const location = useLocation()
  if (iniciando) return <Fondo />
  if (!usuario) return <Navigate to="/login" replace state={{ desde: location.pathname }} />
  return (
    <FiltrosProvider>
      <Fondo />
      <a href="#contenido" className="sr-only-focusable fixed top-2 left-2 z-[80] rounded-xl bg-white px-4 py-2 font-semibold">
        Saltar al contenido
      </a>
      <TopGlassBar />
      <FloatingSidebar />
      <main
        id="contenido"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1680px] px-3 pt-[calc(64px+24px+var(--safe-top))] pb-[calc(96px+var(--safe-bottom))] outline-none md:pt-[calc(var(--bar-h)+32px)] md:pr-4 md:pb-8 md:pl-[calc(var(--rail-w)+32px)]"
      >
        <ContenidoAnimado />
      </main>
      <MobileTabBar />
      <CapaOffline />
      <ScrollRestoration />
    </FiltrosProvider>
  )
}
