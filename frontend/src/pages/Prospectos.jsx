import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheck, Crosshair, LocateFixed, MapPin, MapPinOff, Save, Search, TriangleAlert, UserPlus } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { cacheInvalidate, nuevoUUID } from '../api/client'
import { AreaTexto, AvisoFormulario, Campo, Entrada } from '../components/campo/Campos'
import { AvisoMapa } from '../components/campo/Mapas'
import { EstadoCola } from '../components/offline/Conexion'
import { EmptyState } from '../components/feedback/Estados'
import { Chip, GlassButton, GlassPanel } from '../components/glass/Glass'
import { Ensamblado, EncabezadoPagina } from '../components/layout/Ensamblado'
import { PildoraSelect } from '../components/layout/Pildora'
import { GeoMap } from '../components/maps/GeoMap'
import { DataTable, LoadMoreFooter } from '../components/tables/DataTable'
import { useBarraSuperior, useFiltros } from '../context/FiltrosContext'
import { useToast } from '../context/ToastContext'
import { aplicarErroresCampos, campoApi, fcProspectos, filtrarZonas, VACIO_FC } from '../features/campo/api'
import { useApi, useCursorList, useDebounce } from '../hooks/useApi'
import { aLngLat, desdeLngLat, fmtFechaHora } from '../utils/format'

// Acepta coma o punto decimal; se envía siempre con punto
const norm = (v) => String(v ?? '').trim().replace(',', '.')
const esNumero = (v) => /^-?\d+(\.\d+)?$/.test(norm(v))
const esLat = (v) => esNumero(v) && Math.abs(Number(norm(v))) <= 90
const esLng = (v) => esNumero(v) && Math.abs(Number(norm(v))) <= 180

const esquema = z.object({
  nombre_negocio: z.string().trim().min(1, 'Indique el nombre o referencia del negocio.').max(160, 'Máximo 160 caracteres.'),
  referencia: z.string().trim().max(200, 'Máximo 200 caracteres.'),
  actividad: z.string().trim().max(120, 'Máximo 120 caracteres.'),
  direccion: z.string().trim().max(200, 'Máximo 200 caracteres.'),
  observacion: z.string().trim().max(500, 'Máximo 500 caracteres.'),
  latitud: z.string().trim().min(1, 'Indique la latitud o marque un punto en el mapa.').refine(esLat, 'Latitud no válida: use un número entre -90 y 90 (p. ej. -3.99312).'),
  longitud: z.string().trim().min(1, 'Indique la longitud o marque un punto en el mapa.').refine(esLng, 'Longitud no válida: use un número entre -180 y 180 (p. ej. -79.20451).'),
})
const VACIOS = { nombre_negocio: '', referencia: '', actividad: '', direccion: '', observacion: '', latitud: '', longitud: '' }

/** Estado de la validación previa de la zona del punto (GET /zonas/por-punto/). */
function EstadoZona({ valido, consulta }) {
  const base = 'flex items-start gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium'
  if (!valido) return <p className={`${base} bg-white/60 text-ink-2`}><Crosshair className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />Marque un punto en el mapa, use su ubicación o escriba las coordenadas.</p>
  if (consulta.cargando) return <p className={`${base} bg-white/60 text-ink-2`}><span className="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-brand-500 border-r-transparent" aria-hidden />Validando la zona del punto…</p>
  if (consulta.error) return <p className={`${base} bg-[#fbe9e5] text-danger-ink`}><MapPinOff className="mt-0.5 size-4 shrink-0" aria-hidden />{consulta.error.message}</p>
  const d = consulta.data
  if (!d) return null
  if (d.sin_verificar)
    return <p className={`${base} bg-white/60 text-ink-2`}><Crosshair className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />Sin conexión: la zona del punto se validará al sincronizar.</p>
  if (d.en_ambito)
    return (
      <div className={`${base} flex-col bg-[#e6f5ee] text-ok-ink`}>
        <span className="flex items-start gap-2"><CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />Zona: {d.zona.nombre}</span>
        {d.advertencias?.length > 0 && <span className="pl-6 text-xs text-warn-ink">{d.advertencias.join('. ')}.</span>}
      </div>
    )
  return (
    <p className={`${base} bg-[#fbe9e5] text-danger-ink`}>
      <MapPinOff className="mt-0.5 size-4 shrink-0" aria-hidden />
      {d.aproximado ? 'Fuera de sus zonas asignadas (validación aproximada sin conexión).' : d.dentro_de_zona ? 'Fuera de ámbito: el punto está en una zona que no le corresponde.' : 'Fuera de zona: el punto no está dentro de una zona registrada.'}
    </p>
  )
}

/** CU-13: registro de posibles socios con ubicación en el mapa (idempotente con client_uuid). */
export default function Prospectos() {
  const toast = useToast()
  const { periodo } = useFiltros()
  const mapRef = useRef(null)
  const mapaPanel = useRef(null)
  const location = useLocation()
  // Corrección de un registro rechazado al sincronizar: mismo client_uuid, datos precargados y motivo visible
  const [corrigiendo] = useState(() => location.state?.corregir || null)
  const creadoRef = useRef(corrigiendo?.client_created_at || null)
  const [uuid, setUuid] = useState(() => corrigiendo?.client_uuid || nuevoUUID())
  const [errorGeneral, setErrorGeneral] = useState(() => (corrigiendo?.error ? { message: `Rechazado al sincronizar: ${corrigiendo.error.mensaje}`, details: corrigiendo.error.detalles || [] } : null))
  const [geo, setGeo] = useState({ estado: 'inactivo' })
  const [busqueda, setBusqueda] = useState('')
  const [zonaFiltro, setZonaFiltro] = useState(null)
  const q = useDebounce(busqueda.trim(), 300)

  const barrios = useApi((s) => campoApi.zonas('barrio', s), [])
  const opcionesZona = useMemo(() => (barrios.data?.items || []).map((z) => ({ valor: z.id, etiqueta: z.nombre, detalle: z.codigo })), [barrios.data])
  useBarraSuperior({ extra: <PildoraSelect prefijo="Zona" etiquetaAccesible="Filtrar posibles socios por zona" valor={zonaFiltro} opciones={opcionesZona} alCambiar={setZonaFiltro} todos="Todas" ancho={300} /> }, [zonaFiltro, opcionesZona])

  const lista = useCursorList(({ cursor, signal }) => campoApi.prospectos({ q, zona: zonaFiltro, cursor }, signal), [q, zonaFiltro])
  const mapa = useApi((s) => (periodo ? campoApi.mapaZonas({ periodo, nivel: 'barrio', variable: 'tasa_morosidad' }, s) : Promise.resolve(null)), [periodo])
  const zonasMapa = useMemo(() => (zonaFiltro ? filtrarZonas(mapa.data?.zonas, [zonaFiltro]) : mapa.data?.zonas || VACIO_FC), [mapa.data, zonaFiltro])
  const puntosProspectos = useMemo(() => fcProspectos(lista.items), [lista.items])

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    clearErrors,
    reset,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm({ resolver: zodResolver(esquema), defaultValues: corrigiendo ? { ...VACIOS, ...Object.fromEntries(Object.entries(corrigiendo.datos).map(([k, v]) => [k, v ?? ''])) } : VACIOS })
  const [lat, lng] = useWatch({ control, name: ['latitud', 'longitud'] })
  const latD = useDebounce(norm(lat), 400)
  const lngD = useDebounce(norm(lng), 400)
  const coordsOk = esLat(latD) && esLng(lngD)
  const zonaPunto = useApi((s) => campoApi.zonaPorPunto(latD, lngD, s), [latD, lngD], { enabled: coordsOk })
  const marcado = useMemo(
    () => (esLat(lat) && esLng(lng) ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: aLngLat(norm(lat), norm(lng)) }, properties: {} }] } : VACIO_FC),
    [lat, lng],
  )

  const fijarPunto = ([lngN, latN]) => {
    const { latitud, longitud } = desdeLngLat([lngN, latN])
    setValue('latitud', latitud, { shouldValidate: isSubmitted, shouldDirty: true })
    setValue('longitud', longitud, { shouldValidate: isSubmitted, shouldDirty: true })
    clearErrors('ubicacion')
  }
  const alClickMapa = (lngLat) => fijarPunto([lngLat.lng, lngLat.lat])

  const usarUbicacion = () => {
    if (!window.isSecureContext || !navigator.geolocation) {
      setGeo({ estado: 'error', mensaje: 'La geolocalización solo funciona en una conexión segura (HTTPS) o en localhost. Marque el punto en el mapa o escriba las coordenadas.' })
      return
    }
    setGeo({ estado: 'buscando' })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const punto = [pos.coords.longitude, pos.coords.latitude]
        fijarPunto(punto)
        mapRef.current?.volarA(punto, 17)
        setGeo({ estado: 'ok', precision: Math.round(pos.coords.accuracy) })
      },
      (err) =>
        setGeo({
          estado: 'error',
          mensaje: err.code === 1 ? 'No se concedió permiso de ubicación. Puede marcar el punto en el mapa o escribir las coordenadas.' : 'No se pudo obtener su ubicación. Intente de nuevo al aire libre o marque el punto en el mapa.',
        }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    )
  }

  const invertirSigno = (campo, valor) => {
    const v = norm(valor)
    if (!v) return
    setValue(campo, v.startsWith('-') ? v.slice(1) : `-${v}`, { shouldValidate: isSubmitted, shouldDirty: true })
    clearErrors('ubicacion')
  }

  const enviar = async (v) => {
    setErrorGeneral(null)
    const latitud = norm(v.latitud)
    const longitud = norm(v.longitud)
    // Validación previa de la zona del punto (el servidor vuelve a validar al guardar)
    try {
      const r = await campoApi.zonaPorPunto(latitud, longitud)
      if (r.aproximado && !r.en_ambito) return setError('ubicacion', { message: 'Sin conexión: el punto queda fuera de sus zonas asignadas. Marque un punto dentro de una de ellas.' })
      if (r.dentro_de_zona === false) return setError('ubicacion', { message: 'La ubicación no se encuentra dentro de una zona registrada. Marque un punto dentro de una zona.' })
      if (r.en_ambito === false) return setError('ubicacion', { message: 'La ubicación está fuera de su ámbito de responsabilidad.' })
    } catch (e) {
      if (e.code === 'UBICACION_INVALIDA') return setError('ubicacion', { message: e.message })
      setErrorGeneral(e)
      return toast.error(e.message)
    }
    creadoRef.current ??= new Date().toISOString()
    try {
      const p = await campoApi.registrarProspecto({
        client_uuid: uuid,
        client_created_at: creadoRef.current,
        nombre_negocio: v.nombre_negocio,
        referencia: v.referencia,
        actividad: v.actividad,
        direccion: v.direccion,
        observacion: v.observacion,
        latitud,
        longitud,
      })
      if (p.encolado) toast.info(`Sin conexión: «${v.nombre_negocio}» quedó guardado en este dispositivo y se enviará al recuperar la conexión.`)
      else toast.exito(`Posible socio «${p.nombre_negocio}» registrado en ${p.zona}.`)
      reset(VACIOS)
      setUuid(nuevoUUID())
      creadoRef.current = null
      setGeo({ estado: 'inactivo' })
      cacheInvalidate('/mapa/', '/prospectos/')
      lista.recargar()
    } catch (e) {
      if (e.code === 'CONFLICTO_IDEMPOTENCIA') {
        setUuid(nuevoUUID())
        creadoRef.current = null
      }
      if (!aplicarErroresCampos(e, setError)) setErrorGeneral(e)
      toast.error(e.message)
    }
  }

  const irAProspecto = (p) => {
    mapRef.current?.volarA(aLngLat(p.latitud, p.longitud), 17)
    if (window.matchMedia?.('(max-width: 1023px)').matches) mapaPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const errUbicacion = errors.ubicacion?.message
  const regLat = register('latitud', { onChange: () => clearErrors('ubicacion') })
  const regLng = register('longitud', { onChange: () => clearErrors('ubicacion') })

  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina titulo="Posibles socios" subtitulo="Registre negocios o personas interesadas con su ubicación en el mapa" />

      <div className="grid grid-cols-1 gap-[var(--gap)] lg:grid-cols-12">
        <div ref={mapaPanel} className="lg:col-span-7">
          <GlassPanel className="relative h-[62dvh] min-h-[380px] overflow-hidden p-0 lg:sticky lg:top-[calc(var(--bar-h)+32px)] lg:h-[calc(100dvh-var(--bar-h)-170px)]" aria-label="Mapa para marcar la ubicación">
            <GeoMap
              ref={mapRef}
              zonas={zonasMapa}
              modoColor="categoria"
              prospectos={puntosProspectos}
              marcador={marcado}
              capas={{ zonas: true, prospectos: true }}
              encuadre={`${periodo}-${zonaFiltro}-${zonasMapa.features.length}`}
              modoMarcar
              onClickMapa={alClickMapa}
              etiqueta="Mapa: toque un punto para marcar la ubicación del posible socio"
              fallback={<p className="p-6 text-sm">Su navegador no admite WebGL. Escriba la latitud y la longitud en el formulario.</p>}
            />
            <div className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-72px)] flex-col items-start gap-2">
              <p className="glass-strong flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-ink-2">
                <Crosshair className="size-3.5 shrink-0" aria-hidden />
                Toque el mapa para marcar la ubicación
              </p>
              <GlassButton tam="sm" icono={LocateFixed} onClick={usarUbicacion} cargando={geo.estado === 'buscando'} className="glass-strong">
                Usar mi ubicación
              </GlassButton>
            </div>
            <div className="absolute bottom-8 left-3 z-10 flex flex-wrap gap-1.5">
              <Chip tono="ambar" className="glass-strong">● Posibles socios</Chip>
              <Chip tono="azul" className="glass-strong">● Punto marcado</Chip>
            </div>
            {mapa.error && <AvisoMapa className="top-[108px] left-3">No se pudieron cargar los límites de las zonas.</AvisoMapa>}
          </GlassPanel>
        </div>

        <GlassPanel className="p-4 md:p-6 lg:col-span-5" aria-label="Registrar posible socio">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-[-0.02em]">
            <UserPlus className="size-5 text-brand-600" aria-hidden /> Nuevo posible socio
          </h2>
          <p className="mt-1 text-sm text-muted">Los campos marcados como opcionales pueden quedar vacíos.</p>
          <form onSubmit={(e) => handleSubmit(enviar)(e)} noValidate className="mt-4 flex flex-col gap-4">
            <Campo id="p-nombre" etiqueta="Nombre o referencia del negocio" error={errors.nombre_negocio?.message}>
              <Entrada id="p-nombre" error={errors.nombre_negocio?.message} autoComplete="off" maxLength={160} {...register('nombre_negocio')} />
            </Campo>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo id="p-actividad" etiqueta="Actividad" opcional error={errors.actividad?.message}>
                <Entrada id="p-actividad" error={errors.actividad?.message} placeholder="Tienda, taller, agricultura…" maxLength={120} {...register('actividad')} />
              </Campo>
              <Campo id="p-referencia" etiqueta="Referencia o contacto" opcional error={errors.referencia?.message}>
                <Entrada id="p-referencia" error={errors.referencia?.message} maxLength={200} {...register('referencia')} />
              </Campo>
            </div>
            <Campo id="p-direccion" etiqueta="Dirección" opcional error={errors.direccion?.message}>
              <Entrada id="p-direccion" error={errors.direccion?.message} autoComplete="street-address" maxLength={200} {...register('direccion')} />
            </Campo>

            <fieldset className="flex flex-col gap-3 rounded-card bg-white/40 p-3" aria-describedby="p-ubic-ayuda">
              <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-ink-2">
                <MapPin className="size-4 text-brand-600" aria-hidden /> Ubicación
              </legend>
              <p id="p-ubic-ayuda" className="-mt-1 text-xs text-muted">
                Toque el mapa, use «Usar mi ubicación» (opcional; requiere HTTPS o localhost y su permiso) o escriba las coordenadas en grados decimales.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Campo id="p-lat" etiqueta="Latitud" error={errors.latitud?.message}>
                  <span className="flex gap-1">
                    <Entrada id="p-lat" error={errors.latitud?.message} aria-invalid={Boolean(errors.latitud || errUbicacion) || undefined} aria-describedby={errors.latitud ? 'p-lat-error' : errUbicacion ? 'p-ubic-error' : undefined} type="text" inputMode="decimal" autoComplete="off" placeholder="-3.99312" {...regLat} />
                    <button type="button" onClick={() => invertirSigno('latitud', lat)} className="press glass-control grid size-12 shrink-0 place-items-center rounded-control text-base font-bold text-ink-2" aria-label="Cambiar el signo de la latitud">
                      ±
                    </button>
                  </span>
                </Campo>
                <Campo id="p-lng" etiqueta="Longitud" error={errors.longitud?.message}>
                  <span className="flex gap-1">
                    <Entrada id="p-lng" error={errors.longitud?.message} aria-invalid={Boolean(errors.longitud || errUbicacion) || undefined} aria-describedby={errors.longitud ? 'p-lng-error' : errUbicacion ? 'p-ubic-error' : undefined} type="text" inputMode="decimal" autoComplete="off" placeholder="-79.20451" {...regLng} />
                    <button type="button" onClick={() => invertirSigno('longitud', lng)} className="press glass-control grid size-12 shrink-0 place-items-center rounded-control text-base font-bold text-ink-2" aria-label="Cambiar el signo de la longitud">
                      ±
                    </button>
                  </span>
                </Campo>
              </div>
              <div aria-live="polite">
                <EstadoZona valido={coordsOk} consulta={zonaPunto} />
              </div>
              {errUbicacion && (
                <p id="p-ubic-error" role="alert" className="flex items-start gap-1 text-xs font-medium text-danger-ink">
                  <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                  {errUbicacion}
                </p>
              )}
              {geo.estado === 'error' && <p className="text-xs font-medium text-warn-ink">{geo.mensaje}</p>}
              {geo.estado === 'ok' && <p className="text-xs text-muted">Ubicación obtenida con una precisión aproximada de {geo.precision} m. Ajústela tocando el mapa si es necesario.</p>}
            </fieldset>

            <Campo id="p-obs" etiqueta="Observación" opcional error={errors.observacion?.message}>
              <AreaTexto id="p-obs" error={errors.observacion?.message} maxLength={500} {...register('observacion')} />
            </Campo>

            {errorGeneral && <AvisoFormulario error={errorGeneral}>{errorGeneral.status === 0 && <p className="mt-1 text-xs">Puede reintentar: el registro no se duplicará.</p>}</AvisoFormulario>}

            <GlassButton type="submit" variante="primario" tam="lg" icono={Save} cargando={isSubmitting} className="w-full">
              {isSubmitting ? 'Guardando…' : 'Guardar posible socio'}
            </GlassButton>
          </form>
        </GlassPanel>
      </div>

      <GlassPanel className="p-2 md:p-3" aria-label="Posibles socios registrados">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 pt-3 pb-2">
          <div>
            <h2 className="text-lg font-bold tracking-[-0.02em]">Registrados</h2>
            <p className="text-sm text-muted">{lista.total != null ? `${lista.total} posibles socios` : 'Cargando…'} · toque uno para verlo en el mapa</p>
          </div>
          <label className="glass-control flex h-11 w-full items-center gap-2 rounded-full px-3.5 sm:w-72 focus-within:ring-2 focus-within:ring-brand-400">
            <Search className="size-4 text-muted" aria-hidden />
            <span className="sr-only">Buscar por nombre del negocio</span>
            <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre" className="h-full w-full bg-transparent text-base outline-none" />
          </label>
        </div>
        <DataTable
          etiqueta="Posibles socios registrados"
          filas={lista.items}
          cargando={lista.cargando}
          error={lista.error}
          alReintentar={lista.recargar}
          alSeleccionar={irAProspecto}
          vacio={<EmptyState icono={UserPlus} titulo={q || zonaFiltro ? 'Sin coincidencias' : 'Aún no hay posibles socios'} texto={q || zonaFiltro ? 'Pruebe con otro nombre o quite el filtro de zona.' : 'Registre el primero con el formulario: marque su ubicación en el mapa y guarde.'} />}
          columnas={[
            { clave: 'nombre_negocio', titulo: 'Negocio', movil: 'titulo', render: (p) => (<span className="flex flex-col"><span className="font-semibold text-ink">{p.nombre_negocio}</span>{p.referencia && <span className="text-xs text-muted">{p.referencia}</span>}</span>) },
            { clave: 'zona', titulo: 'Zona', render: (p) => (p.local ? <EstadoCola estado={p.estado_cola} /> : p.zona) },
            { clave: 'actividad', titulo: 'Actividad', render: (p) => p.actividad || '—' },
            { clave: 'created_at', titulo: 'Registrado', render: (p) => fmtFechaHora(p.created_at) },
            { clave: 'registrado_por', titulo: 'Por' },
          ]}
        />
        <LoadMoreFooter mostrando={lista.items.length} total={lista.total} hayMas={lista.hasMore} cargando={lista.cargandoMas} alVerMas={lista.verMas} />
      </GlassPanel>
    </Ensamblado>
  )
}
