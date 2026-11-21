import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

/** Leyenda con los mismos rangos y colores que la expresión del mapa (RF-008.02). Colapsable. */
export function MapLegend({ titulo, leyenda = [], formato = (v) => v, categorias, className = '' }) {
  const [abierta, setAbierta] = useState(true)
  return (
    <div className={`glass-strong w-60 rounded-card p-3 text-xs ${className}`}>
      <button type="button" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta} className="press flex min-h-9 w-full items-center justify-between gap-2 font-semibold text-ink pointer-coarse:min-h-11">
        <span className="truncate">{titulo}</span>
        <ChevronDown className={`size-4 shrink-0 transition-transform ${abierta ? '' : '-rotate-90'}`} aria-hidden />
      </button>
      {abierta && (
        <ul className="mt-1 flex flex-col gap-1.5">
          {categorias
            ? categorias.map((c) => (
                <li key={c.nombre} className="flex items-center gap-2">
                  <span className="h-3 w-5 rounded-[4px]" style={{ background: c.color }} aria-hidden />
                  {c.nombre}
                </li>
              ))
            : leyenda.map((r, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="h-3 w-5 rounded-[4px]" style={{ background: r.color }} aria-hidden />
                  <span className="tnum">
                    {formato(r.desde)} – {formato(r.hasta)}
                  </span>
                </li>
              ))}
          <li className="flex items-center gap-2 text-muted">
            <span className="h-3 w-5 rounded-[4px] bg-[#c9c2b4]" aria-hidden /> Sin datos
          </li>
        </ul>
      )}
    </div>
  )
}
