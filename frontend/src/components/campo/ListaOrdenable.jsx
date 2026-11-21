import { Reorder, useDragControls } from 'motion/react'
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from 'lucide-react'
import { useState } from 'react'

function Fila({ id, indice, total, nombre, contenido, mover, alQuitar }) {
  const controles = useDragControls()
  return (
    <Reorder.Item as="li" value={id} dragListener={false} dragControls={controles} className="glass-inset flex items-center gap-1 rounded-card p-1.5 pl-1">
      <span
        onPointerDown={(e) => controles.start(e)}
        className="hidden size-11 shrink-0 cursor-grab touch-none place-items-center rounded-full text-muted hover:bg-white/60 active:cursor-grabbing sm:grid"
        title="Arrastre para reordenar"
        aria-hidden
      >
        <GripVertical className="size-4" />
      </span>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sun-300 text-sm font-bold text-brand-900" aria-hidden>
        {indice + 1}
      </span>
      <div className="min-w-0 flex-1 px-1">{contenido}</div>
      <button type="button" onClick={() => mover(indice, -1)} disabled={indice === 0} className="press grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-white/70 disabled:opacity-35" aria-label={`Subir ${nombre} (parada ${indice + 1} de ${total})`}>
        <ArrowUp className="size-4" aria-hidden />
      </button>
      <button type="button" onClick={() => mover(indice, 1)} disabled={indice === total - 1} className="press grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-white/70 disabled:opacity-35" aria-label={`Bajar ${nombre} (parada ${indice + 1} de ${total})`}>
        <ArrowDown className="size-4" aria-hidden />
      </button>
      {alQuitar && (
        <button type="button" onClick={() => alQuitar(id)} className="press grid size-11 shrink-0 place-items-center rounded-full text-danger-ink hover:bg-white/70" aria-label={`Quitar ${nombre} de la ruta`}>
          <Trash2 className="size-4" aria-hidden />
        </button>
      )}
    </Reorder.Item>
  )
}

/**
 * Lista ordenable accesible: botones subir/bajar (teclado y lectores de pantalla) y arrastre opcional con el asa.
 * Anuncia cada movimiento en una región viva.
 */
export function ListaOrdenable({ ids, alCambiar, nombreDe, render, alQuitar, etiqueta }) {
  const [anuncio, setAnuncio] = useState('')
  const mover = (i, delta) => {
    const j = i + delta
    if (j < 0 || j >= ids.length) return
    const nuevo = [...ids]
    ;[nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]]
    alCambiar(nuevo)
    setAnuncio(`${nombreDe(ids[i])} ahora es la parada ${j + 1} de ${ids.length}.`)
  }
  return (
    <>
      <Reorder.Group as="ol" axis="y" values={ids} onReorder={alCambiar} className="flex flex-col gap-2" aria-label={etiqueta}>
        {ids.map((id, i) => (
          <Fila key={id} id={id} indice={i} total={ids.length} nombre={nombreDe(id)} contenido={render(id, i)} mover={mover} alQuitar={alQuitar} />
        ))}
      </Reorder.Group>
      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>
    </>
  )
}
