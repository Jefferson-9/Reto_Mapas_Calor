import { CalendarClock, CircleCheck, CircleMinus, CircleX, X } from 'lucide-react'
import { campoApi, textoRegla } from '../../features/campo/api'
import { useApi } from '../../hooks/useApi'
import { fmtEntero, fmtIndicador, fmtPct, fmtUSD, periodoCorto } from '../../utils/format'
import { ErrorState, LoadingState } from '../feedback/Estados'
import { Chip } from '../glass/Glass'
import { Casilla, CategoriaChip } from './Campos'

const cx = (...c) => c.filter(Boolean).join(' ')

function Frecuencia({ dias }) {
  if (!dias) return null
  return (
    <Chip tono="azul" icono={CalendarClock}>
      Visitar cada {dias} {dias === 1 ? 'día' : 'días'}
    </Chip>
  )
}

/** Tarjeta de zona priorizada (lista del oficial o del jefe): orden, categoría, indicadores y frecuencia. */
export function TarjetaZona({ item, activa = false, alElegir, marcada, alMarcar }) {
  const ind = item.indicadores
  const conCasilla = typeof alMarcar === 'function'
  return (
    <div className={cx('glass-inset flex items-stretch gap-1 rounded-card p-2 transition-shadow', activa && 'ring-2 ring-brand-400')}>
      {conCasilla && (
        <div className="flex items-start pt-1">
          <Casilla checked={Boolean(marcada)} onChange={() => alMarcar(item.zona.id)} etiqueta={`Incluir ${item.zona.nombre} en la ruta`} />
        </div>
      )}
      <button type="button" onClick={alElegir ? () => alElegir(item.zona.id) : undefined} disabled={!alElegir} aria-pressed={alElegir ? activa : undefined} className="press min-w-0 flex-1 rounded-2xl p-2 text-left hover:bg-white/50 disabled:cursor-default">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-ink-2 shadow-sm" aria-label={`Prioridad ${item.orden}`}>
            {item.orden}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">{item.zona.nombre}</p>
            <p className="truncate text-xs text-muted">{item.zona.codigo}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <CategoriaChip categoria={item.categoria} />
              <Frecuencia dias={item.frecuencia_visita_dias} />
              {item.sin_datos && <Chip tono="ambar">Sin datos del período</Chip>}
            </div>
            {ind && (
              <p className="tnum mt-2 text-xs text-ink-2">
                Mora {fmtPct(ind.tasa_morosidad)} · Cartera {fmtUSD(ind.monto_cartera)} · {fmtEntero(ind.total_socios)} socios
              </p>
            )}
          </div>
        </div>
      </button>
    </div>
  )
}

/** Explicación de la prioridad de una zona: reglas evaluadas por categoría (RF-015.03). */
export function MotivoPrioridad({ zonaId, periodo }) {
  const { data, error, cargando, recargar } = useApi((s) => campoApi.explicacion(zonaId, periodo, s), [zonaId, periodo])
  if (error) return <ErrorState error={error} alReintentar={recargar} compacto />
  if (cargando || !data) return <LoadingState filas={3} alto="h-14" />
  if (data.sin_datos) return <p className="rounded-card bg-white/60 p-3 text-sm text-ink-2">{data.mensaje || `Sin datos para ${periodoCorto(periodo)}.`}</p>
  const evaluadas = data.explicacion?.evaluadas || []
  const ganadora = data.explicacion?.categoria
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink-2">
        {ganadora ? (
          <>
            Clasificada como <strong className="text-ink">{ganadora}</strong> porque es la primera categoría, por prioridad, cuyas reglas se cumplen todas.
          </>
        ) : (
          'La zona no cumple todas las reglas de ninguna categoría.'
        )}
        {data.version && <span className="text-muted"> Criterios v{data.version}.</span>}
      </p>
      <ol className="flex flex-col gap-2">
        {evaluadas.map((c) => (
          <li key={c.categoria_id ?? c.categoria} className={cx('rounded-2xl p-3', c.cumple ? 'bg-white/85 ring-2 ring-ok/30' : 'bg-white/50')}>
            <p className="flex items-center justify-between gap-2 text-sm font-semibold text-ink">
              <span className="truncate">
                {c.prioridad}. {c.categoria}
              </span>
              <Chip tono={c.cumple ? 'verde' : 'neutro'}>{c.cumple ? 'Asignada' : 'No cumple'}</Chip>
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {c.reglas.map((r, i) => {
                const Icono = r.sin_datos ? CircleMinus : r.cumple ? CircleCheck : CircleX
                return (
                  <li key={i} className="flex items-start gap-2 text-xs text-ink-2">
                    <Icono className={cx('mt-px size-4 shrink-0', r.sin_datos ? 'text-muted' : r.cumple ? 'text-ok-ink' : 'text-danger-ink')} aria-hidden />
                    <span className="min-w-0">
                      <span className="sr-only">{r.sin_datos ? 'Sin datos: ' : r.cumple ? 'Cumple: ' : 'No cumple: '}</span>
                      {textoRegla(r)}
                      <span className="tnum block text-muted">Valor de la zona: {r.sin_datos ? 'sin datos' : fmtIndicador(r.variable, r.valor)}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Detalle de una zona asignada: indicadores, frecuencia y motivo de su prioridad. */
export function DetalleZonaAsignada({ item, periodo, alCerrar, acciones, encabezado = true }) {
  const ind = item.indicadores
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted">
            Prioridad {item.orden} · {item.zona.codigo}
          </p>
          {encabezado && <h2 className="text-lg font-bold">{item.zona.nombre}</h2>}
        </div>
        {alCerrar && (
          <button type="button" onClick={alCerrar} className="press -mr-1 grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/70" aria-label="Cerrar detalle">
            <X className="size-5" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <CategoriaChip categoria={item.categoria} />
        <Frecuencia dias={item.frecuencia_visita_dias} />
      </div>
      {item.sin_datos || !ind ? (
        <p className="rounded-card bg-white/60 p-3 text-sm text-ink-2">Sin datos para {periodoCorto(periodo)} en esta zona.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-2">
          {[
            ['Socios', fmtEntero(ind.total_socios)],
            ['Créditos activos', fmtEntero(ind.total_creditos)],
            ['Monto de cartera', fmtUSD(ind.monto_cartera)],
            ['Con pagos atrasados', fmtEntero(ind.creditos_atrasados)],
            ['Tasa de morosidad', fmtPct(ind.tasa_morosidad)],
            ['Penetración', fmtPct(ind.penetracion_pct)],
          ].map(([k, v]) => (
            <div key={k} className="glass-inset rounded-2xl p-3">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="tnum text-base font-bold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <section aria-label="Motivo de la prioridad" className="flex flex-col gap-2">
        <h3 className="text-sm font-bold text-ink">¿Por qué tiene esta prioridad?</h3>
        <MotivoPrioridad zonaId={item.zona.id} periodo={periodo} />
      </section>
      {acciones && <div className="flex flex-wrap gap-2 border-t border-white/70 pt-3">{acciones}</div>}
    </div>
  )
}
