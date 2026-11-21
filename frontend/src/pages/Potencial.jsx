import { ArrowRight, Calculator, CircleHelp, Info, Sparkles } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Aviso, EncabezadoSeccion } from '../components/admin/Bloques'
import { BarraProgreso } from '../components/charts/ChartParts'
import { EmptyState, ErrorState, FuncionBloqueada, InsigniaDemo, LoadingState } from '../components/feedback/Estados'
import { Chip, GlassPanel } from '../components/glass/Glass'
import { GlassModal } from '../components/glass/Overlay'
import { Ensamblado, EncabezadoPagina } from '../components/layout/Ensamblado'
import { Segmentado } from '../components/layout/Pildora'
import { GeoMap } from '../components/maps/GeoMap'
import { DataTable } from '../components/tables/DataTable'
import { useAuth } from '../context/AuthContext'
import { useBarraSuperior, useFiltros } from '../context/FiltrosContext'
import { adminApi, BANDAS, VARIABLES_POTENCIAL } from '../features/admin/api'
import { useApi } from '../hooks/useApi'
import { fmtDecimal, fmtEntero, fmtFechaHora, fmtPct, periodoCorto, periodoLargo } from '../utils/format'

const CAPAS = { zonas: true }
const ETIQUETA = 'Estimación no confirmada'
const fmtCrudo = (formato, v) => (v == null ? 'Sin datos' : formato === 'pct' ? fmtPct(v) : fmtEntero(v))

function ChipBanda({ banda }) {
  const b = BANDAS[banda] || BANDAS.sin_datos
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-0.5 text-xs font-semibold text-ink">
      <span className="size-2.5 rounded-full" style={{ background: b.color }} aria-hidden />
      {b.etiqueta}
    </span>
  )
}

/** Etiqueta permanente y visible de los resultados estimados (RF-020.04). */
function EtiquetaEstimacion({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-[#efeafb] px-2.5 py-1 text-xs font-bold text-[#5b3fa6] ring-1 ring-[#5b3fa6]/20 ${className}`}>
      <Sparkles className="size-3.5" aria-hidden />
      {ETIQUETA}
    </span>
  )
}

export default function Potencial() {
  useBarraSuperior({ periodo: true }, [])
  const { periodo } = useFiltros()
  const { puede } = useAuth()
  const [nivel, setNivel] = useState('barrio')
  const [zona, setZona] = useState(null)
  const estado = useApi((s) => adminApi.potencialEstado(s), [])
  const res = useApi((s) => (periodo ? adminApi.potencial({ periodo, nivel }, s) : Promise.resolve(null)), [periodo, nivel])
  const d = res.data
  const items = useMemo(() => (d?.items || []).map((i, n) => ({ ...i, id: i.zona.id, orden: n + 1 })), [d])
  const fc = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: items
        .filter((i) => i.geometria)
        .map((i) => ({ type: 'Feature', geometry: i.geometria, properties: { id: i.zona.id, nombre: i.zona.nombre, banda: i.banda, puntaje: Number(i.puntaje), categoria_color: (BANDAS[i.banda] || BANDAS.sin_datos).color } })),
    }),
    [items],
  )
  const alZona = useCallback((id) => setZona(id), [])
  const e = estado.data
  const deshabilitado = res.error?.code === 'PREDICTIVO_DESHABILITADO'
  const listo = !res.cargando && d !== undefined

  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina
        titulo="Potencial de captación"
        subtitulo={`Zonas con mayor potencial estimado · ${periodoLargo(periodo)}`}
        insignias={
          <>
            <EtiquetaEstimacion />
            <InsigniaDemo />
          </>
        }
        extra={<Segmentado etiqueta="Nivel geográfico" valor={nivel} alCambiar={setNivel} opciones={[{ valor: 'barrio', etiqueta: 'Barrios' }, { valor: 'parroquia', etiqueta: 'Parroquias' }]} />}
      />
      <Aviso tono="info" icono={Info}>
        Puntaje ponderado y transparente: suma de variables normalizadas multiplicadas por sus pesos. <strong>No es un modelo de aprendizaje automático</strong> ni una predicción confirmada; úselo como apoyo para priorizar, junto con el conocimiento del territorio.
      </Aviso>
      {e && !e.operativo && (
        <Aviso tono="aviso" titulo="El análisis no está operativo">
          <ul className="list-disc pl-4">
            {e.motivos.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Aviso>
      )}

      {deshabilitado ? (
        <GlassPanel>
          <FuncionBloqueada titulo="Función no habilitada" mensaje={res.error.message} />
        </GlassPanel>
      ) : res.error ? (
        <GlassPanel>
          <ErrorState error={res.error} alReintentar={res.recargar} />
        </GlassPanel>
      ) : !listo ? (
        <GlassPanel className="p-5">
          <LoadingState filas={6} alto="h-14" />
        </GlassPanel>
      ) : !d?.ejecucion ? (
        <GlassPanel>
          <EmptyState
            icono={Calculator}
            titulo="Sin resultados para estos filtros"
            texto={`${d?.mensaje || 'Aún no se ha ejecutado el análisis.'} Período ${periodoCorto(periodo)}, nivel ${nivel === 'barrio' ? 'barrio' : 'parroquia'}.`}
            accion={
              puede('analisis.ejecutar') && (
                <Link to="/analisis" className="press glass-control inline-flex min-h-11 items-center gap-2 rounded-control px-4 text-sm font-semibold text-brand-700 hover:bg-white/90">
                  Ejecutar el análisis <ArrowRight className="size-4" aria-hidden />
                </Link>
              )
            }
          />
        </GlassPanel>
      ) : (
        <>
          <p className="px-1 text-sm text-muted">
            Ejecutado el {fmtFechaHora(d.ejecucion.ejecutado_en)} por {d.ejecucion.ejecutado_por} · configuración v{d.ejecucion.configuracion_version} · {fmtEntero(d.ejecucion.zonas_evaluadas)} zonas evaluadas · datos al {fmtFechaHora(d.fecha_datos)}
          </p>
          <div className="grid grid-cols-1 gap-[var(--gap)] xl:grid-cols-12">
            <GlassPanel className="relative h-[420px] min-w-0 overflow-hidden p-0 md:h-[540px] xl:col-span-7" aria-label="Mapa del potencial estimado">
              <GeoMap
                zonas={fc}
                modoColor="categoria"
                capas={CAPAS}
                seleccion={zona}
                encuadre={`${periodo}-${nivel}-${fc.features.length}`}
                onZona={alZona}
                etiqueta="Mapa del potencial de captación estimado por zona"
                fallback={<p className="p-6 text-sm">Su navegador no admite WebGL. Consulte la lista de zonas para ver los mismos resultados.</p>}
              />
              <div className="pointer-events-none absolute top-3 left-3 z-10">
                <EtiquetaEstimacion className="glass-strong pointer-events-auto" />
              </div>
              <ul className="glass-strong absolute bottom-8 left-3 z-10 flex flex-col gap-1 rounded-2xl px-3 py-2 text-xs" aria-label="Leyenda de bandas">
                {Object.entries(BANDAS).map(([k, b]) => (
                  <li key={k} className="flex items-center gap-2">
                    <span className="size-3 rounded-[4px]" style={{ background: b.color }} aria-hidden />
                    {b.etiqueta}
                  </li>
                ))}
              </ul>
            </GlassPanel>
            <GlassPanel className="min-w-0 p-2 md:p-3 xl:col-span-5" aria-labelledby="titulo-ranking">
              <div className="px-3 pt-3">
                <EncabezadoSeccion id="titulo-ranking" titulo="Zonas por puntaje" subtitulo="Seleccione una zona para ver sus variables." />
              </div>
              <DataTable
                etiqueta="Zonas por puntaje de potencial"
                filas={items}
                alSeleccionar={(f) => setZona(f.id)}
                seleccionado={zona}
                vacio={<EmptyState titulo="Sin zonas" texto="No hay zonas evaluadas en su ámbito." />}
                columnas={[
                  { clave: 'orden', titulo: '#', render: (f) => <span className="tnum font-semibold text-muted">{f.orden}</span> },
                  { clave: 'zona', titulo: 'Zona', movil: 'titulo', render: (f) => <span className="font-semibold text-ink">{f.zona.nombre}</span> },
                  {
                    clave: 'puntaje',
                    titulo: 'Puntaje',
                    alinear: 'derecha',
                    render: (f) => (
                      <span className="inline-flex min-w-24 flex-col items-end gap-1">
                        <span className="tnum font-semibold">{fmtDecimal(f.puntaje)}</span>
                        <BarraProgreso valor={Number(f.puntaje)} max={1} etiqueta={`Puntaje de ${f.zona.nombre}`} />
                      </span>
                    ),
                  },
                  { clave: 'banda', titulo: 'Banda', render: (f) => <ChipBanda banda={f.banda} /> },
                ]}
              />
            </GlassPanel>
          </div>
        </>
      )}

      <GlassPanel className="p-5 md:p-6" aria-labelledby="titulo-metodo">
        <EncabezadoSeccion id="titulo-metodo" titulo="Cómo se calcula" subtitulo={e?.formula} extra={<Chip icono={CircleHelp}>Método transparente</Chip>} />
        {estado.error ? (
          <ErrorState error={estado.error} alReintentar={estado.recargar} compacto />
        ) : !e ? (
          <LoadingState filas={3} />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ul className="flex flex-col gap-2 lg:col-span-2">
              {VARIABLES_POTENCIAL.map((v) => (
                <li key={v.clave} className="glass-inset flex items-start justify-between gap-3 rounded-2xl px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{v.etiqueta}</span>
                    <span className="block text-xs text-muted">{e.variables?.[v.clave] || v.descripcion}</span>
                  </span>
                  <span className="tnum shrink-0 text-xs text-ink-2">Peso {e.configuracion ? fmtDecimal(e.configuracion.pesos?.[v.clave]) : '—'}</span>
                </li>
              ))}
            </ul>
            <div className="glass-inset rounded-card p-4 text-sm">
              <p className="font-semibold text-ink">Bandas</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                <li className="flex items-center justify-between gap-2">
                  <ChipBanda banda="alto" /> <span className="tnum">≥ {fmtDecimal(e.bandas?.alto)}</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <ChipBanda banda="medio" /> <span className="tnum">≥ {fmtDecimal(e.bandas?.medio)}</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <ChipBanda banda="bajo" /> <span className="tnum">&lt; {fmtDecimal(e.bandas?.medio)}</span>
                </li>
              </ul>
              <p className="mt-3 text-xs text-muted">
                {fmtEntero(e.periodos_con_datos)} períodos con datos{e.configuracion ? ` · mínimo requerido: ${fmtEntero(e.configuracion.min_periodos)}` : ''}.
              </p>
            </div>
          </div>
        )}
      </GlassPanel>

      <GlassModal abierto={zona != null} alCerrar={() => setZona(null)} titulo="Detalle del potencial" descripcion={ETIQUETA} ancho="max-w-xl">
        {zona != null && <DetalleZona id={zona} periodo={periodo} nivel={nivel} />}
      </GlassModal>
    </Ensamblado>
  )
}

function DetalleZona({ id, periodo, nivel }) {
  const { data, error, cargando, recargar } = useApi((s) => adminApi.potencialZona(id, { periodo, nivel }, s), [id, periodo, nivel])
  if (cargando) return <LoadingState filas={5} />
  if (error) return <ErrorState error={error} alReintentar={recargar} />
  const vars = data.variables || {}
  const crudos = vars.crudos || {}
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-lg font-bold text-ink">{data.zona.nombre}</p>
          <p className="text-xs text-muted">{data.zona.codigo}</p>
        </div>
        <EtiquetaEstimacion />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-inset rounded-card p-4">
          <p className="text-xs text-muted">Puntaje estimado</p>
          <p className="tnum text-2xl font-bold text-ink">{fmtDecimal(data.puntaje)}</p>
        </div>
        <div className="glass-inset flex flex-col justify-center gap-1 rounded-card p-4">
          <p className="text-xs text-muted">Banda</p>
          <ChipBanda banda={data.banda} />
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {VARIABLES_POTENCIAL.map((v) => {
          const x = vars[v.clave] || {}
          return (
            <li key={v.clave} className="glass-inset rounded-2xl p-3 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-ink">{v.etiqueta}</span>
                <span className="tnum text-xs text-muted">peso {fmtDecimal(x.peso)}</span>
              </div>
              <p className="text-xs text-muted">{data.descripcion_variables?.[v.clave] || v.descripcion}</p>
              {x.sin_datos ? (
                <p className="mt-1 text-xs font-medium text-ink-2">Sin datos: no se considera en el puntaje.</p>
              ) : (
                <div className="mt-2 flex items-center gap-3">
                  <BarraProgreso valor={Number(x.normalizado)} max={1} etiqueta={`${v.etiqueta} normalizada`} />
                  <span className="tnum w-12 shrink-0 text-right text-xs font-semibold">{fmtDecimal(x.normalizado)}</span>
                </div>
              )}
              <p className="mt-1 text-xs text-ink-2">Valor observado: {fmtCrudo(v.formato, crudos[v.crudo])}</p>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted">
        Fecha de los datos: {fmtFechaHora(data.fecha_datos)} · ejecución del {fmtFechaHora(data.ejecucion?.ejecutado_en)} por {data.ejecucion?.ejecutado_por} · período {periodoCorto(data.ejecucion?.periodo)}.
      </p>
    </div>
  )
}
