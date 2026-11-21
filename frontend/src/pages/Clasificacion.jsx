import { ArrowRight, Check, Info, ListOrdered, MousePointerClick, ShieldAlert } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ExplicacionZona } from '../components/analisis/ExplicacionZona'
import { ChipCategoria } from '../components/analisis/Partes'
import { EmptyState, ErrorState, EtiquetaProvisional, InsigniaDemo } from '../components/feedback/Estados'
import { BotonExportar } from '../components/feedback/ExportarReporte'
import { GlassPanel } from '../components/glass/Glass'
import { GlassModal } from '../components/glass/Overlay'
import { Ensamblado, EncabezadoPagina } from '../components/layout/Ensamblado'
import { Segmentado } from '../components/layout/Pildora'
import { GeoMap } from '../components/maps/GeoMap'
import { MapLegend } from '../components/maps/MapLegend'
import { DataTable, LoadMoreFooter } from '../components/tables/DataTable'
import { useAuth } from '../context/AuthContext'
import { useBarraSuperior, useFiltros } from '../context/FiltrosContext'
import { analiticaApi } from '../features/analitica/api'
import { clasificacionApi } from '../features/clasificacion/api'
import { useApi, useMediaQuery } from '../hooks/useApi'
import { fmtEntero, fmtFecha, fmtPct, periodoLargo } from '../utils/format'

const PAGINA = 20
const CAPAS_MAPA = { zonas: true }
const ExportarClasificacion = () => <BotonExportar tipoInicial="clasificacion" />

function FiltroCategoria({ activo, onClick, children, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`press inline-flex min-h-11 items-center gap-2 rounded-full px-3.5 text-sm transition-colors ${activo ? 'bg-white font-semibold text-ink shadow-[0_6px_16px_-8px_rgb(16_34_61/0.4)]' : 'glass-control text-ink-2 hover:text-ink'}`}
    >
      {activo ? <Check className="size-4 text-brand-600" aria-hidden /> : color && <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />}
      {children}
    </button>
  )
}

export default function Clasificacion() {
  const { periodo, seleccion, opciones } = useFiltros()
  const { puede } = useAuth()
  const escritorio = useMediaQuery('(min-width: 1280px)')
  const verMapa = puede('mapa.ver')
  useBarraSuperior({ geo: true, periodo: true, accion: ExportarClasificacion }, [])

  const [categoria, setCategoria] = useState('todas')
  const [zonaSel, setZonaSel] = useState(null)
  const [paginado, setPaginado] = useState({ clave: '', n: PAGINA })
  const [modoMapa, setModoMapa] = useState('categoria')

  const { data, error, cargando, recargar } = useApi((s) => (periodo ? clasificacionApi.clasificacion({ periodo }, s) : Promise.resolve(null)), [periodo])
  const mapa = useApi(
    (s) => (periodo && verMapa ? analiticaApi.mapaZonas({ periodo, nivel: 'barrio', padre: seleccion.zonaId, variable: 'penetracion_pct' }, s) : Promise.resolve(null)),
    [periodo, seleccion.zonaId, verMapa],
  )

  // La clasificación llega para todo el ámbito; el filtro geográfico de la barra se aplica por jerarquía
  const padreDe = useMemo(() => {
    const m = {}
    Object.values(opciones).forEach((lista) => lista.forEach((z) => (m[z.id] = z.zona_superior_id)))
    return m
  }, [opciones])
  const dentro = useCallback(
    (id) => {
      if (!seleccion.zonaId) return true
      for (let x = id, i = 0; x != null && i < 8; x = padreDe[x], i++) if (x === seleccion.zonaId) return true
      return false
    },
    [padreDe, seleccion.zonaId],
  )
  const enGeo = useMemo(() => (data?.items || []).filter((i) => dentro(i.zona.id)).map((i) => ({ ...i, id: i.zona.id })), [data, dentro])
  const conteo = useMemo(() => {
    const c = { sin: 0 }
    enGeo.forEach((i) => (i.categoria ? (c[i.categoria.id] = (c[i.categoria.id] || 0) + 1) : c.sin++))
    return c
  }, [enGeo])
  const filas = categoria === 'todas' ? enGeo : enGeo.filter((i) => (categoria === 'sin' ? !i.categoria : i.categoria?.id === categoria))
  const claveLista = `${periodo}-${seleccion.zonaId}-${categoria}`
  const visibles = paginado.clave === claveLista ? paginado.n : PAGINA
  const itemSel = enGeo.find((i) => i.id === zonaSel)

  const alZona = useCallback((id) => setZonaSel(id), [])
  const categoriasLeyenda = (data?.categorias || []).map((c) => ({ nombre: c.nombre, color: c.color_hex }))
  const sinVersion = data && !data.version

  const columnas = [
    {
      clave: 'zona',
      titulo: 'Zona',
      movil: 'titulo',
      render: (f) => (
        <span className="flex min-w-0 items-center gap-3">
          <span className="tnum grid size-8 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-ink-2 shadow-sm" aria-label={`Orden de atención ${f.orden_atencion}`}>
            {f.orden_atencion}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink">{f.zona.nombre}</span>
            <span className="block truncate text-xs font-normal text-muted">{f.zona.ruta}</span>
          </span>
        </span>
      ),
    },
    { clave: 'categoria', titulo: 'Categoría', render: (f) => <ChipCategoria categoria={f.categoria} /> },
    { clave: 'tasa_morosidad', titulo: 'Morosidad', alinear: 'derecha', render: (f) => fmtPct(f.indicadores?.tasa_morosidad) },
    { clave: 'penetracion_pct', titulo: 'Penetración', alinear: 'derecha', render: (f) => fmtPct(f.indicadores?.penetracion_pct) },
    { clave: 'creditos_atrasados', titulo: 'Atrasados', alinear: 'derecha', render: (f) => fmtEntero(f.indicadores?.creditos_atrasados) },
    { clave: 'total_socios', titulo: 'Socios', alinear: 'derecha', render: (f) => fmtEntero(f.indicadores?.total_socios) },
    { clave: 'frecuencia', titulo: 'Visita sugerida', render: (f) => (f.categoria?.frecuencia_visita_dias ? `Cada ${f.categoria.frecuencia_visita_dias} días` : '—') },
  ]

  const explicacion = zonaSel && (
    <ExplicacionZona key={`${zonaSel}-${periodo}`} zonaId={zonaSel} periodo={periodo} item={itemSel} alCerrar={() => setZonaSel(null)} conCierre={escritorio} />
  )

  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina
        titulo="Clasificación y prioridad de zonas"
        subtitulo={
          data?.version
            ? `Criterios vigentes v${data.version.version}, aprobados el ${fmtFecha(data.version.aprobado_en)}${data.version.aprobado_por ? ` por ${data.version.aprobado_por}` : ''} · ${periodoLargo(periodo)}`
            : `Zonas ordenadas por la atención que requieren · ${periodoLargo(periodo)}`
        }
        insignias={
          <>
            <EtiquetaProvisional texto="Umbrales DEMO" detalle="Los umbrales de los criterios son de demostración y deben validarse con la cooperativa; no son oficiales." />
            <InsigniaDemo />
          </>
        }
      />

      {error ? (
        <GlassPanel>
          <ErrorState error={error} alReintentar={recargar} />
        </GlassPanel>
      ) : sinVersion ? (
        <GlassPanel>
          <EmptyState
            icono={ShieldAlert}
            titulo="Sin criterios aprobados"
            texto={data.mensaje}
            accion={
              puede('criterios.definir', 'criterios.aprobar') && (
                <Link to="/criterios" className="press inline-flex min-h-11 items-center gap-1 rounded-full px-3 font-semibold text-sun-700 hover:underline">
                  Ir a criterios <ArrowRight className="size-4" aria-hidden />
                </Link>
              )
            }
          />
        </GlassPanel>
      ) : (
        <div className="grid grid-cols-1 gap-[var(--gap)] xl:grid-cols-12">
          <GlassPanel className="flex min-w-0 flex-col gap-4 p-4 md:p-5 xl:col-span-7">
            <div className="flex flex-wrap items-start justify-between gap-2 px-1">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold tracking-[-0.02em] text-ink">
                  <ListOrdered className="size-5 text-brand-600" aria-hidden /> Zonas por atención requerida
                </h2>
                <p className="text-sm text-muted">Primero la categoría de mayor prioridad; dentro de ella, mayor morosidad y menor penetración.</p>
              </div>
            </div>
            {data && !cargando && (
              <div role="group" aria-label="Filtrar por categoría" className="flex flex-wrap gap-2">
                <FiltroCategoria activo={categoria === 'todas'} onClick={() => setCategoria('todas')}>
                  Todas ({enGeo.length})
                </FiltroCategoria>
                {data.categorias.map((c) => (
                  <FiltroCategoria key={c.id} activo={categoria === c.id} onClick={() => setCategoria(c.id)} color={c.color_hex}>
                    {c.nombre} ({conteo[c.id] || 0})
                  </FiltroCategoria>
                ))}
                {conteo.sin > 0 && (
                  <FiltroCategoria activo={categoria === 'sin'} onClick={() => setCategoria('sin')} color="#9aa5b5">
                    Sin clasificar ({conteo.sin})
                  </FiltroCategoria>
                )}
              </div>
            )}
            <div className="glass-inset -mx-1 rounded-card p-1 md:p-2">
              <DataTable
                etiqueta="Zonas ordenadas por atención"
                columnas={columnas}
                filas={filas.slice(0, visibles)}
                cargando={!data || cargando}
                alSeleccionar={(f) => setZonaSel(f.id)}
                seleccionado={zonaSel}
                vacio={
                  <EmptyState
                    titulo="Sin zonas en este filtro"
                    texto={categoria !== 'todas' ? 'Ninguna zona de la selección tiene esta categoría en el período.' : 'No hay zonas clasificadas en el período o la zona elegida en la barra superior.'}
                  />
                }
              />
              {data && !cargando && filas.length > 0 && (
                <LoadMoreFooter mostrando={Math.min(visibles, filas.length)} total={filas.length} hayMas={visibles < filas.length} alVerMas={() => setPaginado({ clave: claveLista, n: visibles + PAGINA })} />
              )}
            </div>
            <p className="flex items-start gap-2 px-1 text-xs text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Seleccione una zona para ver los indicadores y las reglas que explican su categoría. «Sin datos» no equivale a cero.
            </p>
          </GlassPanel>

          <div className="flex min-w-0 flex-col gap-[var(--gap)] xl:col-span-5">
            {escritorio && (
              <GlassPanel className="p-5 md:p-6 xl:sticky xl:top-[calc(var(--bar-h)+32px)]">
                {explicacion || <EmptyState icono={MousePointerClick} titulo="Explicación de la categoría" texto="Elija una zona de la lista o del mapa para ver por qué tiene su categoría." />}
              </GlassPanel>
            )}
            {verMapa && (
              <GlassPanel className="flex flex-col gap-3 p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">Mapa de categorías</h2>
                    <p className="text-sm text-muted">Reconozca las zonas de menor presencia de socios.</p>
                  </div>
                  <Segmentado
                    etiqueta="Color del mapa"
                    valor={modoMapa}
                    alCambiar={setModoMapa}
                    opciones={[
                      { valor: 'categoria', etiqueta: 'Categoría' },
                      { valor: 'valor', etiqueta: 'Penetración' },
                    ]}
                  />
                </div>
                {mapa.error ? (
                  <ErrorState error={mapa.error} alReintentar={mapa.recargar} compacto />
                ) : (
                  <div className="relative h-[340px] overflow-hidden rounded-card md:h-[380px]">
                    <GeoMap
                      zonas={mapa.data?.zonas}
                      leyenda={mapa.data?.leyenda}
                      modoColor={modoMapa}
                      capas={CAPAS_MAPA}
                      seleccion={zonaSel}
                      encuadre={`${seleccion.zonaId}-${mapa.data ? 'ok' : 'no'}`}
                      onZona={alZona}
                      etiqueta="Mapa de categorías de zonas"
                      fallback={<p className="p-6 text-sm">Su navegador no admite WebGL. Use la lista para consultar las mismas zonas.</p>}
                    />
                    {!mapa.data && (
                      <p role="status" className="glass-strong absolute top-3 left-3 z-10 rounded-xl px-3 py-1.5 text-xs font-medium text-ink-2">
                        Cargando zonas del mapa…
                      </p>
                    )}
                    {mapa.data && (
                      <MapLegend
                        className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-24px)]"
                        titulo={modoMapa === 'categoria' ? 'Categoría' : 'Penetración de socios'}
                        categorias={modoMapa === 'categoria' ? categoriasLeyenda : undefined}
                        leyenda={mapa.data.leyenda}
                        formato={fmtPct}
                      />
                    )}
                  </div>
                )}
              </GlassPanel>
            )}
          </div>
        </div>
      )}

      {!escritorio && (
        <GlassModal abierto={Boolean(zonaSel)} alCerrar={() => setZonaSel(null)} titulo="Explicación de la categoría" descripcion="Indicadores y reglas que explican la categoría de la zona.">
          {explicacion}
        </GlassModal>
      )}
    </Ensamblado>
  )
}
