import { ListChecks, Map as MapIcon, MapPinned, Route as RouteIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { CategoriaChip } from '../components/campo/Campos'
import { AvisoMapa, HojaMapa } from '../components/campo/Mapas'
import { DetalleZonaAsignada, TarjetaZona } from '../components/campo/ZonaPriorizada'
import { EmptyState, ErrorState, EtiquetaProvisional, LoadingState } from '../components/feedback/Estados'
import { GlassButton, GlassPanel } from '../components/glass/Glass'
import { GlassModal } from '../components/glass/Overlay'
import { Ensamblado, EncabezadoPagina, Grupo, Pieza } from '../components/layout/Ensamblado'
import { Segmentado } from '../components/layout/Pildora'
import { GeoMap } from '../components/maps/GeoMap'
import { MapLegend } from '../components/maps/MapLegend'
import { useBarraSuperior, useFiltros } from '../context/FiltrosContext'
import { campoApi, filtrarZonas } from '../features/campo/api'
import { useApi, useMediaQuery } from '../hooks/useApi'
import { periodoLargo } from '../utils/format'

/** CU-15: zonas asignadas al oficial, ordenadas por prioridad, con el motivo de cada prioridad. */
export default function MisZonas() {
  const { periodo } = useFiltros()
  const navigate = useNavigate()
  const angosto = useMediaQuery('(max-width: 1023px)')
  const [zonaSel, setZonaSel] = useState(null)
  const [marcadas, setMarcadas] = useState(() => new Set())
  const [vista, setVista] = useState('lista')
  useBarraSuperior({ periodo: true }, [])

  const { data, error, cargando, recargar } = useApi((s) => (periodo ? campoApi.misZonas(periodo, s) : Promise.resolve(null)), [periodo])
  const mapa = useApi((s) => (periodo ? campoApi.mapaZonas({ periodo, nivel: 'barrio', variable: 'tasa_morosidad' }, s) : Promise.resolve(null)), [periodo])

  const items = useMemo(() => data?.items || [], [data])
  const ids = useMemo(() => new Set(items.map((i) => i.zona.id)), [items])
  const zonasMapa = useMemo(() => filtrarZonas(mapa.data?.zonas, ids), [mapa.data, ids])
  const categorias = useMemo(() => {
    const vistas = new Map()
    items.forEach((i) => i.categoria && !vistas.has(i.categoria.nombre) && vistas.set(i.categoria.nombre, { nombre: i.categoria.nombre, color: i.categoria.color_hex, prioridad: i.categoria.prioridad }))
    return [...vistas.values()].sort((a, b) => a.prioridad - b.prioridad)
  }, [items])
  const item = items.find((i) => i.zona.id === zonaSel)
  const listo = Boolean(data) && !cargando
  const seleccionadas = items.filter((i) => marcadas.has(i.zona.id))

  const alternar = useCallback(
    (id) =>
      setMarcadas((m) => {
        const n = new Set(m)
        if (n.has(id)) n.delete(id)
        else n.add(id)
        return n
      }),
    [],
  )
  const alZona = useCallback((id) => setZonaSel(id), [])
  const cerrarDetalle = useCallback(() => setZonaSel(null), [])
  const planificar = () => navigate('/rutas', { state: { zonaIds: seleccionadas.map((i) => i.zona.id) } })
  const todasMarcadas = items.length > 0 && seleccionadas.length === items.length

  const detalle = item && (
    <DetalleZonaAsignada
      item={item}
      periodo={periodo}
      alCerrar={angosto ? undefined : cerrarDetalle}
      encabezado={!angosto}
      acciones={
        <GlassButton variante={marcadas.has(item.zona.id) ? 'cristal' : 'acento'} icono={ListChecks} onClick={() => alternar(item.zona.id)} aria-pressed={marcadas.has(item.zona.id)}>
          {marcadas.has(item.zona.id) ? 'Quitar de la ruta' : 'Incluir en la ruta'}
        </GlassButton>
      }
    />
  )

  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina
        titulo="Mis zonas"
        subtitulo={`Zonas asignadas ordenadas por prioridad · ${periodoLargo(periodo)}`}
        insignias={<EtiquetaProvisional texto="Criterios provisionales" detalle="La prioridad se calcula con los criterios de clasificación vigentes; sus umbrales deben validarse con la cooperativa." />}
        extra={
          <>
            {angosto && <Segmentado etiqueta="Vista" valor={vista} alCambiar={setVista} opciones={[{ valor: 'lista', etiqueta: 'Lista' }, { valor: 'mapa', etiqueta: 'Mapa' }]} />}
            <GlassButton variante="primario" icono={RouteIcon} onClick={planificar} disabled={seleccionadas.length === 0} title={seleccionadas.length ? undefined : 'Marque primero las zonas que desea visitar'}>
              Planificar ruta{seleccionadas.length ? ` (${seleccionadas.length})` : ''}
            </GlassButton>
          </>
        }
      />

      {error && (
        <GlassPanel>
          <ErrorState error={error} alReintentar={recargar} />
        </GlassPanel>
      )}

      <div className="grid grid-cols-1 gap-[var(--gap)] lg:grid-cols-12">
        <GlassPanel className={`flex flex-col p-4 md:p-5 lg:col-span-5 ${angosto && vista !== 'lista' ? 'hidden' : ''}`} aria-label="Lista priorizada">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold tracking-[-0.02em]">Lista priorizada</h2>
              <p className="text-sm text-muted">{listo ? `${items.length} ${items.length === 1 ? 'zona asignada' : 'zonas asignadas'} · marque las que desea visitar` : 'Cargando zonas…'}</p>
            </div>
            {listo && items.length > 0 && (
              <GlassButton tam="sm" variante="fantasma" onClick={() => setMarcadas(todasMarcadas ? new Set() : new Set(items.map((i) => i.zona.id)))}>
                {todasMarcadas ? 'Quitar selección' : 'Marcar todas'}
              </GlassButton>
            )}
          </div>
          {!listo && !error ? (
            <LoadingState filas={5} alto="h-24" />
          ) : listo && items.length === 0 ? (
            <EmptyState icono={MapPinned} titulo="Aún no tiene zonas asignadas" texto="Su jefe de agencia debe asignarle las zonas que atenderá. Cuando lo haga, aparecerán aquí ordenadas por prioridad." />
          ) : (
            <Grupo as="ul" escalon={0.04} className="flex flex-col gap-2">
              {items.map((i) => (
                <Pieza as="li" key={i.zona.id}>
                  <TarjetaZona item={i} activa={zonaSel === i.zona.id} alElegir={alZona} marcada={marcadas.has(i.zona.id)} alMarcar={alternar} />
                </Pieza>
              ))}
            </Grupo>
          )}
        </GlassPanel>

        <GlassPanel
          className={`relative h-[calc(100dvh-260px)] min-h-[420px] overflow-hidden p-0 lg:sticky lg:top-[calc(var(--bar-h)+32px)] lg:col-span-7 lg:h-[calc(100dvh-var(--bar-h)-170px)] ${angosto && vista !== 'mapa' ? 'hidden' : ''}`}
          aria-label="Mapa de mis zonas"
        >
          <GeoMap
            zonas={zonasMapa}
            modoColor="categoria"
            capas={{ zonas: true }}
            seleccion={zonaSel}
            encuadre={`${periodo}-${zonasMapa.features.length}-${vista}`}
            onZona={alZona}
            etiqueta="Mapa de zonas asignadas por categoría"
            fallback={<p className="p-6 text-sm">Su navegador no admite WebGL. Use la lista priorizada para consultar sus zonas.</p>}
          />
          {mapa.error && <AvisoMapa className="top-3 left-3">No se pudieron cargar los límites de las zonas.</AvisoMapa>}
          {listo && items.length > 0 && zonasMapa.features.length === 0 && !mapa.error && !mapa.cargando && <AvisoMapa className="top-3 left-3">Sus zonas no tienen límites geográficos cargados.</AvisoMapa>}
          {categorias.length > 0 && !angosto && <MapLegend className="absolute bottom-8 left-3 z-10" titulo="Categoría de prioridad" categorias={categorias} />}
          {angosto && categorias.length > 0 && (
            <div className="glass-strong absolute top-3 left-3 z-10 flex max-w-[calc(100%-72px)] flex-wrap gap-1 rounded-2xl p-1.5">
              {categorias.map((c) => (
                <CategoriaChip key={c.nombre} categoria={c} />
              ))}
            </div>
          )}
          {!angosto && (
            <HojaMapa abierta={Boolean(item)} etiqueta="Detalle de la zona" clave={zonaSel}>
              {detalle}
            </HojaMapa>
          )}
          {!angosto && !item && listo && items.length > 0 && (
            <AvisoMapa className="top-3 right-14">
              <MapIcon className="mr-1 inline size-3.5" aria-hidden />
              Toque una zona para ver el motivo de su prioridad
            </AvisoMapa>
          )}
        </GlassPanel>
      </div>

      {angosto && (
        <GlassModal abierto={Boolean(item)} alCerrar={cerrarDetalle} titulo={item?.zona.nombre || 'Zona'} descripcion="Indicadores y motivo de la prioridad">
          {detalle}
        </GlassModal>
      )}
    </Ensamblado>
  )
}
