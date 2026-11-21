import { useReducedMotion } from 'motion/react'
import { ArrowRight, Check, GitCompareArrows, MapPinned, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import { Tendencia } from '../components/analisis/Partes'
import { SelectorZonas } from '../components/analisis/SelectorZonas'
import { TIPOS_ZONA, fmtDiferencia } from '../components/analisis/formatos'
import { ChartCard, ChartLegend, ChartTooltip } from '../components/charts/ChartParts'
import { EmptyState, ErrorState, EtiquetaProvisional, InsigniaDemo, LoadingState } from '../components/feedback/Estados'
import { GlassButton, GlassCard, GlassPanel } from '../components/glass/Glass'
import { Ensamblado, EncabezadoPagina, Grupo } from '../components/layout/Ensamblado'
import { DataTable } from '../components/tables/DataTable'
import { useBarraSuperior, useFiltros } from '../context/FiltrosContext'
import { analiticaApi } from '../features/analitica/api'
import { useApi } from '../hooks/useApi'
import { INDICADORES, fmtEntero, fmtIndicador, fmtUSDCompacto, periodoCorto } from '../utils/format'

const MAX_ZONAS = 10
const MIN_PERIODOS = 2
const MAX_PERIODOS = 12
const INDICADORES_INICIALES = ['total_creditos', 'creditos_atrasados', 'tasa_morosidad']
const PALETA = ['#1f70c4', '#e0a526', '#8f5bd6', '#2e9e6b', '#c8341c', '#0b8a9a', '#d9631f', '#5b6b85', '#b84d8f', '#6c8f1f']
const ejeY = (ind) => (ind === 'monto_cartera' || ind === 'saldo_vencido' ? fmtUSDCompacto : ind === 'tasa_morosidad' || ind === 'penetracion_pct' ? (v) => `${v}%` : fmtEntero)

function Alternar({ activo, onClick, children, deshabilitado }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-pressed={activo}
      className={`press inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${activo ? 'bg-white font-semibold text-brand-700 shadow-[0_6px_16px_-8px_rgb(16_34_61/0.4)]' : 'glass-control text-ink-2 hover:text-ink'}`}
    >
      {activo && <Check className="size-4" aria-hidden />}
      {children}
    </button>
  )
}

function Grupito({ titulo, contador, aviso, children }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 flex w-full flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{titulo}</span>
        <span className="tnum text-xs text-muted">{contador}</span>
      </legend>
      {children}
      {aviso && (
        <p role="status" className="text-xs font-medium text-warn-ink">
          {aviso}
        </p>
      )}
    </fieldset>
  )
}

function CeldaPeriodo({ indicador, valor, cambio }) {
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="font-semibold text-ink">{fmtIndicador(indicador, valor)}</span>
      {cambio && (
        <span className={`text-xs ${cambio.falta_informacion ? 'text-warn-ink' : 'text-muted'}`}>
          {cambio.falta_informacion ? 'Falta información' : `${fmtDiferencia(indicador, cambio.diferencia)} vs. ${periodoCorto(cambio.desde)}`}
        </span>
      )}
    </span>
  )
}

function BloqueIndicador({ indicador, datos, colores, reducido }) {
  const etiqueta = INDICADORES[indicador]?.etiqueta || indicador
  const serie = useMemo(
    () =>
      datos.periodos.map((p) => {
        const fila = { periodo: p }
        datos.zonas.forEach((z) => {
          const v = z.series.find((s) => s.indicador === indicador)?.valores.find((x) => x.periodo === p)?.valor
          fila[`z${z.zona.id}`] = v == null ? null : Number(v)
        })
        return fila
      }),
    [datos, indicador],
  )
  const filas = datos.zonas.map((z) => ({ id: z.zona.id, zona: z.zona, serie: z.series.find((s) => s.indicador === indicador), sinDatos: z.periodos_sin_datos }))
  const formatos = Object.fromEntries(datos.zonas.map((z) => [`z${z.zona.id}`, (v) => fmtIndicador(indicador, v)]))
  const columnas = [
    {
      clave: 'zona',
      titulo: 'Zona',
      movil: 'titulo',
      render: (f) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="size-3 shrink-0 rounded-full" style={{ background: colores[f.id] }} aria-hidden />
          <span className="min-w-0">
            <span className="block font-semibold text-ink">{f.zona.nombre}</span>
            <span className="block text-xs font-normal text-muted">{TIPOS_ZONA[f.zona.tipo_zona]}</span>
          </span>
        </span>
      ),
    },
    {
      clave: 'total',
      titulo: 'Cambio en el rango',
      render: (f) => (
        <span className="flex flex-col items-start gap-1">
          <Tendencia tendencia={f.serie?.total?.tendencia} falta={!f.serie?.total || f.serie.total.falta_informacion} />
          {f.serie?.total && !f.serie.total.falta_informacion && (
            <span className="tnum text-xs text-muted">
              {fmtDiferencia(indicador, f.serie.total.diferencia)} ({periodoCorto(f.serie.total.desde)} → {periodoCorto(f.serie.total.hasta)})
            </span>
          )}
        </span>
      ),
    },
    ...datos.periodos.map((p, i) => ({
      clave: p,
      titulo: periodoCorto(p),
      alinear: 'derecha',
      render: (f) => <CeldaPeriodo indicador={indicador} valor={f.serie?.valores.find((x) => x.periodo === p)?.valor} cambio={i > 0 ? f.serie?.cambios[i - 1] : null} />,
    })),
  ]

  return (
    <ChartCard titulo={etiqueta} subtitulo={`Valor por período, diferencia con el período anterior y tendencia · ${periodoCorto(datos.periodos[0])} a ${periodoCorto(datos.periodos.at(-1))}`}>
      <ChartLegend items={datos.zonas.map((z) => ({ etiqueta: z.zona.nombre, color: colores[z.zona.id], linea: true }))} />
      <div className="mt-3 h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(16,34,61,0.07)" />
            <XAxis dataKey="periodo" tickFormatter={periodoCorto} tick={{ fontSize: 12, fill: '#3b4c66' }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={ejeY(indicador)} tick={{ fontSize: 11, fill: '#55657d' }} tickLine={false} axisLine={false} width={64} />
            <Tooltip content={<ChartTooltip formatos={formatos} etiquetaX={periodoCorto} />} />
            {datos.zonas.map((z) => (
              <Line
                key={z.zona.id}
                dataKey={`z${z.zona.id}`}
                name={z.zona.nombre}
                type="monotone"
                stroke={colores[z.zona.id]}
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 6 }}
                connectNulls={false}
                isAnimationActive={!reducido}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted">Los períodos sin información se muestran como cortes en la línea; no se calcula diferencia con ellos.</p>
      <div className="glass-inset mt-4 rounded-card p-1 md:p-2">
        <DataTable etiqueta={`Comparación de ${etiqueta.toLowerCase()}`} columnas={columnas} filas={filas} />
      </div>
    </ChartCard>
  )
}

export default function Comparar() {
  const { periodos, seleccion } = useFiltros()
  const reducido = useReducedMotion()
  useBarraSuperior({}, [])
  const [selectorAbierto, setSelectorAbierto] = useState(false)
  const [zonasElegidas, setZonasElegidas] = useState(null)
  const [periodosElegidos, setPeriodosElegidos] = useState(null)
  const [indicadores, setIndicadores] = useState(INDICADORES_INICIALES)

  const zonasApi = useApi((signal) => api.get('/zonas/', { signal, cacheTtl: 120000 }), [])
  const todas = useMemo(() => zonasApi.data?.items || [], [zonasApi.data])
  const porId = useMemo(() => Object.fromEntries(todas.map((z) => [z.id, z])), [todas])

  // Sugerencias iniciales derivadas (sin efectos): la zona elegida en la barra o las dos primeras parroquias
  const sugeridas = useMemo(() => {
    if (seleccion.zonaId) return [seleccion.zonaId]
    const base = todas.filter((z) => z.tipo_zona === 'parroquia')
    return (base.length ? base : todas).slice(0, 2).map((z) => z.id)
  }, [seleccion.zonaId, todas])
  const zonas = zonasElegidas ?? sugeridas
  const periodosSel = periodosElegidos ?? periodos.items.slice(-3)

  const zonasValidas = zonas.length >= 1 && zonas.length <= MAX_ZONAS
  const periodosValidos = periodosSel.length >= MIN_PERIODOS && periodosSel.length <= MAX_PERIODOS
  const listo = zonasValidas && periodosValidos && indicadores.length > 0

  const { data, error, cargando, recargar } = useApi(
    (signal) => (listo ? analiticaApi.comparar({ zonas, periodos: [...periodosSel].sort(), indicadores }, signal) : Promise.resolve(null)),
    [listo, zonas.join(','), [...periodosSel].sort().join(','), indicadores.join(',')],
  )
  const colores = useMemo(() => Object.fromEntries(zonas.map((id, i) => [id, PALETA[i % PALETA.length]])), [zonas])

  const alternarPeriodo = (p) =>
    setPeriodosElegidos(periodosSel.includes(p) ? periodosSel.filter((x) => x !== p) : periodosSel.length >= MAX_PERIODOS ? periodosSel : [...periodosSel, p])
  const alternarIndicador = (k) => setIndicadores((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]))
  const quitarZona = (id) => setZonasElegidas(zonas.filter((x) => x !== id))
  const rapidos = [3, 6, 12].filter((n, i) => i === 0 || periodos.items.length > [3, 6, 12][i - 1])

  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina
        titulo="Evolución y comparación"
        subtitulo="Compare la evolución de indicadores entre zonas y períodos"
        insignias={
          <>
            <EtiquetaProvisional />
            <InsigniaDemo />
          </>
        }
      />

      <GlassPanel className="flex flex-col gap-6 p-5 md:p-6">
        <Grupito titulo="Zonas" contador={`${zonas.length} de ${MAX_ZONAS}`} aviso={zonas.length === 0 ? 'Elija al menos una zona para comparar.' : null}>
          <div className="flex flex-wrap items-center gap-2">
            {zonasApi.error && <ErrorState error={zonasApi.error} alReintentar={zonasApi.recargar} compacto />}
            {!zonasApi.data && !zonasApi.error && <LoadingState filas={1} alto="h-11" />}
            {zonas.map((id) => (
              <span key={id} className="glass-inset inline-flex min-h-11 items-center gap-2 rounded-full py-1 pr-1 pl-3 text-sm font-semibold text-ink">
                <span className="size-2.5 rounded-full" style={{ background: colores[id] }} aria-hidden />
                {porId[id]?.nombre || `Zona ${id}`}
                <button type="button" onClick={() => quitarZona(id)} className="press grid size-9 place-items-center rounded-full text-muted hover:bg-white hover:text-ink" aria-label={`Quitar ${porId[id]?.nombre || 'zona'}`}>
                  <X className="size-4" aria-hidden />
                </button>
              </span>
            ))}
            <GlassButton icono={Plus} onClick={() => setSelectorAbierto(true)} redondo disabled={!zonasApi.data}>
              {zonas.length ? 'Agregar o quitar zonas' : 'Elegir zonas'}
            </GlassButton>
          </div>
        </Grupito>

        <Grupito
          titulo="Períodos"
          contador={`${periodosSel.length} elegidos (mín. ${MIN_PERIODOS}, máx. ${MAX_PERIODOS})`}
          aviso={periodos.items.length > 0 && periodosSel.length < MIN_PERIODOS ? `Elija al menos ${MIN_PERIODOS} períodos para calcular diferencias.` : periodosSel.length >= MAX_PERIODOS ? `Máximo ${MAX_PERIODOS} períodos.` : null}
        >
          {periodos.items.length === 0 ? (
            <LoadingState filas={1} alto="h-11" />
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {periodos.items.map((p) => (
                  <Alternar key={p} activo={periodosSel.includes(p)} onClick={() => alternarPeriodo(p)} deshabilitado={!periodosSel.includes(p) && periodosSel.length >= MAX_PERIODOS}>
                    {periodoCorto(p)}
                  </Alternar>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1 text-sm">
                <span className="text-muted">Atajos:</span>
                {rapidos.map((n) => (
                  <GlassButton key={n} variante="fantasma" tam="sm" onClick={() => setPeriodosElegidos(periodos.items.slice(-n))}>
                    Últimos {Math.min(n, periodos.items.length)}
                  </GlassButton>
                ))}
              </div>
            </>
          )}
        </Grupito>

        <Grupito titulo="Indicadores" contador={`${indicadores.length} elegidos`} aviso={indicadores.length === 0 ? 'Elija al menos un indicador.' : null}>
          <div className="flex flex-wrap gap-2">
            {Object.entries(INDICADORES).map(([k, d]) => (
              <Alternar key={k} activo={indicadores.includes(k)} onClick={() => alternarIndicador(k)}>
                {d.etiqueta}
              </Alternar>
            ))}
          </div>
        </Grupito>
      </GlassPanel>

      <GlassCard className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
        <p className="flex items-start gap-3 text-sm text-ink-2">
          <MapPinned className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
          <span>
            Para ver en el mapa cómo cambiaron los pagos atrasados entre dos períodos, use la variable <strong className="text-ink">«Variación de pagos atrasados»</strong>.
          </span>
        </p>
        <Link to="/mapa" className="press inline-flex min-h-11 shrink-0 items-center gap-1 self-start rounded-full px-3 font-semibold text-sun-700 hover:underline sm:self-auto">
          Abrir el mapa <ArrowRight className="size-4" aria-hidden />
        </Link>
      </GlassCard>

      {!listo ? (
        <GlassPanel>
          <EmptyState icono={GitCompareArrows} titulo="Complete la selección" texto={`Elija de 1 a ${MAX_ZONAS} zonas, de ${MIN_PERIODOS} a ${MAX_PERIODOS} períodos y al menos un indicador para ver la comparación.`} />
        </GlassPanel>
      ) : error ? (
        <GlassPanel>
          <ErrorState error={error} alReintentar={recargar} />
        </GlassPanel>
      ) : !data || cargando ? (
        <GlassPanel className="p-5 md:p-6">
          <LoadingState filas={5} alto="h-12" />
        </GlassPanel>
      ) : (
        <Grupo className="flex flex-col gap-[var(--gap)]">
          {data.zonas.some((z) => z.periodos_sin_datos.length) && (
            <p role="status" className="rounded-card bg-sun-100 px-4 py-3 text-sm font-medium text-sun-700">
              Falta información en algunos períodos:{' '}
              {data.zonas
                .filter((z) => z.periodos_sin_datos.length)
                .map((z) => `${z.zona.nombre} (${z.periodos_sin_datos.map(periodoCorto).join(', ')})`)
                .join('; ')}
              . En esos casos no se calcula la diferencia.
            </p>
          )}
          {data.indicadores.map((ind) => (
            <BloqueIndicador key={ind} indicador={ind} datos={data} colores={colores} reducido={reducido} />
          ))}
        </Grupo>
      )}

      <SelectorZonas
        abierto={selectorAbierto}
        alCerrar={() => setSelectorAbierto(false)}
        zonas={todas}
        cargando={!zonasApi.data && !zonasApi.error}
        error={zonasApi.error}
        alReintentar={zonasApi.recargar}
        seleccion={zonas}
        alCambiar={setZonasElegidas}
        max={MAX_ZONAS}
      />
    </Ensamblado>
  )
}
