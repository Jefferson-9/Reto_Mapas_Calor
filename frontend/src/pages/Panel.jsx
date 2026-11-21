import { useReducedMotion } from 'motion/react'
import { ArrowRight, CircleDot } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarraProgreso, ChartCard, ChartLegend, ChartTooltip } from '../components/charts/ChartParts'
import { KpiCard } from '../components/charts/Kpi'
import { EmptyState, ErrorState, EtiquetaProvisional, InsigniaDemo, LoadingState } from '../components/feedback/Estados'
import { BotonExportar } from '../components/feedback/ExportarReporte'
import { Chip, GlassPanel } from '../components/glass/Glass'
import { Ensamblado, EncabezadoPagina, Grupo, Pieza } from '../components/layout/Ensamblado'
import { Segmentado } from '../components/layout/Pildora'
import { useBarraSuperior, useFiltros } from '../context/FiltrosContext'
import { analiticaApi } from '../features/analitica/api'
import { useApi } from '../hooks/useApi'
import { fmtEntero, fmtFecha, fmtPct, fmtUSD, fmtUSDCompacto, fmtUSDEntero, periodoCorto, periodoLargo } from '../utils/format'

const AZUL = '#1f70c4'
const ORO = '#e0a526'
const MORA = '#8f5bd6'

function chipVariacion(kpi, { invertir = false } = {}) {
  if (!kpi || kpi.variacion == null) return { tono: 'neutro', texto: 'Sin comparación' }
  const v = Number(kpi.variacion)
  const sufijo = kpi.tipo_variacion === 'puntos' ? ' pts' : '%'
  const texto = `${v > 0 ? '+' : ''}${v.toLocaleString('es-EC', { maximumFractionDigits: 2 })}${sufijo}`
  if (v === 0) return { tono: 'neutro', texto }
  const bueno = invertir ? v < 0 : v > 0
  return { tono: bueno ? 'verde' : 'rojo', texto }
}

export default function Panel() {
  const { periodo, seleccion } = useFiltros()
  const [nivel, setNivel] = useState('barrio')
  const reducido = useReducedMotion()
  useBarraSuperior({ geo: true, periodo: true, accion: BotonExportar }, [])
  const { data: d, error, cargando, recargar } = useApi((signal) => (periodo ? analiticaApi.panel({ periodo, nivel, zona: seleccion.zonaId }, signal) : Promise.resolve(null)), [periodo, nivel, seleccion.zonaId])

  const serie = useMemo(() => (d?.evolucion || []).map((e) => ({ ...e, monto: e.monto_cartera == null ? null : Number(e.monto_cartera), mora: e.tasa_morosidad == null ? null : Number(e.tasa_morosidad), pen: e.penetracion_pct == null ? null : Number(e.penetracion_pct), cre: e.total_creditos })), [d])
  const grafica = useMemo(() => (d?.grafica_zonas?.items || []).map((g) => ({ ...g, monto: Number(g.monto_cartera), mora: g.tasa_morosidad == null ? null : Number(g.tasa_morosidad) })), [d])
  const k = d?.kpis
  const listo = Boolean(d) && !cargando
  const mayorCartera = grafica[0]
  const mayorMora = [...grafica].filter((g) => g.mora != null).sort((a, b) => b.mora - a.mora)[0]

  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina
        titulo="Panel de resumen"
        subtitulo={`Indicadores de ${periodoLargo(periodo)} en su ámbito${d?.periodo_anterior ? ` · comparados con ${periodoCorto(d.periodo_anterior)}` : ''}`}
        insignias={
          <>
            <EtiquetaProvisional />
            <InsigniaDemo />
          </>
        }
      />
      {error && (
        <GlassPanel>
          <ErrorState error={error} alReintentar={recargar} />
        </GlassPanel>
      )}

      <Grupo className="grid grid-cols-1 gap-[var(--gap)] sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard etiqueta="Cartera vigente" valor={k?.monto_cartera?.valor} formato={fmtUSDEntero} chip={chipVariacion(k?.monto_cartera)} serie={serie} claveSerie="monto" color={AZUL} pie="Período anterior" pieValor={fmtUSD(k?.monto_cartera?.anterior)} cargando={!listo} />
        <KpiCard etiqueta="Tasa de morosidad" valor={k?.tasa_morosidad?.valor} formato={fmtPct} chip={chipVariacion(k?.tasa_morosidad, { invertir: true })} serie={serie} claveSerie="mora" color={MORA} pie="Saldo vencido" pieValor={fmtUSD(k?.saldo_vencido?.valor)} cargando={!listo} />
        <KpiCard etiqueta="Créditos activos" valor={k?.total_creditos?.valor} formato={fmtEntero} chip={chipVariacion(k?.total_creditos)} serie={serie} claveSerie="cre" color={ORO} pie="Con pagos atrasados" pieValor={fmtEntero(k?.creditos_atrasados?.valor)} cargando={!listo} />
        <KpiCard etiqueta="Penetración de socios" valor={k?.penetracion_pct?.valor} formato={fmtPct} chip={chipVariacion(k?.penetracion_pct)} serie={serie} claveSerie="pen" color="#2e9e6b" pie="Socios con ubicación válida" pieValor={fmtEntero(k?.total_socios?.valor)} cargando={!listo} />
      </Grupo>

      <div className="grid grid-cols-1 gap-[var(--gap)] xl:grid-cols-12">
        <ChartCard
          className="xl:col-span-8"
          titulo="Cartera y morosidad por zona"
          subtitulo={`Monto de cartera frente a tasa de morosidad · ${periodoCorto(periodo)}`}
          controles={<Segmentado etiqueta="Nivel geográfico" valor={nivel} alCambiar={setNivel} opciones={[{ valor: 'barrio', etiqueta: 'Barrios' }, { valor: 'parroquia', etiqueta: 'Parroquias' }]} />}
          pie={
            listo && grafica.length > 0 && (
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <Pieza className="glass-inset rounded-card p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink"><CircleDot className="size-4 text-ok" aria-hidden /> Mayor cartera: {mayorCartera.zona}</p>
                  <p className="mt-1 text-sm text-muted">{fmtUSD(mayorCartera.monto)} en {fmtEntero(mayorCartera.total_creditos)} créditos activos, con {fmtPct(mayorCartera.mora)} de morosidad.</p>
                </Pieza>
                {mayorMora && (
                  <Pieza className="glass-inset rounded-card p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold text-ink"><CircleDot className="size-4 text-danger" aria-hidden /> Mayor morosidad: {mayorMora.zona}</p>
                    <p className="mt-1 text-sm text-muted">{fmtPct(mayorMora.mora)} de morosidad sobre {fmtUSD(mayorMora.monto)} de cartera.</p>
                  </Pieza>
                )}
              </div>
            )
          }
        >
          <ChartLegend items={[{ etiqueta: 'Monto de cartera (USD)', color: ORO }, { etiqueta: 'Tasa de morosidad (%)', color: MORA, linea: true }]} />
          <div className="mt-3 h-[300px]">
            {!listo ? (
              <LoadingState filas={5} alto="h-12" />
            ) : grafica.length === 0 ? (
              <EmptyState titulo="Sin datos" texto="No hay indicadores para el período y la zona elegidos." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={grafica} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e9b04a" />
                      <stop offset="100%" stopColor="#d99a3a" stopOpacity={0.75} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="rgba(16,34,61,0.07)" />
                  <XAxis dataKey="zona" tick={{ fontSize: 12, fill: '#3b4c66' }} tickLine={false} axisLine={false} interval={0} height={44} tickFormatter={(v) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)} />
                  <YAxis yAxisId="m" tick={{ fontSize: 11, fill: '#55657d' }} tickLine={false} axisLine={false} tickFormatter={fmtUSDCompacto} width={64} />
                  <YAxis yAxisId="p" orientation="right" tick={{ fontSize: 11, fill: '#55657d' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={42} />
                  <Tooltip content={<ChartTooltip formatos={{ monto: fmtUSD, mora: fmtPct }} />} cursor={{ fill: 'rgba(255,255,255,0.45)' }} />
                  <Bar yAxisId="m" dataKey="monto" name="Cartera" fill="url(#gBar)" radius={[14, 14, 6, 6]} maxBarSize={56} isAnimationActive={!reducido} animationDuration={900} />
                  <Line yAxisId="p" dataKey="mora" name="Morosidad" type="monotone" stroke={MORA} strokeWidth={3} dot={{ r: 5, fill: '#fff', stroke: MORA, strokeWidth: 2.5 }} activeDot={{ r: 7 }} isAnimationActive={!reducido} animationDuration={1100} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>

        <GlassPanel className="flex flex-col p-5 md:p-6 xl:col-span-4">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold tracking-[-0.02em]">Zonas prioritarias</h2>
              <p className="text-sm text-muted">{d?.criterios_version ? `Criterios vigentes v${d.criterios_version.version}` : 'Clasificación'}</p>
            </div>
            <Chip tono="azul">{periodoCorto(periodo)}</Chip>
          </div>
          {!listo ? (
            <LoadingState filas={4} alto="h-20" />
          ) : d.mensaje_clasificacion ? (
            <EmptyState titulo="Sin clasificación" texto={d.mensaje_clasificacion} />
          ) : d.zonas_prioritarias.length === 0 ? (
            <EmptyState titulo="Sin zonas" texto="No hay zonas clasificadas en este filtro." />
          ) : (
            <Grupo as="ul" escalon={0.04} className="flex flex-col gap-3">
              {d.zonas_prioritarias.map((z) => (
                <Pieza as="li" key={z.zona.id} className="glass-inset rounded-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{z.zona.nombre}</p>
                      <p className="truncate text-xs text-muted">{z.zona.ruta}</p>
                    </div>
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-ink-2 shadow-sm">{z.orden_atencion}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    {z.categoria ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-0.5 font-semibold" style={{ color: z.categoria.color_hex }}>
                        <span className="size-2 rounded-full" style={{ background: z.categoria.color_hex }} aria-hidden />
                        {z.categoria.nombre}
                      </span>
                    ) : (
                      <Chip>Sin clasificar</Chip>
                    )}
                    <span className="tnum text-muted">
                      Mora {fmtPct(z.indicadores?.tasa_morosidad)} · Pen. {fmtPct(z.indicadores?.penetracion_pct)}
                    </span>
                  </div>
                </Pieza>
              ))}
            </Grupo>
          )}
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/80 pt-4 text-sm">
            <span className="text-muted">Última carga: {fmtFecha(d?.ultima_carga_at)}</span>
            <Link to="/clasificacion" className="press inline-flex min-h-11 items-center gap-1 font-semibold text-sun-700 hover:underline">
              Ver clasificación <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </GlassPanel>
      </div>

      <div className="grid grid-cols-1 gap-[var(--gap)] xl:grid-cols-12">
        <ChartCard className="xl:col-span-7" titulo="Evolución mensual" subtitulo="Cartera vigente y tasa de morosidad de los períodos disponibles">
          <div className="h-[260px]">
            {!listo ? (
              <LoadingState filas={4} alto="h-12" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={serie} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(16,34,61,0.07)" />
                  <XAxis dataKey="periodo" tickFormatter={periodoCorto} tick={{ fontSize: 12, fill: '#3b4c66' }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="m" tickFormatter={fmtUSDCompacto} tick={{ fontSize: 11, fill: '#55657d' }} tickLine={false} axisLine={false} width={64} />
                  <YAxis yAxisId="p" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#55657d' }} tickLine={false} axisLine={false} width={42} />
                  <Tooltip content={<ChartTooltip formatos={{ monto: fmtUSD, mora: fmtPct }} etiquetaX={periodoCorto} />} cursor={{ fill: 'rgba(255,255,255,0.45)' }} />
                  <Bar yAxisId="m" dataKey="monto" name="Cartera" fill={AZUL} fillOpacity={0.85} radius={[10, 10, 4, 4]} maxBarSize={40} isAnimationActive={!reducido} />
                  <Line yAxisId="p" dataKey="mora" name="Morosidad" stroke={MORA} strokeWidth={3} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} isAnimationActive={!reducido} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>

        <ChartCard className="xl:col-span-5" titulo="Zonas por categoría" subtitulo="Distribución según los criterios vigentes" controles={<EtiquetaProvisional texto="Umbrales DEMO" detalle="Los umbrales de los criterios del seed son de demostración y no oficiales." />}>
          {!listo ? (
            <LoadingState filas={3} />
          ) : d.distribucion_categorias.length === 0 ? (
            <EmptyState titulo="Sin clasificación" texto="No hay criterios aprobados." />
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="h-[200px] w-[200px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={d.distribucion_categorias} dataKey="zonas" nameKey="categoria" innerRadius={58} outerRadius={92} paddingAngle={3} cornerRadius={8} isAnimationActive={!reducido} stroke="none">
                      {d.distribucion_categorias.map((c) => (
                        <Cell key={c.categoria} fill={c.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip formatos={{ zonas: (v) => `${v} zonas` }} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex w-full flex-col gap-2">
                {d.distribucion_categorias.map((c) => (
                  <li key={c.categoria} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="size-3 rounded-[4px]" style={{ background: c.color }} aria-hidden />
                      {c.categoria}
                    </span>
                    <span className="tnum font-semibold">{c.zonas}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard titulo="Penetración de socios por parroquia" subtitulo="Socios con ubicación válida frente a hogares estimados" controles={<EtiquetaProvisional />}>
        {!listo ? (
          <LoadingState filas={4} />
        ) : (
          <Grupo as="ul" escalon={0.05} className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
            {d.penetracion_parroquias.map((p) => (
              <Pieza as="li" key={p.zona_id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold text-ink">{p.zona}</span>
                  <span className="tnum text-muted">
                    <span className="font-semibold text-ink">{fmtPct(p.penetracion_pct)}</span> · {fmtEntero(p.total_socios)} socios
                  </span>
                </div>
                <BarraProgreso valor={p.penetracion_pct == null ? null : Number(p.penetracion_pct)} max={Math.max(15, ...d.penetracion_parroquias.map((x) => Number(x.penetracion_pct || 0)))} etiqueta={`Penetración en ${p.zona}`} />
              </Pieza>
            ))}
          </Grupo>
        )}
        {listo && d.excluidos?.socios_sin_zona > 0 && <p className="mt-4 text-xs text-muted">{fmtEntero(d.excluidos.socios_sin_zona)} socios sin zona válida están excluidos de mapas e indicadores.</p>}
      </ChartCard>
    </Ensamblado>
  )
}
