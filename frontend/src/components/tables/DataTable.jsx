import { motion, useReducedMotion } from 'motion/react'
import { ChevronDown, Inbox } from 'lucide-react'
import { useState } from 'react'
import { useMediaQuery } from '../../hooks/useApi'
import { GlassButton } from '../glass/Glass'
import { EmptyState, ErrorState, LoadingState } from '../feedback/Estados'

/** Pie «Ver más (mostrando X de Y)»: agrega resultados sin perder el scroll ni duplicar filas. */
export function LoadMoreFooter({ mostrando, total, hayMas, cargando, alVerMas }) {
  if (!hayMas && !mostrando) return null
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-4 text-sm text-muted sm:flex-row sm:justify-between">
      <span className="tnum">
        Mostrando {mostrando}
        {total != null ? ` de ${total}` : ''}
      </span>
      {hayMas && (
        <GlassButton onClick={alVerMas} cargando={cargando} tam="sm">
          Ver más{total != null ? ` (mostrando ${mostrando} de ${total})` : ''}
        </GlassButton>
      )}
    </div>
  )
}

/**
 * Tabla dentro de un panel (filas sin bordes duros). En móvil se presenta como tarjetas apiladas con detalle expandible.
 * columnas: [{clave, titulo, render?, alinear?, movil?: 'titulo'|'detalle'|'oculta', ordenable?}]
 */
export function DataTable({ columnas, filas, idKey = 'id', cargando, error, alReintentar, vacio, orden, alOrdenar, acciones, etiqueta, alSeleccionar, seleccionado }) {
  const movil = useMediaQuery('(max-width: 767px)')
  const reducido = useReducedMotion()
  if (cargando) return <LoadingState filas={6} />
  if (error) return <ErrorState error={error} alReintentar={alReintentar} />
  if (!filas?.length) return vacio || <EmptyState icono={Inbox} titulo="No hay registros" texto="Ajuste los filtros o vuelva más tarde." />

  const anim = (i) => (reducido || i > 9 ? {} : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0, transition: { delay: i * 0.03, duration: 0.24 } } })
  const valor = (c, f) => (c.render ? c.render(f) : f[c.clave])

  if (movil) {
    const titulo = columnas.find((c) => c.movil === 'titulo') || columnas[0]
    return (
      <ul className="flex flex-col gap-2 p-2" aria-label={etiqueta}>
        {filas.map((f, i) => (
          <TarjetaMovil key={f[idKey]} fila={f} titulo={titulo} columnas={columnas} valor={valor} acciones={acciones} anim={anim(i)} alSeleccionar={alSeleccionar} />
        ))}
      </ul>
    )
  }
  return (
    <div className="thin-scroll relative overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm" aria-label={etiqueta}>
        <thead>
          <tr>
            {columnas.filter((c) => c.movil !== 'solo').map((c) => (
              <th key={c.clave} scope="col" aria-sort={orden?.campo === c.clave ? (orden.desc ? 'descending' : 'ascending') : undefined} className={`sticky top-0 z-[1] bg-white/50 px-4 py-3 text-xs font-semibold tracking-wide text-muted uppercase backdrop-blur first:rounded-l-2xl last:rounded-r-2xl ${c.alinear === 'derecha' ? 'text-right' : 'text-left'}`}>
                {c.ordenable && alOrdenar ? (
                  <button type="button" onClick={() => alOrdenar(c.clave)} className="press inline-flex min-h-8 items-center gap-1 uppercase hover:text-ink pointer-coarse:min-h-11">
                    {c.titulo}
                    <ChevronDown className={`size-3.5 transition-transform ${orden?.campo === c.clave ? 'opacity-100' : 'opacity-30'} ${orden?.campo === c.clave && !orden.desc ? 'rotate-180' : ''}`} aria-hidden />
                  </button>
                ) : (
                  c.titulo
                )}
              </th>
            ))}
            {acciones && <th className="relative w-px px-4 py-3"><span className="sr-only">Acciones</span></th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <motion.tr
              key={f[idKey]}
              {...anim(i)}
              onClick={alSeleccionar ? () => alSeleccionar(f) : undefined}
              className={`group ${alSeleccionar ? 'cursor-pointer' : ''} ${seleccionado === f[idKey] ? 'bg-white/70' : 'hover:bg-white/45'}`}
            >
              {columnas.filter((c) => c.movil !== 'solo').map((c) => (
                <td key={c.clave} className={`border-b border-white/60 px-4 py-3 align-middle ${c.alinear === 'derecha' ? 'tnum text-right' : ''}`}>
                  {valor(c, f)}
                </td>
              ))}
              {acciones && <td className="border-b border-white/60 px-4 py-2 text-right whitespace-nowrap">{acciones(f)}</td>}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TarjetaMovil({ fila, titulo, columnas, valor, acciones, anim, alSeleccionar }) {
  const [abierta, setAbierta] = useState(false)
  const detalle = columnas.filter((c) => c !== titulo && c.movil !== 'oculta')
  const visibles = detalle.slice(0, 2)
  const resto = detalle.slice(2)
  return (
    <motion.li {...anim} className="glass-inset rounded-card p-4">
      <button type="button" className="w-full text-left" onClick={() => (alSeleccionar ? alSeleccionar(fila) : setAbierta((a) => !a))} aria-expanded={alSeleccionar ? undefined : abierta}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 font-semibold text-ink">{valor(titulo, fila)}</div>
          {resto.length > 0 && !alSeleccionar && <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${abierta ? 'rotate-180' : ''}`} aria-hidden />}
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          {visibles.map((c) => (
            <div key={c.clave} className="min-w-0">
              <dt className="text-xs text-muted">{c.titulo}</dt>
              <dd className="tnum truncate font-medium text-ink-2">{valor(c, fila)}</dd>
            </div>
          ))}
        </dl>
      </button>
      {abierta && resto.length > 0 && (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-white/80 pt-2 text-sm">
          {resto.map((c) => (
            <div key={c.clave} className="min-w-0">
              <dt className="text-xs text-muted">{c.titulo}</dt>
              <dd className="tnum font-medium text-ink-2">{valor(c, fila)}</dd>
            </div>
          ))}
        </dl>
      )}
      {acciones && (() => {
        const contenido = acciones(fila)
        return contenido ? <div className="mt-3 flex flex-wrap justify-end gap-2">{contenido}</div> : null
      })()}
    </motion.li>
  )
}
