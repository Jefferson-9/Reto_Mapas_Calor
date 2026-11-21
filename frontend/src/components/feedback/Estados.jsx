import { motion, useReducedMotion } from 'motion/react'
import { CircleSlash, FlaskConical, Info, Lock, RefreshCw, SearchX, TriangleAlert } from 'lucide-react'
import { GlassButton, Skeleton } from '../glass/Glass'
import { GlassModal, GlassTooltip } from '../glass/Overlay'

export function EmptyState({ icono: Icono = SearchX, titulo = 'Sin resultados', texto, accion }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-white/70 text-muted shadow-[inset_0_1px_0_#fff]">
        <Icono className="size-6" aria-hidden />
      </span>
      <div>
        <p className="font-semibold text-ink">{titulo}</p>
        {texto && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{texto}</p>}
      </div>
      {accion}
    </div>
  )
}

export function ErrorState({ error, alReintentar, compacto = false }) {
  const msg = error?.message || 'No se pudo cargar la información.'
  return (
    <div role="alert" className={`flex flex-col items-center justify-center gap-3 text-center ${compacto ? 'py-6' : 'px-6 py-10'}`}>
      <span className="grid size-12 place-items-center rounded-full bg-[#fbe9e5] text-danger-ink">
        <TriangleAlert className="size-6" aria-hidden />
      </span>
      <p className="max-w-md text-sm font-medium text-ink">{msg}</p>
      {alReintentar && (
        <GlassButton icono={RefreshCw} onClick={alReintentar} tam="sm">
          Reintentar
        </GlassButton>
      )}
    </div>
  )
}

export function LoadingState({ filas = 4, alto = 'h-10' }) {
  return (
    <div className="flex flex-col gap-2 p-1" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: filas }, (_, i) => (
        <Skeleton key={i} className={`${alto} w-full`} />
      ))}
    </div>
  )
}

export function AccessDenied({ mensaje = 'No tiene permiso para ver esta sección.' }) {
  return <EmptyState icono={Lock} titulo="Acceso restringido" texto={mensaje} />
}

export function FuncionBloqueada({ titulo, mensaje }) {
  return <EmptyState icono={CircleSlash} titulo={titulo} texto={mensaje} />
}

/** Etiqueta permanente para definiciones no oficiales (sección 6). */
export function EtiquetaProvisional({ texto = 'Definición operativa provisional', detalle = 'Fórmula o umbral propuesto por el equipo para que el sistema funcione. Debe validarse con la cooperativa; no es oficial.' }) {
  return (
    <GlassTooltip texto={detalle}>
      <span tabIndex={0} className="inline-flex cursor-help items-center gap-1 rounded-full bg-sun-100 px-2.5 py-0.5 text-[11px] font-semibold text-sun-700 ring-1 ring-sun-400/40">
        <Info className="size-3" aria-hidden />
        {texto}
      </span>
    </GlassTooltip>
  )
}

export function InsigniaDemo() {
  return (
    <GlassTooltip texto="Límites geográficos esquemáticos y datos financieros sintéticos. No son oficiales.">
      <span tabIndex={0} className="inline-flex cursor-help items-center gap-1 rounded-full bg-[#efeafb] px-2.5 py-0.5 text-[11px] font-semibold text-[#5b3fa6] ring-1 ring-[#5b3fa6]/15">
        <FlaskConical className="size-3" aria-hidden />
        Datos de demostración
      </span>
    </GlassTooltip>
  )
}

export function ConfirmDialog({ abierto, alCerrar, alConfirmar, titulo, texto, confirmar = 'Confirmar', peligro = false, cargando = false, children }) {
  return (
    <GlassModal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={titulo}
      descripcion={texto}
      pie={
        <>
          <GlassButton onClick={alCerrar} disabled={cargando}>
            Cancelar
          </GlassButton>
          <GlassButton variante={peligro ? 'peligro' : 'primario'} onClick={alConfirmar} cargando={cargando} data-autofocus>
            {confirmar}
          </GlassButton>
        </>
      }
    >
      {children}
    </GlassModal>
  )
}

/** Cruce suave entre esqueleto y contenido real (sin desvanecer toda la pantalla). */
export function Cruce({ listo, esqueleto, children }) {
  const reducido = useReducedMotion()
  if (!listo) return esqueleto
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: reducido ? 0.12 : 0.24 } }}>
      {children}
    </motion.div>
  )
}
