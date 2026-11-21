import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheck, CircleX, ClipboardCheck, Save } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useLocation } from 'react-router'
import { z } from 'zod'
import { nuevoUUID } from '../api/client'
import { AreaTexto, AvisoFormulario, Campo, Entrada, Selector } from '../components/campo/Campos'
import { RangoFechas } from '../components/campo/RangoFechas'
import { EmptyState, EtiquetaProvisional, FuncionBloqueada } from '../components/feedback/Estados'
import { Chip, GlassButton, GlassPanel } from '../components/glass/Glass'
import { Ensamblado, EncabezadoPagina } from '../components/layout/Ensamblado'
import { PildoraSelect, Segmentado } from '../components/layout/Pildora'
import { DataTable, LoadMoreFooter } from '../components/tables/DataTable'
import { useBarraSuperior, useFiltros } from '../context/FiltrosContext'
import { useToast } from '../context/ToastContext'
import { aplicarErroresCampos, campoApi, etiquetaResultado, fmtDia, hoyISO, RESULTADOS_VISITA } from '../features/campo/api'
import { useApi, useCursorList } from '../hooks/useApi'

const MENSAJE_BLOQUEO = 'El registro de visitas no está habilitado: requiere la aprobación de la cooperativa. Un administrador puede activarlo en Parámetros cuando exista esa aprobación.'

const esquema = z
  .object({
    zona_id: z.string().min(1, 'Seleccione la zona visitada.'),
    ruta_id: z.string(),
    fecha_visita: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indique la fecha de la visita.'),
    realizada: z.enum(['si', 'no']),
    resultado: z.string(),
    motivo_no_realizada: z.string().trim().max(300, 'Máximo 300 caracteres.'),
    observaciones: z.string().trim().max(500, 'Máximo 500 caracteres.'),
  })
  .superRefine((v, ctx) => {
    if (v.fecha_visita && v.fecha_visita > hoyISO()) ctx.addIssue({ code: 'custom', path: ['fecha_visita'], message: 'La fecha de la visita no puede ser futura.' })
    if (v.realizada === 'si' && !v.resultado) ctx.addIssue({ code: 'custom', path: ['resultado'], message: 'Indique el resultado de la visita.' })
    if (v.realizada === 'no' && !v.motivo_no_realizada) ctx.addIssue({ code: 'custom', path: ['motivo_no_realizada'], message: 'Indique el motivo por el que no se realizó.' })
  })

const valoresIniciales = (estado) => ({
  zona_id: estado?.zonaId ? String(estado.zonaId) : '',
  ruta_id: estado?.rutaId ? String(estado.rutaId) : '',
  fecha_visita: hoyISO(),
  realizada: 'si',
  resultado: '',
  motivo_no_realizada: '',
  observaciones: '',
})

/** CU-17 (condicionado): registro de visitas a zonas asignadas, desde una ruta o de forma suelta. */
export default function Visitas() {
  const toast = useToast()
  const location = useLocation()
  const { periodo } = useFiltros()
  const creadoRef = useRef(null)
  const [uuid, setUuid] = useState(nuevoUUID)
  const [hoy] = useState(hoyISO)
  const [inicial] = useState(() => valoresIniciales(location.state))
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [bloqueoEnvio, setBloqueoEnvio] = useState(false)
  const [desde, setDesde] = useState(null)
  const [hasta, setHasta] = useState(null)
  const [zonaFiltro, setZonaFiltro] = useState(null)

  const mis = useApi((s) => (periodo ? campoApi.misZonas(periodo, s) : Promise.resolve(null)), [periodo])
  const rutas = useApi((s) => campoApi.rutas(s), [])
  const zonas = useMemo(() => mis.data?.items || [], [mis.data])
  const opcionesZona = useMemo(() => zonas.map((i) => ({ valor: i.zona.id, etiqueta: i.zona.nombre, detalle: i.zona.codigo })), [zonas])
  useBarraSuperior(
    {
      extra: (
        <>
          <RangoFechas desde={desde} hasta={hasta} alCambiarDesde={setDesde} alCambiarHasta={setHasta} max={hoy} />
          <PildoraSelect prefijo="Zona" etiquetaAccesible="Filtrar visitas por zona" valor={zonaFiltro} opciones={opcionesZona} alCambiar={setZonaFiltro} todos="Todas" ancho={300} />
        </>
      ),
    },
    [desde, hasta, zonaFiltro, opcionesZona, hoy],
  )
  const lista = useCursorList(({ cursor, signal }) => campoApi.visitas({ desde, hasta, zona: zonaFiltro, cursor }, signal), [desde, hasta, zonaFiltro])

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(esquema), defaultValues: inicial })
  const [zonaId, realizada, rutaId] = useWatch({ control, name: ['zona_id', 'realizada', 'ruta_id'] })
  // Las rutas aún en la cola («local-…») no tienen id del servidor: no se pueden vincular a una visita
  const rutasDeZona = useMemo(() => (rutas.data?.items || []).filter((r) => !r.local && r.detalles.some((d) => String(d.zona_id) === zonaId)), [rutas.data, zonaId])
  const rutaInvalida = rutaId && rutas.data && !rutasDeZona.some((r) => String(r.id) === rutaId)

  const bloqueada = bloqueoEnvio || lista.error?.code === 'VISITAS_DESHABILITADAS'

  const enviar = async (v) => {
    setErrorGeneral(null)
    creadoRef.current ??= new Date().toISOString()
    const si = v.realizada === 'si'
    try {
      const r = await campoApi.registrarVisita({
        client_uuid: uuid,
        client_created_at: creadoRef.current,
        zona_id: Number(v.zona_id),
        ruta_id: v.ruta_id && !rutaInvalida ? Number(v.ruta_id) : null,
        fecha_visita: v.fecha_visita,
        realizada: si,
        resultado: si ? v.resultado : '',
        motivo_no_realizada: si ? '' : v.motivo_no_realizada,
        observaciones: v.observaciones,
      })
      if (r.encolado) toast.info('Sin conexión: la visita quedó guardada en este dispositivo y se enviará al recuperar la conexión.')
      else toast.exito(si ? `Visita a ${r.zona} registrada: ${etiquetaResultado(r.resultado)}.` : `Visita a ${r.zona} registrada como no realizada.`)
      reset({ ...valoresIniciales(null), fecha_visita: hoyISO() })
      setUuid(nuevoUUID())
      creadoRef.current = null
      lista.recargar()
    } catch (e) {
      if (e.code === 'VISITAS_DESHABILITADAS') {
        setBloqueoEnvio(true)
        return
      }
      if (e.code === 'CONFLICTO_IDEMPOTENCIA') {
        setUuid(nuevoUUID())
        creadoRef.current = null
      }
      let aplicado = aplicarErroresCampos(e, setError)
      if (e.code === 'ZONA_NO_ASIGNADA') {
        setError('zona_id', { type: 'servidor', message: e.message })
        aplicado = true
      }
      if (!aplicado) setErrorGeneral(e)
      toast.error(e.message)
    }
  }

  if (bloqueada) {
    return (
      <Ensamblado className="flex flex-col gap-[var(--gap)]">
        <EncabezadoPagina titulo="Registro de visitas" />
        <GlassPanel>
          <FuncionBloqueada titulo="Función no habilitada" mensaje={MENSAJE_BLOQUEO} />
        </GlassPanel>
      </Ensamblado>
    )
  }

  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina titulo="Registro de visitas" subtitulo="Registre lo ocurrido en cada visita a sus zonas asignadas" insignias={<EtiquetaProvisional texto="Función condicionada" detalle="Habilitada por la cooperativa. Los resultados de visita son opciones iniciales sujetas a aprobación." />} />

      <div className="grid grid-cols-1 gap-[var(--gap)] lg:grid-cols-12">
        <GlassPanel className="p-4 md:p-6 lg:col-span-5" aria-label="Registrar visita">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-[-0.02em]">
            <ClipboardCheck className="size-5 text-brand-600" aria-hidden /> Nueva visita
          </h2>
          <form onSubmit={(e) => handleSubmit(enviar)(e)} noValidate className="mt-4 flex flex-col gap-4">
            <Campo id="v-zona" etiqueta="Zona visitada" error={errors.zona_id?.message} ayuda={mis.error ? mis.error.message : zonas.length === 0 && mis.data ? 'No tiene zonas asignadas.' : undefined}>
              <Controller
                control={control}
                name="zona_id"
                render={({ field }) => (
                  <Selector
                    id="v-zona"
                    error={errors.zona_id?.message}
                    disabled={!mis.data}
                    name={field.name}
                    ref={field.ref}
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={(e) => {
                      field.onChange(e.target.value)
                      setValue('ruta_id', '')
                    }}
                  >
                <option value="">{mis.data ? 'Seleccione una zona' : 'Cargando zonas…'}</option>
                {zonas.map((i) => (
                  <option key={i.zona.id} value={String(i.zona.id)}>
                    {i.orden}. {i.zona.nombre}
                    {i.categoria ? ` — ${i.categoria.nombre}` : ''}
                  </option>
                ))}
                  </Selector>
                )}
              />
            </Campo>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo id="v-ruta" etiqueta="Ruta" opcional error={errors.ruta_id?.message} ayuda={zonaId && rutas.data && rutasDeZona.length === 0 ? 'Ninguna ruta activa incluye esta zona.' : undefined}>
                <Controller
                  control={control}
                  name="ruta_id"
                  render={({ field }) => (
                    <Selector id="v-ruta" error={errors.ruta_id?.message} disabled={!zonaId || rutasDeZona.length === 0} name={field.name} ref={field.ref} value={field.value} onBlur={field.onBlur} onChange={(e) => field.onChange(e.target.value)}>
                      <option value="">Sin ruta</option>
                      {rutasDeZona.map((r) => (
                        <option key={r.id} value={String(r.id)}>
                          {r.nombre} · {fmtDia(r.fecha_prevista)}
                        </option>
                      ))}
                    </Selector>
                  )}
                />
              </Campo>
              <Campo id="v-fecha" etiqueta="Fecha de la visita" error={errors.fecha_visita?.message}>
                <Entrada id="v-fecha" type="date" max={hoy} error={errors.fecha_visita?.message} {...register('fecha_visita')} />
              </Campo>
            </div>

            <div className="flex flex-col gap-1.5">
              <span id="v-realizada" className="text-sm font-semibold text-ink-2">
                ¿Se realizó la visita?
              </span>
              <Controller
                control={control}
                name="realizada"
                render={({ field }) => (
                  <Segmentado etiqueta="¿Se realizó la visita?" valor={field.value} alCambiar={field.onChange} opciones={[{ valor: 'si', etiqueta: 'Sí, se realizó' }, { valor: 'no', etiqueta: 'No se realizó' }]} />
                )}
              />
            </div>

            {realizada === 'si' ? (
              <fieldset className="flex flex-col gap-2" aria-describedby={errors.resultado ? 'v-resultado-error' : 'v-resultado-ayuda'}>
                <legend className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-2">
                  Resultado
                  <EtiquetaProvisional texto="Opciones sujetas a aprobación" detalle="Opciones iniciales propuestas por el equipo; la cooperativa debe aprobarlas." />
                </legend>
                <p id="v-resultado-ayuda" className="sr-only">
                  Opciones iniciales sujetas a aprobación
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {RESULTADOS_VISITA.map((r) => (
                    <label key={r.valor} className="press glass-control flex min-h-12 cursor-pointer items-center gap-3 rounded-control px-3 text-base has-[:checked]:bg-white has-[:checked]:font-semibold has-[:checked]:ring-2 has-[:checked]:ring-brand-400">
                      <input type="radio" value={r.valor} className="size-5 accent-brand-600" {...register('resultado')} />
                      {r.etiqueta}
                    </label>
                  ))}
                </div>
                {errors.resultado && (
                  <p id="v-resultado-error" role="alert" className="text-xs font-medium text-danger-ink">
                    {errors.resultado.message}
                  </p>
                )}
              </fieldset>
            ) : (
              <Campo id="v-motivo" etiqueta="Motivo por el que no se realizó" error={errors.motivo_no_realizada?.message}>
                <AreaTexto id="v-motivo" error={errors.motivo_no_realizada?.message} maxLength={300} placeholder="Ej.: el negocio estaba cerrado, lluvia intensa…" {...register('motivo_no_realizada')} />
              </Campo>
            )}

            <Campo id="v-obs" etiqueta="Observaciones" opcional error={errors.observaciones?.message}>
              <AreaTexto id="v-obs" error={errors.observaciones?.message} maxLength={500} {...register('observaciones')} />
            </Campo>

            {errorGeneral && <AvisoFormulario error={errorGeneral}>{errorGeneral.status === 0 && <p className="mt-1 text-xs">Puede reintentar: la visita no se duplicará.</p>}</AvisoFormulario>}
            <GlassButton type="submit" variante="primario" tam="lg" icono={Save} cargando={isSubmitting} className="w-full">
              {isSubmitting ? 'Guardando…' : 'Registrar visita'}
            </GlassButton>
          </form>
        </GlassPanel>

        <GlassPanel className="p-2 md:p-3 lg:col-span-7" aria-label="Visitas registradas">
          <div className="px-3 pt-3 pb-2">
            <h2 className="text-lg font-bold tracking-[-0.02em]">Visitas registradas</h2>
            <p className="text-sm text-muted">{lista.total != null ? `${lista.total} visitas` : 'Cargando…'}{desde || hasta ? ` · ${desde ? `desde ${fmtDia(desde)}` : ''} ${hasta ? `hasta ${fmtDia(hasta)}` : ''}` : ''}</p>
          </div>
          <DataTable
            etiqueta="Visitas registradas"
            filas={lista.items}
            cargando={lista.cargando}
            error={lista.error}
            alReintentar={lista.recargar}
            vacio={<EmptyState icono={ClipboardCheck} titulo={desde || hasta || zonaFiltro ? 'Sin visitas en el filtro' : 'Aún no registra visitas'} texto={desde || hasta || zonaFiltro ? 'Amplíe el rango de fechas o quite el filtro de zona.' : 'Use el formulario para registrar su primera visita.'} />}
            columnas={[
              { clave: 'zona', titulo: 'Zona', movil: 'titulo' },
              { clave: 'fecha_visita', titulo: 'Fecha', render: (v) => fmtDia(v.fecha_visita) },
              {
                clave: 'estado',
                titulo: 'Estado',
                render: (v) => (v.realizada ? <Chip tono="verde" icono={CircleCheck}>Realizada</Chip> : <Chip tono="rojo" icono={CircleX}>No realizada</Chip>),
              },
              { clave: 'resultado', titulo: 'Resultado o motivo', render: (v) => (v.realizada ? etiquetaResultado(v.resultado) : v.motivo_no_realizada || '—') },
              { clave: 'ruta', titulo: 'Ruta', render: (v) => v.ruta || '—' },
              { clave: 'observaciones', titulo: 'Observaciones', render: (v) => <span className="line-clamp-2">{v.observaciones || '—'}</span> },
            ]}
          />
          <LoadMoreFooter mostrando={lista.items.length} total={lista.total} hayMas={lista.hasMore} cargando={lista.cargandoMas} alVerMas={lista.verMas} />
        </GlassPanel>
      </div>
    </Ensamblado>
  )
}
