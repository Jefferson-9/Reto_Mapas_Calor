import { CalendarDays } from 'lucide-react'
import { useId } from 'react'

function Fecha({ etiqueta, valor, alCambiar, min, max }) {
  const id = useId()
  return (
    <span className="glass-control flex h-11 shrink-0 items-center gap-1.5 rounded-full pr-2 pl-3.5 text-sm focus-within:ring-2 focus-within:ring-brand-400">
      <CalendarDays className="size-4 text-brand-600" aria-hidden />
      <label htmlFor={id} className="text-muted">
        {etiqueta}:
      </label>
      <input id={id} type="date" value={valor || ''} min={min} max={max} onChange={(e) => alCambiar(e.target.value || null)} className="h-full min-w-0 bg-transparent text-base font-semibold text-brand-700 outline-none" />
    </span>
  )
}

/** Rango de fechas en píldoras de cristal (para la barra superior). */
export function RangoFechas({ desde, hasta, alCambiarDesde, alCambiarHasta, max }) {
  return (
    <div role="group" aria-label="Rango de fechas" className="flex flex-wrap items-center gap-2">
      <Fecha etiqueta="Desde" valor={desde} alCambiar={alCambiarDesde} max={hasta || max} />
      <Fecha etiqueta="Hasta" valor={hasta} alCambiar={alCambiarHasta} min={desde || undefined} max={max} />
    </div>
  )
}
