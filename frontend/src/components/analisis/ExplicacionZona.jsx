import { CheckCircle2, CircleHelp, CircleSlash, X, XCircle } from 'lucide-react'
import { clasificacionApi } from '../../features/clasificacion/api'
import { useApi } from '../../hooks/useApi'
import { fmtEntero, fmtFechaHora, fmtIndicador, fmtPct, fmtUSD, periodoCorto } from '../../utils/format'
import { ErrorState, LoadingState } from '../feedback/Estados'
import { ChipCategoria } from './Partes'
import { fmtUmbral, operador } from './formatos'

function EstadoRegla({ regla }) {
  if (regla.sin_datos)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-warn-ink">
        <CircleHelp className="size-4" aria-hidden /> Sin datos
      </span>
    )
  return regla.cumple ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok-ink">
      <CheckCircle2 className="size-4" aria-hidden /> Cumple
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger-ink">
      <XCircle className="size-4" aria-hidden /> No cumple
    </span>
  )
}

/** Panel de explicación (RF-012.02): indicadores y reglas evaluadas que justifican la categoría de la zona. */
export function ExplicacionZona({ zonaId, periodo, item, alCerrar, conCierre = true }) {
  const { data, error, cargando, recargar } = useApi((s) => clasificacionApi.explicacion(zonaId, periodo, s), [zonaId, periodo])
  const listo = data && !cargando
  const ind = data?.explicacion?.indicadores
  const evaluadas = data?.explicacion?.evaluadas || []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {item?.zona?.ruta && <p className="truncate text-xs text-muted">{item.zona.ruta}</p>}
          <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">{item?.zona?.nombre || 'Zona'}</h2>
          <p className="text-xs text-muted">
            {item?.orden_atencion ? `Orden de atención ${item.orden_atencion} · ` : ''}
            {periodoCorto(periodo)}
          </p>
        </div>
        {conCierre && (
          <button type="button" onClick={alCerrar} className="press grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-white/70" aria-label="Cerrar explicación">
            <X className="size-5" aria-hidden />
          </button>
        )}
      </div>

      {error && <ErrorState error={error} alReintentar={recargar} compacto />}
      {!listo && !error && <LoadingState filas={4} alto="h-14" />}

      {listo && data.sin_datos && (
        <p className="glass-inset rounded-card p-4 text-sm text-ink-2">{data.mensaje || 'Sin datos para el período seleccionado.'} La zona no se clasifica sin información.</p>
      )}

      {listo && !data.sin_datos && (
        <>
          <div className="glass-inset flex flex-col gap-2 rounded-card p-4">
            <ChipCategoria categoria={data.categoria} className="self-start" />
            {data.categoria ? (
              <>
                {data.categoria.descripcion && <p className="text-sm text-ink-2">{data.categoria.descripcion}</p>}
                <p className="text-xs text-muted">
                  Prioridad {data.categoria.prioridad}
                  {data.categoria.frecuencia_visita_dias ? ` · visita sugerida cada ${data.categoria.frecuencia_visita_dias} días` : ' · sin frecuencia de visita definida'}
                </p>
              </>
            ) : (
              <p className="flex items-start gap-2 text-sm text-ink-2">
                <CircleSlash className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                Ninguna categoría cumplió todas sus reglas: la zona queda sin clasificar.
              </p>
            )}
          </div>

          {ind && (
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

          <section aria-labelledby={`reglas-${zonaId}`} className="flex flex-col gap-2">
            <h3 id={`reglas-${zonaId}`} className="text-sm font-bold text-ink">
              Cómo se decidió
            </h3>
            <p className="text-xs text-muted">Las categorías se evalúan por prioridad (1 = mayor). Gana la primera cuyas reglas se cumplen todas (Y); un indicador sin datos no cumple la regla.</p>
            <ol className="flex flex-col gap-2">
              {evaluadas.map((c) => (
                <li key={`${c.categoria_id}-${c.prioridad}`} className={`rounded-card p-3 ${c.cumple ? 'bg-white shadow-sm ring-1 ring-ok/30' : 'glass-inset'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">
                      {c.prioridad}. {c.categoria}
                    </p>
                    {c.cumple ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok-ink">
                        <CheckCircle2 className="size-4" aria-hidden /> Asignada: cumple todas
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
                        <XCircle className="size-4" aria-hidden /> No asignada
                      </span>
                    )}
                  </div>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {c.reglas.map((r, i) => (
                      <li key={i} className="flex flex-col gap-1 rounded-xl bg-white/60 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <span className="min-w-0 text-ink-2">
                          {r.etiqueta} <span className="font-semibold text-ink">{operador(r.operador)?.simbolo || r.operador}</span> <span className="tnum">{fmtUmbral(r.variable, r.operador, r.umbral)}</span>
                          <span className="block text-xs text-muted">
                            Valor de la zona: <span className="tnum font-semibold text-ink-2">{fmtIndicador(r.variable, r.valor)}</span>
                          </span>
                        </span>
                        <EstadoRegla regla={r} />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
          <p className="text-xs text-muted">
            Criterios v{data.version} · calculado {fmtFechaHora(data.calculado_en)}
          </p>
        </>
      )}
    </div>
  )
}
