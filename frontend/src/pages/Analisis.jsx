import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, FlaskConical, History, Play, Save, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { cacheInvalidate } from '../api/client'
import { Aviso, EncabezadoSeccion, ListaErrores } from '../components/admin/Bloques'
import { Campo } from '../components/admin/Campos'
import { aplicarErroresServidor, ariaCampo, claseControl } from '../components/admin/formulario'
import { BarraProgreso } from '../components/charts/ChartParts'
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/Estados'
import { Chip, GlassButton, GlassPanel } from '../components/glass/Glass'
import { Ensamblado, EncabezadoPagina } from '../components/layout/Ensamblado'
import { Segmentado } from '../components/layout/Pildora'
import { DataTable } from '../components/tables/DataTable'
import { useBarraSuperior, useFiltros } from '../context/FiltrosContext'
import { useToast } from '../context/ToastContext'
import { adminApi, VARIABLES_POTENCIAL } from '../features/admin/api'
import { useApi } from '../hooks/useApi'
import { fmtDecimal, fmtEntero, fmtFechaHora, periodoCorto, periodoLargo } from '../utils/format'

const esDemo = (c) => /DEMO/i.test(c?.nota || '')
const peso = z.number({ error: 'Ingrese un número.' }).min(0, 'Mínimo 0.').max(10, 'Máximo 10.')
const esquema = z
  .object({
    pesos: z.object(Object.fromEntries(VARIABLES_POTENCIAL.map((v) => [v.clave, peso]))),
    min_periodos: z.number({ error: 'Ingrese un número.' }).int('Debe ser un número entero.').min(2, 'Mínimo 2 períodos.').max(24, 'Máximo 24 períodos.'),
    nota: z.string().trim().max(300, 'Máximo 300 caracteres.'),
  })
  .refine((v) => Object.values(v.pesos).some((p) => p > 0), { path: ['total'], message: 'Al menos una variable debe tener peso mayor que 0.' })
const CAMPOS = [...VARIABLES_POTENCIAL.map((v) => `pesos.${v.clave}`), 'min_periodos', 'nota', 'total']

export default function Analisis() {
  useBarraSuperior({ periodo: true }, [])
  const conf = useApi((s) => adminApi.configuracionAnalisis(s), [])
  const estado = useApi((s) => adminApi.potencialEstado(s), [])
  const items = conf.data?.items || []
  const vigente = items.find((c) => c.vigente)
  const recargarTodo = () => {
    conf.recargar()
    estado.recargar()
  }

  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina
        titulo="Análisis de potencial"
        subtitulo="Configure los pesos de las variables y ejecute el cálculo del puntaje por zona. Cada versión y ejecución queda registrada."
        insignias={<Chip tono="violeta" icono={FlaskConical}>Resultados: Estimación no confirmada</Chip>}
      />
      {conf.error ? (
        <GlassPanel>
          <ErrorState error={conf.error} alReintentar={conf.recargar} />
        </GlassPanel>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-[var(--gap)] xl:grid-cols-12">
            <PanelEjecutar className="xl:col-span-5" estado={estado.data} vigente={vigente} alEjecutado={conf.recargar} />
            <GlassPanel className="min-w-0 p-5 md:p-6 xl:col-span-7" aria-labelledby="titulo-config">
              <EncabezadoSeccion
                id="titulo-config"
                titulo="Pesos de las variables"
                subtitulo={vigente ? `Versión vigente v${vigente.version} · ${vigente.responsable} · ${fmtFechaHora(vigente.created_at)}` : 'Sin configuración vigente'}
                extra={esDemo(vigente) && <Chip tono="violeta" icono={FlaskConical}>Pesos DEMO</Chip>}
              />
              {conf.cargando && !conf.data ? <LoadingState filas={5} /> : <FormPesos key={vigente?.version ?? 'nueva'} vigente={vigente} alGuardado={recargarTodo} />}
            </GlassPanel>
          </div>

          <GlassPanel className="min-w-0 p-2 md:p-3" aria-labelledby="titulo-ejecuciones">
            <div className="px-3 pt-3 md:px-4">
              <EncabezadoSeccion id="titulo-ejecuciones" titulo="Historial de ejecuciones" subtitulo="Últimas ejecuciones con su responsable, fecha y versión de pesos usada." />
            </div>
            <DataTable
              etiqueta="Historial de ejecuciones"
              filas={conf.data?.ejecuciones || []}
              cargando={conf.cargando && !conf.data}
              vacio={<EmptyState icono={History} titulo="Sin ejecuciones" texto="Ejecute el análisis para obtener el primer resultado." />}
              columnas={[
                { clave: 'ejecutado_en', titulo: 'Fecha', movil: 'titulo', render: (x) => fmtFechaHora(x.ejecutado_en) },
                { clave: 'periodo', titulo: 'Período', render: (x) => periodoCorto(x.periodo) },
                { clave: 'nivel', titulo: 'Nivel', render: (x) => (x.nivel === 'barrio' ? 'Barrio' : 'Parroquia') },
                { clave: 'configuracion_version', titulo: 'Pesos', render: (x) => `v${x.configuracion_version}` },
                { clave: 'zonas_evaluadas', titulo: 'Zonas', alinear: 'derecha', render: (x) => fmtEntero(x.zonas_evaluadas) },
                { clave: 'ejecutado_por', titulo: 'Responsable' },
                { clave: 'fecha_datos', titulo: 'Datos al', render: (x) => fmtFechaHora(x.fecha_datos) },
              ]}
            />
          </GlassPanel>

          <GlassPanel className="min-w-0 p-2 md:p-3" aria-labelledby="titulo-versiones">
            <div className="px-3 pt-3 md:px-4">
              <EncabezadoSeccion id="titulo-versiones" titulo="Versiones de la configuración" subtitulo="Cada cambio de pesos crea una versión nueva; las anteriores se conservan." />
            </div>
            <DataTable
              etiqueta="Versiones de la configuración"
              filas={items}
              cargando={conf.cargando && !conf.data}
              vacio={<EmptyState icono={SlidersHorizontal} titulo="Sin versiones" texto="Guarde la primera configuración de pesos." />}
              columnas={[
                {
                  clave: 'version',
                  titulo: 'Versión',
                  movil: 'titulo',
                  render: (c) => (
                    <span className="flex flex-wrap items-center gap-1.5 font-semibold">
                      v{c.version}
                      {c.vigente && <Chip tono="verde">Vigente</Chip>}
                      {esDemo(c) && <Chip tono="violeta">DEMO</Chip>}
                    </span>
                  ),
                },
                { clave: 'pesos', titulo: 'Pesos', render: (c) => <span className="text-xs text-ink-2">{VARIABLES_POTENCIAL.map((v) => `${v.etiqueta}: ${fmtDecimal(c.pesos?.[v.clave])}`).join(' · ')}</span> },
                { clave: 'min_periodos', titulo: 'Mín. períodos', alinear: 'derecha', render: (c) => fmtEntero(c.min_periodos) },
                { clave: 'responsable', titulo: 'Responsable' },
                { clave: 'created_at', titulo: 'Fecha', render: (c) => fmtFechaHora(c.created_at) },
                { clave: 'nota', titulo: 'Nota', movil: 'oculta', render: (c) => <span className="line-clamp-2 text-xs text-muted">{c.nota || '—'}</span> },
              ]}
            />
          </GlassPanel>
        </>
      )}
    </Ensamblado>
  )
}

function PanelEjecutar({ className, estado, vigente, alEjecutado }) {
  const toast = useToast()
  const { periodo } = useFiltros()
  const [nivel, setNivel] = useState('barrio')
  const [ejecutando, setEjecutando] = useState(false)
  const [resultado, setResultado] = useState(null) // {ok, e} | {error}
  const ejecutar = async () => {
    setEjecutando(true)
    setResultado(null)
    try {
      const e = await adminApi.ejecutarAnalisis(periodo, nivel)
      cacheInvalidate('/potencial')
      setResultado({ ok: true, e })
      toast.exito(`Análisis ejecutado: ${fmtEntero(e.zonas_evaluadas)} zonas evaluadas.`)
      alEjecutado()
    } catch (err) {
      setResultado({ error: err })
    } finally {
      setEjecutando(false)
    }
  }
  return (
    <GlassPanel className={`flex min-w-0 flex-col gap-4 p-5 md:p-6 ${className}`} aria-labelledby="titulo-ejecutar">
      <EncabezadoSeccion id="titulo-ejecutar" titulo="Ejecutar análisis" subtitulo={`Período ${periodoLargo(periodo)} (elíjalo en la barra superior)`} />
      <div className="flex flex-col gap-1.5">
        <span id="nivel-analisis" className="text-sm font-semibold text-ink-2">
          Nivel geográfico
        </span>
        <Segmentado etiqueta="Nivel geográfico del análisis" valor={nivel} alCambiar={setNivel} opciones={[{ valor: 'barrio', etiqueta: 'Barrios' }, { valor: 'parroquia', etiqueta: 'Parroquias' }]} />
      </div>
      {estado && !estado.operativo && (
        <Aviso tono="aviso" titulo="Condiciones pendientes">
          <ul className="list-disc pl-4">
            {estado.motivos.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Aviso>
      )}
      <p className="text-sm text-ink-2">
        Se usará la versión {vigente ? `v${vigente.version}` : '—'} de los pesos{estado ? ` y ${fmtEntero(estado.periodos_con_datos)} períodos con datos disponibles` : ''}. El resultado se guarda con su fecha y responsable.
      </p>
      {resultado?.error && (
        <Aviso tono={['SIN_CONFIGURACION', 'DATOS_INSUFICIENTES'].includes(resultado.error.code) ? 'aviso' : 'error'} rol="alert" titulo="No se pudo ejecutar el análisis">
          {resultado.error.message}
        </Aviso>
      )}
      {resultado?.ok && (
        <Aviso tono="ok" titulo="Análisis ejecutado">
          {fmtEntero(resultado.e.zonas_evaluadas)} zonas evaluadas ({resultado.e.nivel === 'barrio' ? 'barrios' : 'parroquias'}, {periodoCorto(resultado.e.periodo)}).{' '}
          <Link to="/potencial" className="inline-flex min-h-11 items-center gap-1 font-semibold underline">
            Ver el potencial <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Aviso>
      )}
      <GlassButton variante="primario" tam="lg" icono={Play} cargando={ejecutando} disabled={!periodo} onClick={ejecutar} className="mt-auto w-full sm:w-auto sm:self-end">
        Ejecutar análisis
      </GlassButton>
    </GlassPanel>
  )
}

function FormPesos({ vigente, alGuardado }) {
  const toast = useToast()
  const [sueltos, setSueltos] = useState([])
  const iniciales = {
    pesos: Object.fromEntries(VARIABLES_POTENCIAL.map((v) => [v.clave, Number(vigente?.pesos?.[v.clave] ?? 0)])),
    min_periodos: vigente?.min_periodos ?? 3,
    nota: '',
  }
  const {
    register,
    handleSubmit,
    setError,
    control,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({ resolver: zodResolver(esquema), defaultValues: iniciales })
  const pesos = useWatch({ control, name: 'pesos' }) || {}
  const total = VARIABLES_POTENCIAL.reduce((s, v) => s + (Number.isFinite(pesos[v.clave]) && pesos[v.clave] > 0 ? pesos[v.clave] : 0), 0)

  const enviar = async (v) => {
    setSueltos([])
    try {
      const c = await adminApi.guardarConfiguracion({
        pesos: Object.fromEntries(Object.entries(v.pesos).map(([k, p]) => [k, String(p)])),
        min_periodos: v.min_periodos,
        nota: v.nota.trim(),
      })
      toast.exito(`Configuración guardada como versión ${c.version}.`)
      alGuardado()
    } catch (e) {
      const resto = aplicarErroresServidor(e, setError, CAMPOS, { pesos: 'total' })
      setSueltos(resto.length ? resto : e.details?.length ? [] : [e.message])
    }
  }

  return (
    <form onSubmit={handleSubmit(enviar)} noValidate className="flex flex-col gap-4">
      {esDemo(vigente) && <Aviso tono="aviso">Los pesos vigentes son de demostración y no están validados por la cooperativa.</Aviso>}
      <ul className="flex flex-col gap-3">
        {VARIABLES_POTENCIAL.map((v) => {
          const id = `peso-${v.clave}`
          const err = errors.pesos?.[v.clave]
          const p = Number.isFinite(pesos[v.clave]) ? pesos[v.clave] : 0
          const share = total > 0 ? (Math.max(0, p) / total) * 100 : 0
          return (
            <li key={v.clave} className="glass-inset grid grid-cols-1 items-start gap-3 rounded-card p-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <div className="min-w-0">
                <label htmlFor={id} className="font-semibold text-ink">
                  {v.etiqueta}
                </label>
                <p id={`${id}-ayuda`} className="text-xs text-muted">
                  {v.descripcion}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <BarraProgreso valor={share} max={100} color="linear-gradient(90deg,#4a8fd8,#0f5daa)" etiqueta={`Participación de ${v.etiqueta}`} />
                  <span className="tnum w-14 shrink-0 text-right text-xs font-semibold text-ink-2">{share.toLocaleString('es-EC', { maximumFractionDigits: 1 })} %</span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <input type="number" inputMode="decimal" step="0.05" min="0" max="10" {...register(`pesos.${v.clave}`, { valueAsNumber: true })} {...ariaCampo(id, err, true)} className={claseControl(err)} />
                {err && (
                  <p id={`${id}-err`} className="text-xs font-medium text-danger-ink">
                    {err.message}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {errors.total && (
        <p role="alert" className="text-sm font-medium text-danger-ink">
          {errors.total.message}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <Campo id="min-periodos" etiqueta="Períodos mínimos" error={errors.min_periodos?.message} ayuda="De 2 a 24.">
          <input type="number" inputMode="numeric" step="1" min="2" max="24" {...register('min_periodos', { valueAsNumber: true })} {...ariaCampo('min-periodos', errors.min_periodos, true)} className={claseControl(errors.min_periodos)} />
        </Campo>
        <Campo id="nota-conf" etiqueta="Motivo del cambio" opcional error={errors.nota?.message} ayuda="Se guarda con la versión y en el historial.">
          <input {...register('nota')} maxLength={300} {...ariaCampo('nota-conf', errors.nota, true)} className={claseControl(errors.nota)} />
        </Campo>
      </div>
      <ListaErrores mensajes={sueltos} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <GlassButton disabled={!isDirty || isSubmitting} onClick={() => (reset(iniciales), setSueltos([]))}>
          Descartar
        </GlassButton>
        <GlassButton type="submit" variante="primario" icono={Save} disabled={!isDirty} cargando={isSubmitting}>
          Guardar nueva versión
        </GlassButton>
      </div>
    </form>
  )
}
