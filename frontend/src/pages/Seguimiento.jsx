import { ArrowDown, ArrowUp, ClipboardList, GitCompareArrows, Minus, TriangleAlert, UserRound } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { RangoFechas } from '../components/campo/RangoFechas'
import { BarraProgreso } from '../components/charts/ChartParts'
import { KpiCard } from '../components/charts/Kpi'
import { EmptyState, ErrorState, EtiquetaProvisional, FuncionBloqueada } from '../components/feedback/Estados'
import { GlassButton, GlassPanel } from '../components/glass/Glass'
import { Ensamblado, EncabezadoPagina, Grupo } from '../components/layout/Ensamblado'
import { PildoraSelect } from '../components/layout/Pildora'
import { DataTable } from '../components/tables/DataTable'
import { useBarraSuperior, useFiltros } from '../context/FiltrosContext'
import { campoApi, fmtDia, hoyISO, inicioMesISO } from '../features/campo/api'
import { useApi } from '../hooks/useApi'
import { fmtEntero, fmtIndicador, fmtPct, INDICADORES, periodoCorto } from '../utils/format'

const MENSAJE_BLOQUEO = 'El seguimiento de visitas no está habilitado: requiere la aprobación de la cooperativa. Un administrador puede activarlo en Parámetros cuando exista esa aprobación.'
const ADVERTENCIA_RESPALDO = 'Los cambios observados entre los períodos no demuestran por sí solos que se deban a las visitas.'

function Diferencia({ fila }) {
  if (fila.diferencia == null) return <span className="text-muted">Sin datos</span>
  const d = Number(fila.diferencia)
  const Icono = d > 0 ? ArrowUp : d < 0 ? ArrowDown : Minus
  const texto = d > 0 ? 'Sube' : d < 0 ? 'Baja' : 'Sin cambio'
  return (
    <span className="tnum inline-flex items-center gap-1 font-semibold text-ink">
      <Icono className="size-4" aria-hidden />
      {d > 0 ? '+' : ''}
      {fmtIndicador(fila.indicador, d)}
      <span className="text-xs font-normal text-muted">({texto})</span>
    </span>
  )
}

/** Comparación antes/después de una zona con la advertencia obligatoria de no causalidad (RF-018.04/05). */
function AntesDespues({ zonaId, alCambiarZona }) {
  const { periodos } = useFiltros()
  const [antesSel, setAntesSel] = useState(null)
  const [despuesSel, setDespuesSel] = useState(null)
  const lista = periodos.items
  const despues = despuesSel ?? lista[lista.length - 1] ?? null
  const antes = antesSel ?? lista[Math.max(0, lista.indexOf(despues) - 1)] ?? null
  const iguales = antes && despues && antes === despues
  const barrios = useApi((s) => campoApi.zonas('barrio', s), [])
  const opcionesZona = useMemo(() => (barrios.data?.items || []).map((z) => ({ valor: z.id, etiqueta: z.nombre, detalle: z.codigo })), [barrios.data])
  const opcionesPeriodo = useMemo(() => [...lista].reverse().map((p) => ({ valor: p, etiqueta: periodoCorto(p) })), [lista])
  const ad = useApi((s) => (zonaId && antes && despues && !iguales ? campoApi.antesDespues(zonaId, antes, despues, s) : Promise.resolve(null)), [zonaId, antes, despues, iguales])
  const filas = useMemo(() => (ad.data?.comparacion || []).map((c) => ({ ...c, id: c.indicador })), [ad.data])

  return (
    <GlassPanel className="p-4 md:p-6" aria-labelledby="ad-titulo">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="ad-titulo" className="flex items-center gap-2 text-lg font-bold tracking-[-0.02em]">
            <GitCompareArrows className="size-5 text-brand-600" aria-hidden /> Antes y después de una zona
          </h2>
          <p className="text-sm text-muted">Indicadores de la zona en dos períodos</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PildoraSelect prefijo="Zona" etiquetaAccesible="Zona a comparar" valor={zonaId} opciones={opcionesZona} alCambiar={alCambiarZona} todos={null} ancho={300} />
          <PildoraSelect prefijo="Antes" etiquetaAccesible="Período anterior" valor={antes} opciones={opcionesPeriodo} alCambiar={setAntesSel} todos={null} />
          <PildoraSelect prefijo="Después" etiquetaAccesible="Período posterior" valor={despues} opciones={opcionesPeriodo} alCambiar={setDespuesSel} todos={null} />
        </div>
      </div>

      {/* Advertencia de no causalidad: siempre visible y destacada (RF-018.05) */}
      <div role="note" aria-label="Advertencia sobre la interpretación" className="mb-4 flex items-start gap-3 rounded-card border-2 border-warn/60 bg-sun-100 px-4 py-3 text-sm font-semibold text-warn-ink">
        <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>
          <span className="block text-xs font-bold tracking-wide uppercase">Importante: no implica causalidad</span>
          {ad.data?.advertencia || ADVERTENCIA_RESPALDO}
        </p>
      </div>

      {!zonaId ? (
        <EmptyState icono={GitCompareArrows} titulo="Elija una zona" texto="Seleccione una zona arriba o use «Comparar» en una visita pendiente." />
      ) : iguales ? (
        <p role="alert" className="rounded-card bg-[#fbe9e5] px-4 py-3 text-sm font-medium text-danger-ink">Elija dos períodos distintos para comparar.</p>
      ) : ad.error ? (
        <ErrorState error={ad.error} alReintentar={ad.recargar} compacto />
      ) : (
        <>
          {ad.data?.falta_informacion?.length > 0 && !ad.cargando && (
            <p role="status" className="mb-3 rounded-card bg-white/60 px-4 py-2.5 text-sm text-ink-2">
              No hay datos de {ad.data.falta_informacion.map(periodoCorto).join(' ni de ')} para esta zona; esos valores aparecen como «Sin datos».
            </p>
          )}
          <DataTable
            etiqueta={`Comparación entre ${periodoCorto(antes)} y ${periodoCorto(despues)}`}
            filas={filas}
            cargando={ad.cargando || !ad.data}
            columnas={[
              { clave: 'indicador', titulo: 'Indicador', movil: 'titulo', render: (f) => INDICADORES[f.indicador]?.etiqueta || f.indicador },
              { clave: 'antes', titulo: periodoCorto(antes), alinear: 'derecha', render: (f) => fmtIndicador(f.indicador, f.antes) },
              { clave: 'despues', titulo: periodoCorto(despues), alinear: 'derecha', render: (f) => fmtIndicador(f.indicador, f.despues) },
              { clave: 'diferencia', titulo: 'Diferencia', alinear: 'derecha', render: (f) => <Diferencia fila={f} /> },
            ]}
          />
        </>
      )}
    </GlassPanel>
  )
}

/** CU-18 (condicionado): visitas previstas frente a realizadas por oficial y rango de fechas. */
export default function Seguimiento() {
  const [hoy] = useState(hoyISO)
  const [desde, setDesde] = useState(inicioMesISO)
  const [hasta, setHasta] = useState(hoyISO)
  const [oficial, setOficial] = useState(null)
  const [zonaComp, setZonaComp] = useState(null)
  const compRef = useRef(null)

  const ofs = useApi((s) => campoApi.oficiales(s), [])
  const opcionesOf = useMemo(() => (ofs.data?.items || []).map((o) => ({ valor: o.id, etiqueta: o.nombre_completo, detalle: o.agencia?.nombre })), [ofs.data])
  useBarraSuperior(
    {
      extra: (
        <>
          <PildoraSelect prefijo="Oficial" icono={UserRound} etiquetaAccesible="Oficial" valor={oficial} opciones={opcionesOf} alCambiar={setOficial} todos="Todos" ancho={300} />
          <RangoFechas desde={desde} hasta={hasta} alCambiarDesde={setDesde} alCambiarHasta={setHasta} max={hoy} />
        </>
      ),
    },
    [oficial, opcionesOf, desde, hasta, hoy],
  )

  const rangoOk = Boolean(desde && hasta && desde <= hasta)
  const seg = useApi((s) => (rangoOk ? campoApi.seguimiento({ oficial, desde, hasta }, s) : Promise.resolve(null)), [oficial, desde, hasta, rangoOk])
  const d = seg.data
  const listo = Boolean(d) && !seg.cargando
  const pendientes = useMemo(() => (d?.pendientes || []).map((p) => ({ ...p, id: `${p.ruta_id}-${p.zona_id}` })), [d])
  const nombreOficial = opcionesOf.find((o) => o.valor === oficial)?.etiqueta

  const comparar = (zonaId) => {
    setZonaComp(zonaId)
    setTimeout(() => compRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  if (seg.error?.code === 'VISITAS_DESHABILITADAS') {
    return (
      <Ensamblado className="flex flex-col gap-[var(--gap)]">
        <EncabezadoPagina titulo="Seguimiento de visitas" />
        <GlassPanel>
          <FuncionBloqueada titulo="Función no habilitada" mensaje={MENSAJE_BLOQUEO} />
        </GlassPanel>
      </Ensamblado>
    )
  }

  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina
        titulo="Seguimiento de visitas"
        subtitulo={`${nombreOficial || 'Todos los oficiales de su ámbito'} · ${fmtDia(desde)} – ${fmtDia(hasta)}`}
        insignias={<EtiquetaProvisional texto="Función condicionada" detalle="Las visitas previstas provienen de las rutas activas con fecha prevista dentro del rango." />}
      />

      {!rangoOk && (
        <p role="alert" className="rounded-card bg-[#fbe9e5] px-4 py-3 text-sm font-medium text-danger-ink">
          Elija un rango válido: la fecha inicial debe ser anterior o igual a la final.
        </p>
      )}
      {seg.error && (
        <GlassPanel>
          <ErrorState error={seg.error} alReintentar={seg.recargar} />
        </GlassPanel>
      )}

      <Grupo className="grid grid-cols-1 gap-[var(--gap)] sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard etiqueta="Visitas previstas" valor={d?.previstas} formato={fmtEntero} pie="Pendientes" pieValor={listo ? fmtEntero(pendientes.length) : '—'} cargando={!listo && rangoOk} />
        <KpiCard etiqueta="Visitas realizadas" valor={d?.realizadas} formato={fmtEntero} pie="Visitas registradas en el rango" pieValor={listo ? fmtEntero(d.visitas_registradas) : '—'} cargando={!listo && rangoOk} />
        <KpiCard
          etiqueta="Cumplimiento"
          valor={d?.porcentaje}
          formato={fmtPct}
          chip={listo ? (d.porcentaje == null ? { tono: 'neutro', texto: 'Sin previstas' } : { tono: d.porcentaje >= 80 ? 'verde' : d.porcentaje >= 50 ? 'ambar' : 'rojo', texto: d.porcentaje >= 80 ? 'Alto' : d.porcentaje >= 50 ? 'Medio' : 'Bajo' }) : null}
          pie="Realizadas / previstas"
          pieValor={listo ? `${fmtEntero(d.realizadas)} de ${fmtEntero(d.previstas)}` : '—'}
          cargando={!listo && rangoOk}
        />
        <KpiCard etiqueta="No realizadas" valor={d?.no_realizadas} formato={fmtEntero} pie="Del total registrado" pieValor={listo ? `${fmtEntero(d.no_realizadas)} de ${fmtEntero(d.visitas_registradas)}` : '—'} cargando={!listo && rangoOk} />
      </Grupo>

      {listo && d.porcentaje != null && (
        <GlassPanel className="flex flex-col gap-2 p-4 md:p-5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold text-ink">Avance de visitas previstas</span>
            <span className="tnum font-semibold text-ink">{fmtPct(d.porcentaje)}</span>
          </div>
          <BarraProgreso valor={Number(d.porcentaje)} max={100} etiqueta="Porcentaje de visitas previstas realizadas" />
        </GlassPanel>
      )}

      <GlassPanel className="p-2 md:p-3" aria-labelledby="pend-titulo">
        <div className="px-3 pt-3 pb-2">
          <h2 id="pend-titulo" className="flex items-center gap-2 text-lg font-bold tracking-[-0.02em]">
            <ClipboardList className="size-5 text-brand-600" aria-hidden /> Zonas pendientes
          </h2>
          <p className="text-sm text-muted">Previstas en rutas del rango que aún no tienen una visita realizada</p>
        </div>
        <DataTable
          etiqueta="Zonas pendientes de visita"
          filas={pendientes}
          cargando={rangoOk && !listo && !seg.error}
          vacio={
            <EmptyState
              icono={ClipboardList}
              titulo={d?.previstas ? 'Sin pendientes' : 'Sin visitas previstas'}
              texto={d?.previstas ? 'Todas las visitas previstas del rango tienen una visita realizada.' : 'No hay rutas activas con fecha prevista en este rango para el filtro elegido.'}
            />
          }
          columnas={[
            { clave: 'zona', titulo: 'Zona', movil: 'titulo' },
            { clave: 'fecha_prevista', titulo: 'Fecha prevista', render: (p) => fmtDia(p.fecha_prevista) },
            { clave: 'oficial', titulo: 'Oficial' },
            { clave: 'ruta', titulo: 'Ruta' },
          ]}
          acciones={(p) => (
            <GlassButton tam="sm" variante="fantasma" icono={GitCompareArrows} onClick={() => comparar(p.zona_id)} aria-label={`Comparar antes y después en ${p.zona}`}>
              Comparar
            </GlassButton>
          )}
        />
      </GlassPanel>

      <div ref={compRef} className="scroll-mt-28">
        <AntesDespues zonaId={zonaComp} alCambiarZona={setZonaComp} />
      </div>
    </Ensamblado>
  )
}
