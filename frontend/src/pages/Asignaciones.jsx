import { ListOrdered, MapPinned, Plus, Search, Trash2, UserRound, Users } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { AvisoFormulario, Casilla } from '../components/campo/Campos'
import { DetalleZonaAsignada, TarjetaZona } from '../components/campo/ZonaPriorizada'
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from '../components/feedback/Estados'
import { Chip, GlassButton, GlassPanel } from '../components/glass/Glass'
import { GlassModal } from '../components/glass/Overlay'
import { Ensamblado, EncabezadoPagina } from '../components/layout/Ensamblado'
import { Segmentado } from '../components/layout/Pildora'
import { DataTable } from '../components/tables/DataTable'
import { useBarraSuperior, useFiltros } from '../context/FiltrosContext'
import { useToast } from '../context/ToastContext'
import { campoApi } from '../features/campo/api'
import { useApi, useDebounce } from '../hooks/useApi'
import { fmtFecha, iniciales, periodoLargo } from '../utils/format'

const normalizar = (t) =>
  String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Selección de varias zonas (barrios del ámbito) para asignar a un oficial (RF-014.01/04). */
function ModalAsignar({ abierto, alCerrar, oficial, asignadas, alAsignado }) {
  const toast = useToast()
  const { opciones } = useFiltros()
  const [busqueda, setBusqueda] = useState('')
  const [marcadas, setMarcadas] = useState(() => new Set())
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const q = useDebounce(busqueda, 150)
  const { data, error: errorZonas, cargando, recargar } = useApi((s) => campoApi.zonas('barrio', s), [], { enabled: abierto })
  const parroquias = useMemo(() => new Map((opciones.parroquia || []).map((p) => [p.id, p.nombre])), [opciones.parroquia])
  const zonas = useMemo(() => data?.items || [], [data])
  const nombreZona = useMemo(() => new Map(zonas.map((z) => [z.id, z.nombre])), [zonas])
  const filtradas = useMemo(() => {
    const t = normalizar(q.trim())
    return t ? zonas.filter((z) => normalizar(`${z.nombre} ${z.codigo} ${parroquias.get(z.zona_superior_id) || ''}`).includes(t)) : zonas
  }, [zonas, q, parroquias])

  const alternar = (id) =>
    setMarcadas((m) => {
      const n = new Set(m)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const asignar = async () => {
    if (!marcadas.size) {
      setError({ message: 'Seleccione al menos una zona.' })
      return
    }
    setEnviando(true)
    setError(null)
    try {
      await campoApi.asignar(oficial.id, [...marcadas])
      toast.exito(`${marcadas.size} ${marcadas.size === 1 ? 'zona asignada' : 'zonas asignadas'} a ${oficial.nombre_completo}.`)
      alAsignado()
    } catch (e) {
      setError(e)
      toast.error(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const cerrar = useCallback(() => {
    if (!enviando) alCerrar()
  }, [enviando, alCerrar])
  const fuera = error?.code === 'ZONA_FUERA_DE_AMBITO' ? (error.details || []).map((d) => Number(String(d.mensaje).match(/\d+/)?.[0])).filter(Boolean) : []

  return (
    <GlassModal
      abierto={abierto}
      alCerrar={cerrar}
      titulo={`Asignar zonas a ${oficial?.nombre_completo || 'oficial'}`}
      descripcion="Solo se listan los barrios de su ámbito. Puede elegir varios a la vez."
      ancho="max-w-xl"
      pie={
        <>
          <GlassButton onClick={cerrar} disabled={enviando}>
            Cancelar
          </GlassButton>
          <GlassButton variante="primario" icono={Plus} onClick={asignar} cargando={enviando} disabled={!marcadas.size}>
            Asignar {marcadas.size || ''} {marcadas.size === 1 ? 'zona' : 'zonas'}
          </GlassButton>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="glass-control flex h-12 items-center gap-2 rounded-control px-3 focus-within:ring-2 focus-within:ring-brand-400">
          <Search className="size-4 text-muted" aria-hidden />
          <span className="sr-only">Buscar zona</span>
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por barrio, código o parroquia" className="h-full w-full bg-transparent text-base outline-none" data-autofocus />
        </label>
        {error && (
          <AvisoFormulario error={error}>
            {fuera.length > 0 && <p className="mt-1 text-xs">Fuera de ámbito: {fuera.map((id) => nombreZona.get(id) || `Zona ${id}`).join(', ')}.</p>}
          </AvisoFormulario>
        )}
        {errorZonas ? (
          <ErrorState error={errorZonas} alReintentar={recargar} compacto />
        ) : cargando || !data ? (
          <LoadingState filas={5} alto="h-12" />
        ) : filtradas.length === 0 ? (
          <EmptyState titulo="Sin coincidencias" texto={zonas.length ? 'Pruebe con otro nombre o código.' : 'No hay barrios en su ámbito.'} />
        ) : (
          <ul className="flex flex-col gap-1" aria-label="Zonas elegibles">
            {filtradas.map((z) => {
              const ya = asignadas.has(z.id)
              return (
                <li key={z.id} className={`flex items-center gap-1 rounded-2xl pr-3 ${marcadas.has(z.id) ? 'bg-white/85' : 'hover:bg-white/50'}`}>
                  <Casilla checked={ya || marcadas.has(z.id)} disabled={ya} onChange={() => alternar(z.id)} etiqueta={`${z.nombre}${ya ? ' (ya asignada)' : ''}`} />
                  <span className="min-w-0 flex-1 py-2">
                    <span className="block truncate text-sm font-semibold text-ink">{z.nombre}</span>
                    <span className="block truncate text-xs text-muted">
                      {z.codigo}
                      {parroquias.get(z.zona_superior_id) ? ` · ${parroquias.get(z.zona_superior_id)}` : ''}
                    </span>
                  </span>
                  {ya && <Chip tono="verde">Ya asignada</Chip>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </GlassModal>
  )
}

/** CU-14: el jefe de agencia asigna y retira zonas de sus oficiales y consulta la lista priorizada de cada uno. */
export default function Asignaciones() {
  const { periodo } = useFiltros()
  const toast = useToast()
  const detalleRef = useRef(null)
  const [elegido, setElegido] = useState(null)
  const [pestana, setPestana] = useState('zonas')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [claveModal, setClaveModal] = useState(0)
  const [retirar, setRetirar] = useState(null)
  const [retirando, setRetirando] = useState(false)
  const [zonaLista, setZonaLista] = useState(null)
  useBarraSuperior({ periodo: true }, [])

  const ofs = useApi((s) => campoApi.oficiales(s), [])
  const todas = useApi((s) => campoApi.asignaciones(undefined, s), [])
  const oficiales = useMemo(() => ofs.data?.items || [], [ofs.data])
  const oficialId = elegido ?? oficiales[0]?.id ?? null
  const oficial = oficiales.find((o) => o.id === oficialId)
  const asig = useApi((s) => (oficialId ? campoApi.asignaciones(oficialId, s) : Promise.resolve({ items: [] })), [oficialId])
  const lista = useApi((s) => (oficialId && periodo && pestana === 'lista' ? campoApi.listaOficial(oficialId, periodo, s) : Promise.resolve(null)), [oficialId, periodo, pestana])

  const conteo = useMemo(() => {
    const m = new Map()
    ;(todas.data?.items || []).forEach((a) => m.set(a.oficial_id, (m.get(a.oficial_id) || 0) + 1))
    return m
  }, [todas.data])
  const filas = asig.data?.items || []
  const asignadas = useMemo(() => new Set((asig.data?.items || []).map((a) => a.zona_id)), [asig.data])
  const itemLista = lista.data?.items?.find((i) => i.zona.id === zonaLista)

  const cerrarModal = useCallback(() => setModalAbierto(false), [setModalAbierto])
  const cerrarRetiro = useCallback(() => {
    if (!retirando) setRetirar(null)
  }, [retirando, setRetirar])
  const cerrarLista = useCallback(() => setZonaLista(null), [setZonaLista])

  const elegir = (id) => {
    setElegido(id)
    setZonaLista(null)
    if (window.matchMedia?.('(max-width: 1023px)').matches) setTimeout(() => detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }
  const refrescar = () => {
    asig.recargar()
    todas.recargar()
    lista.recargar()
  }
  const confirmarRetiro = async () => {
    setRetirando(true)
    try {
      await campoApi.retirar(retirar.id)
      toast.exito(`Zona «${retirar.zona}» retirada de ${retirar.oficial}.`)
      setRetirar(null)
      refrescar()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setRetirando(false)
    }
  }

  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina titulo="Asignación de zonas" subtitulo="Asigne barrios de su ámbito a los oficiales de crédito y consulte su lista priorizada" />

      {ofs.error ? (
        <GlassPanel>
          <ErrorState error={ofs.error} alReintentar={ofs.recargar} />
        </GlassPanel>
      ) : (
        <div className="grid grid-cols-1 gap-[var(--gap)] lg:grid-cols-12">
          <GlassPanel className="flex flex-col p-4 md:p-5 lg:col-span-4" aria-label="Oficiales">
            <div className="mb-3">
              <h2 className="text-lg font-bold tracking-[-0.02em]">Oficiales de crédito</h2>
              <p className="text-sm text-muted">Oficiales activos de su ámbito</p>
            </div>
            {!ofs.data ? (
              <LoadingState filas={4} alto="h-16" />
            ) : oficiales.length === 0 ? (
              <EmptyState icono={Users} titulo="Sin oficiales" texto="No hay oficiales de crédito activos en su agencia." />
            ) : (
              <ul className="flex flex-col gap-2">
                {oficiales.map((o) => {
                  const activo = o.id === oficialId
                  const n = conteo.get(o.id) || 0
                  return (
                    <li key={o.id}>
                      <button type="button" onClick={() => elegir(o.id)} aria-pressed={activo} className={`press flex min-h-14 w-full items-center gap-3 rounded-card p-3 text-left ${activo ? 'bg-white shadow-[0_8px_20px_-12px_rgb(16_34_61/0.45)] ring-2 ring-brand-400' : 'glass-inset hover:bg-white/70'}`}>
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">{iniciales(o.nombre_completo) || <UserRound className="size-4" aria-hidden />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-ink">{o.nombre_completo}</span>
                          <span className="block truncate text-xs text-muted">{[o.cargo, o.agencia?.nombre].filter(Boolean).join(' · ') || o.username}</span>
                        </span>
                        <Chip tono={n ? 'azul' : 'neutro'}>{todas.data ? `${n} ${n === 1 ? 'zona' : 'zonas'}` : '…'}</Chip>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </GlassPanel>

          <div ref={detalleRef} className="scroll-mt-28 lg:col-span-8">
            <GlassPanel className="flex flex-col p-4 md:p-5" aria-label="Zonas del oficial">
              {!oficial ? (
                ofs.data ? <EmptyState icono={UserRound} titulo="Elija un oficial" texto="Seleccione un oficial para ver y gestionar sus zonas." /> : <LoadingState filas={5} />
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold tracking-[-0.02em]">{oficial.nombre_completo}</h2>
                      <p className="text-sm text-muted">{pestana === 'zonas' ? `${filas.length} ${filas.length === 1 ? 'zona asignada' : 'zonas asignadas'}` : `Lista priorizada · ${periodoLargo(periodo)}`}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Segmentado etiqueta="Vista del oficial" valor={pestana} alCambiar={setPestana} opciones={[{ valor: 'zonas', etiqueta: 'Asignadas' }, { valor: 'lista', etiqueta: 'Priorizada' }]} />
                      <GlassButton variante="primario" icono={Plus} onClick={() => {
                        setClaveModal((k) => k + 1)
                        setModalAbierto(true)
                      }}>
                        Asignar zonas
                      </GlassButton>
                    </div>
                  </div>

                  {pestana === 'zonas' ? (
                    <DataTable
                      etiqueta={`Zonas asignadas a ${oficial.nombre_completo}`}
                      filas={filas}
                      cargando={asig.cargando && !asig.data}
                      error={asig.error}
                      alReintentar={asig.recargar}
                      vacio={<EmptyState icono={MapPinned} titulo="Sin zonas asignadas" texto="Use «Asignar zonas» para darle a este oficial los barrios que atenderá." />}
                      columnas={[
                        { clave: 'zona', titulo: 'Zona', movil: 'titulo', render: (a) => (<span className="flex flex-col"><span className="font-semibold text-ink">{a.zona}</span><span className="text-xs text-muted">{a.zona_codigo}</span></span>) },
                        { clave: 'fecha_asignacion', titulo: 'Asignada el', render: (a) => fmtFecha(a.fecha_asignacion) },
                        { clave: 'asignado_por', titulo: 'Asignada por' },
                      ]}
                      acciones={(a) => (
                        <GlassButton tam="sm" variante="fantasma" icono={Trash2} onClick={() => setRetirar(a)} aria-label={`Retirar ${a.zona}`}>
                          Retirar
                        </GlassButton>
                      )}
                    />
                  ) : lista.error ? (
                    <ErrorState error={lista.error} alReintentar={lista.recargar} />
                  ) : !lista.data || lista.cargando ? (
                    <LoadingState filas={4} alto="h-24" />
                  ) : lista.data.items.length === 0 ? (
                    <EmptyState icono={ListOrdered} titulo="Lista vacía" texto="El oficial aún no tiene zonas asignadas." />
                  ) : (
                    <ul className="flex flex-col gap-2" aria-label="Lista priorizada del oficial">
                      {lista.data.items.map((i) => (
                        <li key={i.zona.id}>
                          <TarjetaZona item={i} activa={zonaLista === i.zona.id} alElegir={setZonaLista} />
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </GlassPanel>
          </div>
        </div>
      )}

      {oficial && (
        <ModalAsignar
          key={`${oficial.id}-${claveModal}`}
          abierto={modalAbierto}
          alCerrar={cerrarModal}
          oficial={oficial}
          asignadas={asignadas}
          alAsignado={() => {
            setModalAbierto(false)
            refrescar()
          }}
        />
      )}

      <ConfirmDialog
        abierto={Boolean(retirar)}
        alCerrar={cerrarRetiro}
        alConfirmar={confirmarRetiro}
        cargando={retirando}
        peligro
        titulo="¿Retirar esta zona?"
        texto={retirar ? `«${retirar.zona}» dejará de estar asignada a ${retirar.oficial} y saldrá de su lista priorizada. Las visitas y rutas registradas se conservan.` : ''}
        confirmar="Retirar zona"
      />

      <GlassModal abierto={Boolean(itemLista)} alCerrar={cerrarLista} titulo={itemLista?.zona.nombre || 'Zona'} descripcion={`Lista de ${oficial?.nombre_completo || 'oficial'}`}>
        {itemLista && <DetalleZonaAsignada item={itemLista} periodo={periodo} encabezado={false} />}
      </GlassModal>
    </Ensamblado>
  )
}
