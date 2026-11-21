import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, CalendarDays, ClipboardCheck, Map as MapIcon, Pencil, Plus, Power, Route as RouteIcon, Save, Sparkles } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { nuevoUUID } from '../api/client'
import { AvisoFormulario, Campo, Casilla, CategoriaChip, Entrada } from '../components/campo/Campos'
import { ListaOrdenable } from '../components/campo/ListaOrdenable'
import { AvisoMapa } from '../components/campo/Mapas'
import { EstadoCola } from '../components/offline/Conexion'
import { useEnLinea } from '../offline/conexion'
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from '../components/feedback/Estados'
import { Chip, GlassButton, GlassPanel } from '../components/glass/Glass'
import { Ensamblado, EncabezadoPagina, Grupo, Pieza } from '../components/layout/Ensamblado'
import { Segmentado } from '../components/layout/Pildora'
import { GeoMap } from '../components/maps/GeoMap'
import { useAuth } from '../context/AuthContext'
import { useBarraSuperior, useFiltros } from '../context/FiltrosContext'
import { useToast } from '../context/ToastContext'
import { aplicarErroresCampos, campoApi, fcRuta, filtrarZonas, fmtDia, hoyISO, VACIO_FC } from '../features/campo/api'
import { useApi, useMediaQuery } from '../hooks/useApi'
import { periodoLargo } from '../utils/format'

const esquemaRuta = z.object({
  nombre: z.string().trim().min(1, 'Indique un nombre para la ruta.').max(120, 'Máximo 120 caracteres.'),
  fecha_prevista: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indique la fecha prevista.'),
})

/** Formulario de ruta (nueva o edición): nombre, fecha, zonas y orden manual o sugerido (RF-016.01–.05). */
function EditorRuta({ inicial, zonaIds, alCambiarZonas, items, porZona, periodo, alCancelar, alGuardado }) {
  const toast = useToast()
  const creadoRef = useRef(null)
  const [uuid, setUuid] = useState(nuevoUUID)
  const [errorZonas, setErrorZonas] = useState(null)
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [sugiriendo, setSugiriendo] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(esquemaRuta), defaultValues: { nombre: inicial.nombre, fecha_prevista: inicial.fecha } })
  const elegidas = new Set(zonaIds)
  const nombreDe = (id) => porZona.get(id)?.zona.nombre || `Zona ${id}`

  const cambiarZonas = (ids) => {
    setErrorZonas(null)
    alCambiarZonas(ids)
  }
  const alternar = (id) => cambiarZonas(elegidas.has(id) ? zonaIds.filter((z) => z !== id) : [...zonaIds, id])

  const sugerir = async () => {
    if (!zonaIds.length) return setErrorZonas({ message: 'Agregue zonas antes de pedir el orden sugerido.' })
    setSugiriendo(true)
    try {
      const r = await campoApi.sugerirOrden(zonaIds, periodo)
      cambiarZonas(r.zona_ids)
      toast.info('Orden sugerido aplicado: primero las zonas de mayor prioridad y, entre ellas, las de mayor morosidad.')
    } catch (e) {
      setErrorZonas(e)
      toast.error(e.message)
    } finally {
      setSugiriendo(false)
    }
  }

  const guardar = async (v) => {
    setErrorGeneral(null)
    if (!zonaIds.length) return setErrorZonas({ message: 'Agregue al menos una zona a la ruta.' })
    try {
      let r
      if (inicial.id) {
        r = await campoApi.actualizarRuta(inicial.id, { nombre: v.nombre, fecha_prevista: v.fecha_prevista, zona_ids: zonaIds }, periodo)
      } else {
        creadoRef.current ??= new Date().toISOString()
        r = await campoApi.crearRuta({ client_uuid: uuid, client_created_at: creadoRef.current, nombre: v.nombre, fecha_prevista: v.fecha_prevista, zona_ids: zonaIds }, periodo)
      }
      if (r.encolado) {
        toast.info(`Sin conexión: la ruta «${v.nombre}» quedó guardada en este dispositivo y se enviará al recuperar la conexión.`)
        return alGuardado({ id: `local-${r.item.client_uuid}` })
      }
      toast.exito(inicial.id ? `Ruta «${r.nombre}» actualizada.` : `Ruta «${r.nombre}» guardada con ${r.detalles.length} paradas.`)
      alGuardado(r)
    } catch (e) {
      if (e.code === 'CONFLICTO_IDEMPOTENCIA') {
        setUuid(nuevoUUID())
        creadoRef.current = null
      }
      const deZonas = e.code === 'ZONA_NO_ASIGNADA' || Boolean(e.campos?.zona_ids)
      if (deZonas) setErrorZonas(e)
      const aplicado = aplicarErroresCampos(e, setError, { zona_ids: null })
      if (!aplicado && !deZonas) setErrorGeneral(e)
      toast.error(e.message)
    }
  }

  const noAsignadas = errorZonas?.code === 'ZONA_NO_ASIGNADA' ? (errorZonas.details || []).map((d) => d.mensaje) : []

  return (
    <form onSubmit={(e) => handleSubmit(guardar)(e)} noValidate className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold tracking-[-0.02em]">{inicial.id ? 'Editar ruta' : 'Nueva ruta'}</h2>
          <p className="text-sm text-muted">Elija sus zonas y ordene las paradas</p>
        </div>
        <GlassButton variante="fantasma" icono={ArrowLeft} onClick={alCancelar} disabled={isSubmitting}>
          Cancelar
        </GlassButton>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="r-nombre" etiqueta="Nombre de la ruta" error={errors.nombre?.message}>
          <Entrada id="r-nombre" error={errors.nombre?.message} maxLength={120} autoComplete="off" placeholder="Ruta del lunes" {...register('nombre')} />
        </Campo>
        <Campo id="r-fecha" etiqueta="Fecha prevista" error={errors.fecha_prevista?.message}>
          <Entrada id="r-fecha" error={errors.fecha_prevista?.message} type="date" {...register('fecha_prevista')} />
        </Campo>
      </div>

      <section aria-labelledby="r-paradas" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="r-paradas" className="text-sm font-bold text-ink">
            Paradas ({zonaIds.length})
          </h3>
          <GlassButton tam="sm" variante="acento" icono={Sparkles} onClick={sugerir} cargando={sugiriendo} disabled={zonaIds.length < 2}>
            Usar orden sugerido
          </GlassButton>
        </div>
        {zonaIds.length === 0 ? (
          <p className="rounded-card bg-white/50 p-3 text-sm text-ink-2">Aún no hay paradas. Marque abajo las zonas que visitará.</p>
        ) : (
          <ListaOrdenable
            ids={zonaIds}
            alCambiar={cambiarZonas}
            nombreDe={nombreDe}
            etiqueta="Orden de las paradas"
            alQuitar={(id) => cambiarZonas(zonaIds.filter((z) => z !== id))}
            render={(id) => (
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-ink">{nombreDe(id)}</span>
                <CategoriaChip categoria={porZona.get(id)?.categoria} className="w-fit" />
              </span>
            )}
          />
        )}
        <p className="text-xs text-muted">Use las flechas para subir o bajar una parada (o arrastre el asa en pantallas grandes).</p>
        {errorZonas && (
          <AvisoFormulario error={errorZonas}>
            {noAsignadas.length > 0 && <p className="mt-1 text-xs">{noAsignadas.join(' · ')}</p>}
          </AvisoFormulario>
        )}
      </section>

      <section aria-labelledby="r-zonas" className="flex flex-col gap-2">
        <h3 id="r-zonas" className="text-sm font-bold text-ink">
          Mis zonas asignadas
        </h3>
        {items.length === 0 ? (
          <p className="rounded-card bg-white/50 p-3 text-sm text-ink-2">No tiene zonas asignadas; pida a su jefe de agencia que se las asigne.</p>
        ) : (
          <ul className="thin-scroll flex max-h-72 flex-col gap-1 overflow-y-auto rounded-card bg-white/35 p-1" aria-label="Zonas disponibles para la ruta">
            {items.map((i) => (
              <li key={i.zona.id} className={`flex items-center gap-1 rounded-2xl pr-2 ${elegidas.has(i.zona.id) ? 'bg-white/85' : ''}`}>
                <Casilla checked={elegidas.has(i.zona.id)} onChange={() => alternar(i.zona.id)} etiqueta={`Incluir ${i.zona.nombre} (prioridad ${i.orden})`} />
                <span className="w-6 shrink-0 text-center text-xs font-bold text-muted" aria-hidden>
                  {i.orden}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{i.zona.nombre}</span>
                <CategoriaChip categoria={i.categoria} className="hidden sm:inline-flex" />
              </li>
            ))}
          </ul>
        )}
      </section>

      {errorGeneral && <AvisoFormulario error={errorGeneral}>{errorGeneral.status === 0 && <p className="mt-1 text-xs">Puede reintentar: la ruta no se duplicará.</p>}</AvisoFormulario>}
      <GlassButton type="submit" variante="primario" tam="lg" icono={Save} cargando={isSubmitting} className="w-full">
        {isSubmitting ? 'Guardando…' : inicial.id ? 'Guardar cambios' : 'Guardar ruta'}
      </GlassButton>
    </form>
  )
}

/** CU-16: planificación de rutas de visita sobre las zonas asignadas. */
export default function Rutas() {
  const { periodo } = useFiltros()
  const { puede, parametros } = useAuth()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const angosto = useMediaQuery('(max-width: 1023px)')
  const enLinea = useEnLinea()
  const [editor, setEditor] = useState(() => {
    const ids = location.state?.zonaIds
    return Array.isArray(ids) && ids.length ? { clave: 1, id: null, nombre: '', fecha: hoyISO(), zonaIds: ids } : null
  })
  const [rutaSel, setRutaSel] = useState(null)
  const [vista, setVista] = useState('panel')
  const [desactivar, setDesactivar] = useState(null)
  const [desactivando, setDesactivando] = useState(false)
  useBarraSuperior({ periodo: true }, [])

  const mis = useApi((s) => (periodo ? campoApi.misZonas(periodo, s) : Promise.resolve(null)), [periodo])
  const rutas = useApi((s) => campoApi.rutas(s), [])
  const detalle = useApi((s) => (rutaSel ? campoApi.ruta(rutaSel, s) : Promise.resolve(null)), [rutaSel])
  const mapa = useApi((s) => (periodo ? campoApi.mapaZonas({ periodo, nivel: 'barrio', variable: 'tasa_morosidad' }, s) : Promise.resolve(null)), [periodo])

  const items = useMemo(() => mis.data?.items || [], [mis.data])
  const porZona = useMemo(() => new Map(items.map((i) => [i.zona.id, i])), [items])
  const ruta = rutaSel && detalle.data?.id === rutaSel ? detalle.data : null
  const visitasHabilitadas = puede('visitas.registrar') && Boolean(parametros?.habilitar_registro_visitas)

  // Capas del mapa según el modo: borrador del editor, detalle de una ruta o todas las zonas asignadas
  const capa = useMemo(() => {
    if (editor) {
      const paradas = editor.zonaIds.map((id, i) => ({ orden: i + 1, zona_id: id, centroide: porZona.get(id)?.zona.centroide, nombre: porZona.get(id)?.zona.nombre }))
      return { zonas: filtrarZonas(mapa.data?.zonas, editor.zonaIds), ruta: fcRuta(paradas), clave: `ed-${editor.clave}-${editor.zonaIds.length}-${Boolean(mapa.data)}` }
    }
    if (ruta) {
      const features = ruta.detalles
        .filter((d) => d.geometria)
        .map((d) => ({ type: 'Feature', id: d.zona_id, geometry: d.geometria, properties: { id: d.zona_id, nombre: d.zona, categoria_color: porZona.get(d.zona_id)?.categoria?.color_hex ?? null } }))
      return { zonas: { type: 'FeatureCollection', features }, ruta: fcRuta(ruta.detalles.map((d) => ({ orden: d.orden, zona_id: d.zona_id, centroide: d.centroide, nombre: d.zona }))), clave: `ru-${ruta.id}-${ruta.updated_at}` }
    }
    return { zonas: filtrarZonas(mapa.data?.zonas, [...porZona.keys()]), ruta: VACIO_FC, clave: `mis-${porZona.size}-${Boolean(mapa.data)}` }
  }, [editor, ruta, porZona, mapa.data])

  const setZonaIds = useCallback((ids) => setEditor((e) => (e ? { ...e, zonaIds: ids } : e)), [setEditor])
  const nueva = () => setEditor((e) => ({ clave: (e?.clave || 0) + 1, id: null, nombre: '', fecha: hoyISO(), zonaIds: [] }))
  const editar = (r) => setEditor((e) => ({ clave: (e?.clave || 0) + 1, id: r.id, nombre: r.nombre, fecha: String(r.fecha_prevista).slice(0, 10), zonaIds: r.detalles.map((d) => d.zona_id) }))
  const alGuardado = (r) => {
    setEditor(null)
    setRutaSel(r.id)
    rutas.recargar()
    detalle.recargar()
  }
  const cerrarDesactivar = useCallback(() => {
    if (!desactivando) setDesactivar(null)
  }, [desactivando, setDesactivar])
  const confirmarDesactivar = async () => {
    setDesactivando(true)
    try {
      await campoApi.actualizarRuta(desactivar.id, { activa: false }, periodo)
      toast.exito(`Ruta «${desactivar.nombre}» desactivada.`)
      setDesactivar(null)
      setRutaSel(null)
      rutas.recargar()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setDesactivando(false)
    }
  }

  const listaRutas = rutas.data?.items || []
  const subtitulo = editor ? 'Planifique el orden de sus visitas' : ruta ? `${ruta.nombre} · ${fmtDia(ruta.fecha_prevista)}` : `Sus rutas activas · prioridades de ${periodoLargo(periodo)}`

  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina
        titulo="Rutas de visita"
        subtitulo={subtitulo}
        extra={
          <>
            {angosto && <Segmentado etiqueta="Vista" valor={vista} alCambiar={setVista} opciones={[{ valor: 'panel', etiqueta: editor ? 'Ruta' : 'Lista' }, { valor: 'mapa', etiqueta: 'Mapa' }]} />}
            {!editor && (
              <GlassButton variante="primario" icono={Plus} onClick={nueva}>
                Nueva ruta
              </GlassButton>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-[var(--gap)] lg:grid-cols-12">
        <GlassPanel className={`flex flex-col p-4 md:p-5 lg:col-span-5 ${angosto && vista !== 'panel' ? 'hidden' : ''}`} aria-label={editor ? 'Editor de ruta' : 'Rutas'}>
          {editor ? (
            mis.error ? (
              <ErrorState error={mis.error} alReintentar={mis.recargar} />
            ) : !mis.data ? (
              <LoadingState filas={5} alto="h-14" />
            ) : (
              <EditorRuta key={editor.clave} inicial={editor} zonaIds={editor.zonaIds} alCambiarZonas={setZonaIds} items={items} porZona={porZona} periodo={periodo} alCancelar={() => setEditor(null)} alGuardado={alGuardado} />
            )
          ) : rutaSel ? (
            detalle.error ? (
              <ErrorState error={detalle.error} alReintentar={detalle.recargar} />
            ) : !ruta ? (
              <LoadingState filas={5} alto="h-14" />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold tracking-[-0.02em]">{ruta.nombre}</h2>
                    {ruta.local && <EstadoCola estado={ruta.estado_cola} error={ruta.error_cola} className="mt-1" />}
                    <p className="flex items-center gap-1.5 text-sm text-muted">
                      <CalendarDays className="size-4" aria-hidden /> {fmtDia(ruta.fecha_prevista)} · {ruta.detalles.length} paradas
                    </p>
                  </div>
                  <GlassButton variante="fantasma" icono={ArrowLeft} onClick={() => setRutaSel(null)}>
                    Rutas
                  </GlassButton>
                </div>
                <ol className="flex flex-col gap-2" aria-label="Paradas de la ruta en orden">
                  {ruta.detalles.map((d) => (
                    <li key={d.zona_id} className="glass-inset flex items-center gap-3 rounded-card p-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sun-300 text-sm font-bold text-brand-900">
                        <span className="sr-only">Parada </span>
                        {d.orden}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">{d.zona}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          {d.zona_codigo}
                          {porZona.get(d.zona_id) ? <CategoriaChip categoria={porZona.get(d.zona_id).categoria} /> : <Chip tono="ambar">Ya no asignada</Chip>}
                        </span>
                      </span>
                      {visitasHabilitadas && !ruta.local && (
                        <GlassButton tam="sm" variante="fantasma" icono={ClipboardCheck} onClick={() => navigate('/visitas', { state: { zonaId: d.zona_id, rutaId: ruta.id } })} aria-label={`Registrar visita en ${d.zona}`}>
                          <span className="hidden sm:inline">Visita</span>
                        </GlassButton>
                      )}
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-2 border-t border-white/70 pt-4">
                  {/* Editar rutas existentes requiere conexión (evita conflictos); las de la cola se corrigen desde el panel de pendientes */}
                  <GlassButton variante="primario" icono={Pencil} onClick={() => editar(ruta)} disabled={ruta.local || !enLinea} title={!enLinea ? 'Requiere conexión' : undefined}>
                    {enLinea || ruta.local ? 'Editar orden y fecha' : 'Editar (requiere conexión)'}
                  </GlassButton>
                  {angosto && (
                    <GlassButton icono={MapIcon} onClick={() => setVista('mapa')}>
                      Ver en el mapa
                    </GlassButton>
                  )}
                  <GlassButton variante="fantasma" icono={Power} onClick={() => setDesactivar(ruta)} className="text-danger-ink" disabled={ruta.local || !enLinea} title={!enLinea ? 'Requiere conexión' : undefined}>
                    Desactivar
                  </GlassButton>
                </div>
              </div>
            )
          ) : (
            <>
              <div className="mb-3">
                <h2 className="text-lg font-bold tracking-[-0.02em]">Mis rutas</h2>
                <p className="text-sm text-muted">Rutas activas ordenadas por fecha prevista</p>
              </div>
              {rutas.error ? (
                <ErrorState error={rutas.error} alReintentar={rutas.recargar} />
              ) : !rutas.data ? (
                <LoadingState filas={4} alto="h-20" />
              ) : listaRutas.length === 0 ? (
                <EmptyState
                  icono={RouteIcon}
                  titulo="Aún no tiene rutas"
                  texto="Cree una ruta eligiendo sus zonas asignadas; puede aceptar el orden sugerido por prioridad o ajustarlo a mano."
                  accion={
                    <GlassButton variante="primario" icono={Plus} onClick={nueva}>
                      Crear ruta
                    </GlassButton>
                  }
                />
              ) : (
                <Grupo as="ul" escalon={0.04} className="flex flex-col gap-2">
                  {listaRutas.map((r) => (
                    <Pieza as="li" key={r.id}>
                      <button type="button" onClick={() => setRutaSel(r.id)} className="press glass-inset flex min-h-16 w-full items-center gap-3 rounded-card p-3 text-left hover:bg-white/70">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                          <RouteIcon className="size-5" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-ink">{r.nombre}</span>
                          <span className="block truncate text-xs text-muted">{r.detalles.map((d) => d.zona).join(' → ')}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          {r.local ? <EstadoCola estado={r.estado_cola} /> : null}
                          <Chip tono="azul">{fmtDia(r.fecha_prevista)}</Chip>
                          <span className="text-xs text-muted">{r.detalles.length} paradas</span>
                        </span>
                      </button>
                    </Pieza>
                  ))}
                </Grupo>
              )}
            </>
          )}
        </GlassPanel>

        <GlassPanel
          className={`relative h-[calc(100dvh-260px)] min-h-[420px] overflow-hidden p-0 lg:sticky lg:top-[calc(var(--bar-h)+32px)] lg:col-span-7 lg:h-[calc(100dvh-var(--bar-h)-170px)] ${angosto && vista !== 'mapa' ? 'hidden' : ''}`}
          aria-label="Mapa de la ruta"
        >
          <GeoMap
            zonas={capa.zonas}
            ruta={capa.ruta}
            modoColor="categoria"
            capas={{ zonas: true }}
            encuadre={`${capa.clave}-${vista}`}
            etiqueta={ruta ? `Mapa de la ruta ${ruta.nombre}` : 'Mapa de zonas de la ruta'}
            fallback={<p className="p-6 text-sm">Su navegador no admite WebGL. Consulte el orden de las paradas en el listado.</p>}
          />
          {(editor || ruta) && (
            <AvisoMapa className="bottom-8 left-3 max-w-[calc(100%-24px)]">
              <span className="mr-1 inline-grid size-4 place-items-center rounded-full bg-sun-500 align-middle text-[10px] font-bold text-brand-900" aria-hidden>
                1
              </span>
              Paradas numeradas. La línea une los centros de las zonas; no es el trayecto vial.
            </AvisoMapa>
          )}
          {mapa.error && <AvisoMapa className="top-3 left-3">No se pudieron cargar los límites de las zonas.</AvisoMapa>}
        </GlassPanel>
      </div>

      <ConfirmDialog
        abierto={Boolean(desactivar)}
        alCerrar={cerrarDesactivar}
        alConfirmar={confirmarDesactivar}
        cargando={desactivando}
        peligro
        titulo="¿Desactivar esta ruta?"
        texto={desactivar ? `«${desactivar.nombre}» dejará de aparecer en sus rutas activas y en el seguimiento de visitas previstas. Las visitas ya registradas se conservan.` : ''}
        confirmar="Desactivar ruta"
      />
    </Ensamblado>
  )
}
