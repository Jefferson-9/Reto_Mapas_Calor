import { AnimatePresence, motion } from 'motion/react'
import { Flame, Layers, MapPinned, Shapes, Table2, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ErrorState, EtiquetaProvisional, InsigniaDemo } from '../components/feedback/Estados'
import { BotonExportar } from '../components/feedback/ExportarReporte'
import { Chip, GlassPanel } from '../components/glass/Glass'
import { Ensamblado, EncabezadoPagina } from '../components/layout/Ensamblado'
import { PildoraSelect, Segmentado } from '../components/layout/Pildora'
import { GeoMap } from '../components/maps/GeoMap'
import { MapLegend } from '../components/maps/MapLegend'
import { DataTable } from '../components/tables/DataTable'
import { useAuth } from '../context/AuthContext'
import { useBarraSuperior, useFiltros } from '../context/FiltrosContext'
import { analiticaApi } from '../features/analitica/api'
import { useApi, useMediaQuery } from '../hooks/useApi'
import { fmtEntero, fmtIndicador, fmtPct, fmtUSD, periodoCorto } from '../utils/format'
import { spring } from '../utils/motion'

const VARIABLES = [
  { valor: 'total_socios', etiqueta: 'Concentración de socios' },
  { valor: 'total_creditos', etiqueta: 'Número de créditos' },
  { valor: 'monto_cartera', etiqueta: 'Monto de créditos' },
  { valor: 'creditos_atrasados', etiqueta: 'Pagos atrasados' },
  { valor: 'tasa_morosidad', etiqueta: 'Tasa de morosidad' },
  { valor: 'var_atrasados', etiqueta: 'Variación de pagos atrasados' },
]
const formatoVariable = (v) => (x) => (v === 'var_atrasados' ? `${x > 0 ? '+' : ''}${fmtEntero(x)}` : fmtIndicador(v, x))

function Toggle({ activo, onClick, icono: Icono, children, deshabilitado, titulo }) {
  return (
    <button type="button" onClick={onClick} disabled={deshabilitado} aria-pressed={activo} title={titulo} className={`press flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium disabled:opacity-45 ${activo ? 'bg-white text-brand-700 shadow-[0_6px_16px_-8px_rgb(16_34_61/0.4)]' : 'text-ink-2 hover:bg-white/60'}`}>
      <Icono className="size-4" aria-hidden />
      {children}
    </button>
  )
}

function DetalleZona({ zonaId, periodo, alCerrar }) {
  const { data, error, cargando } = useApi((s) => analiticaApi.detalleZona(zonaId, periodo, s), [zonaId, periodo])
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted">{data?.ruta?.join(' › ')}</p>
          <h2 className="text-lg font-bold">{data?.zona?.nombre || 'Zona'}</h2>
        </div>
        <button type="button" onClick={alCerrar} className="press grid size-11 place-items-center rounded-full hover:bg-white/70" aria-label="Cerrar detalle">
          <X className="size-5" />
        </button>
      </div>
      {error && <ErrorState error={error} compacto />}
      {cargando && <p className="text-sm text-muted">Cargando…</p>}
      {data && (
        <>
          {data.categoria && (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold" style={{ color: data.categoria.color_hex }}>
              <span className="size-2 rounded-full" style={{ background: data.categoria.color_hex }} aria-hidden />
              {data.categoria.nombre}
            </span>
          )}
          {data.sin_datos ? (
            <p className="rounded-card bg-white/60 p-3 text-sm text-ink-2">Sin datos para {periodoCorto(periodo)} en esta zona.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-2">
              {[
                ['Socios', fmtEntero(data.indicadores.total_socios)],
                ['Créditos activos', fmtEntero(data.indicadores.total_creditos)],
                ['Monto de cartera', fmtUSD(data.indicadores.monto_cartera)],
                ['Con pagos atrasados', fmtEntero(data.indicadores.creditos_atrasados)],
                ['Tasa de morosidad', fmtPct(data.indicadores.tasa_morosidad)],
                ['Penetración', fmtPct(data.indicadores.penetracion_pct)],
              ].map(([k, v]) => (
                <div key={k} className="glass-inset rounded-2xl p-3">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="tnum text-base font-bold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {data.prospectos != null && <p className="text-sm text-muted">{fmtEntero(data.prospectos)} posibles socios registrados.</p>}
        </>
      )}
    </div>
  )
}

export default function Mapa() {
  const { periodo, periodos, seleccion } = useFiltros()
  const { usuario } = useAuth()
  const individuales = ['admin', 'jefe_agencia', 'oficial'].includes(usuario.rol.codigo)
  const movil = useMediaQuery('(max-width: 767px)')
  const [variable, setVariable] = useState('total_socios')
  const [comparar, setComparar] = useState(null)
  const [nivel, setNivel] = useState('barrio')
  const [capas, setCapas] = useState({ zonas: true, calor: true, puntos: false, prospectos: false })
  const [zona, setZona] = useState(null)
  const [tabla, setTabla] = useState(false)
  const [vista, setVista] = useState(null)
  const [puntos, setPuntos] = useState(undefined)
  const [prospectos, setProspectos] = useState(undefined)
  const [avisoPuntos, setAvisoPuntos] = useState(null)
  const mapRef = useRef(null)

  const periodoComparar = variable === 'var_atrasados' ? comparar || periodos.items[Math.max(0, periodos.items.indexOf(periodo) - 1)] : null
  const opsVariable = VARIABLES.map((v) => ({ valor: v.valor, etiqueta: v.etiqueta }))
  useBarraSuperior(
    {
      geo: true,
      periodo: true,
      accion: BotonExportar,
      extra: <PildoraSelect prefijo="Variable" etiquetaAccesible="Variable del mapa" valor={variable} opciones={opsVariable} alCambiar={setVariable} todos={null} ancho={280} />,
    },
    [variable],
  )

  const { data, error, recargar } = useApi(
    (s) => (periodo ? analiticaApi.mapaZonas({ periodo, nivel, padre: seleccion.zonaId, variable, periodo_comparar: periodoComparar }, s) : Promise.resolve(null)),
    [periodo, nivel, seleccion.zonaId, variable, periodoComparar],
  )

  // Puntos individuales solo con la capa activa, zoom cercano y bbox acotado
  const cerca = Boolean(vista && vista.zoom >= 13)
  useEffect(() => {
    if (!cerca) return undefined
    const ctrl = new AbortController()
    const bbox = vista.bbox.map((n) => n.toFixed(5)).join(',')
    if (capas.puntos && individuales)
      analiticaApi
        .mapaPuntos({ tipo: 'socios', bbox, periodo }, ctrl.signal)
        .then((r) => {
          setPuntos(r)
          setAvisoPuntos(r.truncado ? `Se muestran ${r.features.length} de ${r.total_en_area} socios del área; acérquese para ver todos.` : null)
        })
        .catch(() => {})
    if (capas.prospectos && individuales) analiticaApi.mapaPuntos({ tipo: 'prospectos', bbox }, ctrl.signal).then(setProspectos).catch(() => {})
    return () => ctrl.abort()
  }, [cerca, vista, capas.puntos, capas.prospectos, individuales, periodo])

  const alMover = useCallback((bbox, zoom) => setVista({ bbox, zoom }), [])
  const alZona = useCallback((id) => setZona(id), [])
  const fmt = useMemo(() => formatoVariable(variable), [variable])
  const filasTabla = useMemo(() => (data?.zonas.features || []).map((f) => f.properties), [data])
  const encuadre = `${seleccion.zonaId}-${nivel}`

  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina
        titulo="Mapa y mapa de calor"
        subtitulo={`${VARIABLES.find((v) => v.valor === variable)?.etiqueta} · ${periodoCorto(periodo)}${periodoComparar ? ` frente a ${periodoCorto(periodoComparar)}` : ''}`}
        insignias={
          <>
            <EtiquetaProvisional />
            {data?.demo && <InsigniaDemo />}
          </>
        }
        extra={
          <>
            <Segmentado etiqueta="Nivel geográfico" valor={nivel} alCambiar={setNivel} opciones={[{ valor: 'barrio', etiqueta: 'Barrios' }, { valor: 'parroquia', etiqueta: 'Parroquias' }, { valor: 'canton', etiqueta: 'Cantones' }]} />
            <Toggle activo={tabla} onClick={() => setTabla((t) => !t)} icono={Table2}>
              {tabla ? 'Ver mapa' : 'Ver tabla'}
            </Toggle>
          </>
        }
      />

      {error && (
        <GlassPanel>
          <ErrorState error={error} alReintentar={recargar} />
        </GlassPanel>
      )}
      {data?.sin_datos_suficientes && (
        <p role="status" className="rounded-card bg-sun-100 px-4 py-3 text-sm font-medium text-sun-700">
          {data.mensaje}
        </p>
      )}

      {tabla ? (
        <GlassPanel className="p-2 md:p-3">
          <DataTable
            etiqueta="Zonas del mapa"
            filas={filasTabla}
            cargando={!data && !error}
            columnas={[
              { clave: 'nombre', titulo: 'Zona', movil: 'titulo' },
              { clave: 'valor', titulo: data?.variable_etiqueta || 'Valor', alinear: 'derecha', render: (f) => (f.sin_datos ? 'Sin datos' : fmt(f.valor)) },
              { clave: 'cat', titulo: 'Categoría', render: (f) => f.categoria || '—' },
              { clave: 'soc', titulo: 'Socios', alinear: 'derecha', render: (f) => fmtEntero(f.indicadores?.total_socios) },
              { clave: 'mor', titulo: 'Morosidad', alinear: 'derecha', render: (f) => fmtPct(f.indicadores?.tasa_morosidad) },
            ]}
          />
        </GlassPanel>
      ) : (
        <GlassPanel className="relative h-[calc(100dvh-230px)] min-h-[420px] overflow-hidden p-0 md:h-[calc(100dvh-var(--bar-h)-170px)]">
          <GeoMap
            ref={mapRef}
            zonas={data?.zonas}
            leyenda={data?.leyenda}
            calor={data?.calor}
            maxPeso={data?.max_peso}
            puntos={cerca && capas.puntos ? puntos : undefined}
            prospectos={cerca && capas.prospectos ? prospectos : undefined}
            capas={capas}
            seleccion={zona}
            encuadre={encuadre}
            onZona={alZona}
            onMover={alMover}
            etiqueta={`Mapa de ${data?.variable_etiqueta || 'indicadores'}`}
            fallback={<p className="p-6 text-sm">Su navegador no admite WebGL. Use «Ver tabla» para consultar los mismos datos.</p>}
          />
          {/* Controles flotantes de cristal */}
          <div className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-80px)] flex-wrap gap-1 rounded-full glass-strong p-1">
            <Toggle activo={capas.zonas} onClick={() => setCapas((c) => ({ ...c, zonas: !c.zonas }))} icono={Shapes}>Zonas</Toggle>
            <Toggle activo={capas.calor} onClick={() => setCapas((c) => ({ ...c, calor: !c.calor }))} icono={Flame}>Calor</Toggle>
            {individuales && (
              <>
                <Toggle activo={capas.puntos} onClick={() => setCapas((c) => ({ ...c, puntos: !c.puntos }))} icono={Users} titulo="Visible con zoom cercano">Socios</Toggle>
                <Toggle activo={capas.prospectos} onClick={() => setCapas((c) => ({ ...c, prospectos: !c.prospectos }))} icono={MapPinned} titulo="Visible con zoom cercano">Posibles socios</Toggle>
              </>
            )}
          </div>
          {variable === 'var_atrasados' && (
            <div className="absolute top-[68px] left-3 z-10">
              <PildoraSelect prefijo="Comparar con" valor={periodoComparar} opciones={periodos.items.filter((p) => p !== periodo).map((p) => ({ valor: p, etiqueta: periodoCorto(p) }))} alCambiar={setComparar} todos={null} />
            </div>
          )}
          {(capas.puntos || capas.prospectos) && (vista?.zoom ?? 0) < 13 && (
            <p className="glass-strong absolute top-[68px] right-3 z-10 hidden rounded-xl px-3 py-1.5 text-xs font-medium sm:block">
              <Layers className="mr-1 inline size-3.5" aria-hidden />
              Acérquese para ver los puntos individuales
            </p>
          )}
          {avisoPuntos && capas.puntos && cerca && <p className="glass-strong absolute top-[68px] right-3 z-10 rounded-xl px-3 py-1.5 text-xs font-medium">{avisoPuntos}</p>}
          {data && !movil && (
            <MapLegend className="absolute bottom-8 left-3 z-10" titulo={data.variable_etiqueta} leyenda={data.leyenda} formato={fmt} />
          )}
          <AnimatePresence>
            {zona && (
              <motion.aside
                key="detalle"
                className="glass-strong absolute inset-x-2 bottom-2 z-20 max-h-[60%] overflow-y-auto rounded-panel p-4 md:inset-x-auto md:top-3 md:right-3 md:bottom-auto md:max-h-[calc(100%-24px)] md:w-[340px]"
                initial={{ opacity: 0, y: movil ? 40 : 0, x: movil ? 0 : 24 }}
                animate={{ opacity: 1, y: 0, x: 0, transition: spring }}
                exit={{ opacity: 0, y: movil ? 40 : 0, x: movil ? 0 : 24, transition: { duration: 0.16 } }}
              >
                <DetalleZona zonaId={zona} periodo={periodo} alCerrar={() => setZona(null)} />
              </motion.aside>
            )}
          </AnimatePresence>
          {capas.prospectos && (
            <div className="absolute right-3 bottom-8 z-10 hidden md:block">
              <Chip tono="ambar">● Posibles socios</Chip>
            </div>
          )}
        </GlassPanel>
      )}
    </Ensamblado>
  )
}
