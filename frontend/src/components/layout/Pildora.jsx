import { Check, ChevronDown } from 'lucide-react'
import { useRef, useState } from 'react'
import { useSpecularHover } from '../../hooks/useSpecularHover'
import { GlassPopover } from '../glass/Overlay'

/** Píldora de filtro con prefijo de etiqueta y chevron (barra superior). */
export function PildoraSelect({ prefijo, valor, opciones, alCambiar, icono: Icono, todos = 'Todos', ancho = 260, deshabilitada = false, etiquetaAccesible }) {
  const [abierto, setAbierto] = useState(false)
  const ancla = useRef(null)
  const spec = useSpecularHover()
  const actual = opciones.find((o) => o.valor === valor)
  return (
    <>
      <button
        ref={(el) => {
          ancla.current = el
          return spec(el)
        }}
        type="button"
        disabled={deshabilitada}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={`${etiquetaAccesible || prefijo}: ${actual?.etiqueta || todos}`}
        onClick={() => setAbierto((a) => !a)}
        className="press specular glass-control flex h-11 max-w-[13rem] shrink-0 items-center gap-1.5 rounded-full pr-3 pl-3.5 text-sm disabled:opacity-50"
      >
        {Icono && <Icono className="size-4 text-brand-600" aria-hidden />}
        {prefijo && <span className="text-muted">{prefijo}:</span>}
        <span className={`truncate font-semibold ${actual ? 'text-brand-700' : 'text-ink'}`}>{actual?.etiqueta || todos}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${abierto ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      <GlassPopover abierto={abierto} alCerrar={() => setAbierto(false)} ancla={ancla} ancho={ancho} etiqueta={etiquetaAccesible || prefijo}>
        <ul role="listbox" aria-label={etiquetaAccesible || prefijo} className="flex flex-col gap-0.5">
          {todos !== null && (
            <Opcion activa={valor == null} onClick={() => (alCambiar(null), setAbierto(false))}>
              {todos}
            </Opcion>
          )}
          {opciones.map((o) => (
            <Opcion key={o.valor} activa={o.valor === valor} onClick={() => (alCambiar(o.valor), setAbierto(false))} detalle={o.detalle}>
              {o.etiqueta}
            </Opcion>
          ))}
        </ul>
      </GlassPopover>
    </>
  )
}

function Opcion({ activa, onClick, children, detalle }) {
  return (
    <li role="option" aria-selected={activa}>
      <button type="button" onClick={onClick} className={`press flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm ${activa ? 'bg-white font-semibold text-brand-700 shadow-sm' : 'text-ink hover:bg-white/60'}`}>
        <span className="flex-1">
          {children}
          {detalle && <span className="block text-xs font-normal text-muted">{detalle}</span>}
        </span>
        {activa && <Check className="size-4" aria-hidden />}
      </button>
    </li>
  )
}

/** Alternador segmentado (p. ej. Barrios / Parroquias). */
export function Segmentado({ opciones, valor, alCambiar, etiqueta }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="no-scrollbar inline-flex max-w-full overflow-x-auto rounded-full bg-white/55 p-1 shadow-[inset_0_1px_2px_rgb(16_34_61/0.06)]">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => alCambiar(o.valor)}
          className={`press min-h-9 shrink-0 rounded-full px-4 text-sm transition-colors pointer-coarse:min-h-11 ${valor === o.valor ? 'bg-white font-semibold text-ink shadow-[0_4px_12px_-6px_rgb(16_34_61/0.35)]' : 'text-muted hover:text-ink'}`}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  )
}
