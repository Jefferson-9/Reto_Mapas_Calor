import { Check, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useDebounce } from '../../hooks/useApi'
import { EmptyState, ErrorState, LoadingState } from '../feedback/Estados'
import { GlassButton } from '../glass/Glass'
import { GlassModal } from '../glass/Overlay'
import { TIPOS_ZONA, coincide } from './formatos'

const ORDEN_TIPOS = ['provincia', 'canton', 'parroquia', 'barrio']
const MAX_RESULTADOS = 120

/**
 * Selector de zonas con búsqueda (sobre GET /zonas/, ya filtrado por el ámbito en el servidor).
 * Hoja inferior en móvil; los cambios se aplican al marcar cada casilla.
 */
export function SelectorZonas({ abierto, alCerrar, zonas, cargando, error, alReintentar, seleccion, alCambiar, max = 10 }) {
  const [consulta, setConsulta] = useState('')
  const q = useDebounce(consulta, 150)
  const nombres = useMemo(() => Object.fromEntries((zonas || []).map((z) => [z.id, z.nombre])), [zonas])
  const grupos = useMemo(() => {
    const filtradas = (zonas || []).filter((z) => !q.trim() || coincide(`${z.nombre} ${z.codigo}`, q))
    const recortadas = filtradas.slice(0, MAX_RESULTADOS)
    return {
      total: filtradas.length,
      mostradas: recortadas.length,
      grupos: ORDEN_TIPOS.map((t) => ({ tipo: t, items: recortadas.filter((z) => z.tipo_zona === t) })).filter((g) => g.items.length),
    }
  }, [zonas, q])
  const lleno = seleccion.length >= max

  const alternar = (id) => alCambiar(seleccion.includes(id) ? seleccion.filter((x) => x !== id) : lleno ? seleccion : [...seleccion, id])

  return (
    <GlassModal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Elegir zonas"
      descripcion={`Seleccione entre 1 y ${max} zonas de su ámbito. Seleccionadas: ${seleccion.length} de ${max}.`}
      pie={
        <GlassButton variante="primario" onClick={alCerrar}>
          Listo
        </GlassButton>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="glass-control flex h-11 items-center gap-2 rounded-full px-3 focus-within:ring-2 focus-within:ring-brand-400">
          <Search className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="sr-only">Buscar zona por nombre o código</span>
          <input
            type="search"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Buscar por nombre o código"
            autoComplete="off"
            data-autofocus
            className="h-full w-full min-w-0 bg-transparent text-sm text-ink outline-none"
          />
        </label>
        {lleno && (
          <p role="status" className="rounded-control bg-sun-100 px-3 py-2 text-sm font-medium text-sun-700">
            Alcanzó el máximo de {max} zonas. Quite una para agregar otra.
          </p>
        )}
        {error ? (
          <ErrorState error={error} alReintentar={alReintentar} compacto />
        ) : cargando ? (
          <LoadingState filas={6} alto="h-11" />
        ) : grupos.total === 0 ? (
          <EmptyState titulo="Sin coincidencias" texto="No hay zonas de su ámbito con ese nombre o código." />
        ) : (
          <>
            {grupos.grupos.map((g) => (
              <fieldset key={g.tipo} className="flex flex-col gap-1">
                <legend className="mb-1 px-1 text-xs font-semibold tracking-wide text-muted uppercase">{TIPOS_ZONA[g.tipo]}</legend>
                {g.items.map((z) => {
                  const marcada = seleccion.includes(z.id)
                  return (
                    <label
                      key={z.id}
                      className={`press flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-400 ${marcada ? 'bg-white font-semibold text-brand-700 shadow-sm' : 'text-ink hover:bg-white/60'} ${lleno && !marcada ? 'opacity-55' : ''}`}
                    >
                      <input type="checkbox" className="sr-only" checked={marcada} disabled={lleno && !marcada} onChange={() => alternar(z.id)} />
                      <span className={`grid size-5 shrink-0 place-items-center rounded-md ring-1 ${marcada ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-ink/20'}`} aria-hidden>
                        {marcada && <Check className="size-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{z.nombre}</span>
                        <span className="block truncate text-xs font-normal text-muted">
                          {z.codigo}
                          {z.zona_superior_id && nombres[z.zona_superior_id] ? ` · en ${nombres[z.zona_superior_id]}` : ''}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </fieldset>
            ))}
            {grupos.total > grupos.mostradas && (
              <p className="text-center text-xs text-muted">
                Se muestran {grupos.mostradas} de {grupos.total} zonas. Escriba para acotar la búsqueda.
              </p>
            )}
          </>
        )}
      </div>
    </GlassModal>
  )
}
