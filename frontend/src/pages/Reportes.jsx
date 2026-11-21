import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarClock, CheckCircle2, Download, FileSearch, FileSpreadsheet, FileText, Filter, Info, ShieldCheck, TriangleAlert, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { EtiquetaProvisional } from '../components/feedback/Estados'
import { GlassButton, GlassPanel } from '../components/glass/Glass'
import { Ensamblado, EncabezadoPagina, Pieza } from '../components/layout/Ensamblado'
import { useBarraSuperior, useFiltros } from '../context/FiltrosContext'
import { useToast } from '../context/ToastContext'
import { reportesApi } from '../features/reportes/api'
import { fmtFechaHora, periodoLargo } from '../utils/format'

const TIPOS = [
  { valor: 'socios', etiqueta: 'Socios', detalle: 'Socios, hogares estimados y penetración (%) por zona.' },
  { valor: 'creditos', etiqueta: 'Créditos', detalle: 'Créditos activos y monto de cartera (USD) por zona.' },
  { valor: 'pagos_atrasados', etiqueta: 'Pagos atrasados', detalle: 'Créditos con pagos atrasados, saldo vencido (USD) y tasa de morosidad (%) por zona.' },
  { valor: 'clasificacion', etiqueta: 'Clasificación', detalle: 'Orden de atención, categoría, frecuencia de visita, morosidad y penetración por barrio. Requiere criterios vigentes.' },
]
const NIVELES = [
  { valor: 'provincia', etiqueta: 'Provincia' },
  { valor: 'canton', etiqueta: 'Cantón' },
  { valor: 'parroquia', etiqueta: 'Parroquia' },
  { valor: 'barrio', etiqueta: 'Barrio o sector' },
]
const FORMATOS = [
  { valor: 'pdf', etiqueta: 'PDF', detalle: 'Para imprimir o compartir', icono: FileText },
  { valor: 'csv', etiqueta: 'CSV', detalle: 'Para hojas de cálculo', icono: FileSpreadsheet },
]
const INCLUYE = [
  { icono: CalendarClock, texto: 'Fecha y hora de generación y fecha de la última carga de datos.' },
  { icono: Filter, texto: 'Filtros aplicados: tipo, nivel geográfico, período y zona.' },
  { icono: ShieldCheck, texto: 'Solo la información de su ámbito (agencia o zonas asignadas).' },
  { icono: UserRound, texto: 'Usuario que lo generó; la generación queda registrada en el historial.' },
  { icono: Info, texto: '«Sin datos» indica ausencia de información: no equivale a cero.' },
]

const esquema = z.object({
  tipo: z.enum(['socios', 'creditos', 'pagos_atrasados', 'clasificacion'], { message: 'Elija el tipo de reporte.' }),
  nivel: z.enum(['provincia', 'canton', 'parroquia', 'barrio'], { message: 'Elija el nivel geográfico.' }),
  formato: z.enum(['pdf', 'csv'], { message: 'Elija el formato.' }),
})

function Opcion({ registro, valor, activo, deshabilitado, children, className = '' }) {
  return (
    <label
      className={`press relative flex min-h-11 cursor-pointer rounded-control px-4 py-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-400 ${activo ? 'bg-white text-ink shadow-[0_8px_20px_-12px_rgb(16_34_61/0.45)] ring-2 ring-brand-500' : 'glass-control text-ink-2 hover:text-ink'} ${deshabilitado ? 'cursor-not-allowed opacity-50' : ''} ${className}`}
    >
      <input type="radio" value={valor} disabled={deshabilitado} className="sr-only" {...registro} />
      {children}
    </label>
  )
}

export default function Reportes() {
  const { periodo, seleccion, opciones } = useFiltros()
  const toast = useToast()
  useBarraSuperior({ geo: true, periodo: true }, [])
  const [problema, setProblema] = useState(null)
  const [ultimo, setUltimo] = useState(null)
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(esquema), defaultValues: { tipo: 'creditos', nivel: 'barrio', formato: 'pdf' } })
  const tipo = useWatch({ control, name: 'tipo' })
  const nivel = useWatch({ control, name: 'nivel' })
  const formato = useWatch({ control, name: 'formato' })
  const esClasificacion = tipo === 'clasificacion'
  const zonaPadre = seleccion.zonaId ? opciones[seleccion.nivelZona]?.find((z) => z.id === seleccion.zonaId) : null
  const nivelEfectivo = esClasificacion ? 'barrio' : nivel

  const generar = handleSubmit(async (v) => {
    setProblema(null)
    if (!periodo) {
      setProblema({ titulo: 'Sin período', texto: 'Aún no hay períodos con datos cargados; no es posible generar reportes.' })
      return
    }
    try {
      await reportesApi.generar({ tipo: v.tipo, nivel: esClasificacion ? 'barrio' : v.nivel, periodo, formato: v.formato, padre: esClasificacion ? null : seleccion.zonaId })
      const t = TIPOS.find((x) => x.valor === v.tipo)?.etiqueta
      setUltimo({ texto: `Reporte de ${t.toLowerCase()} (${v.formato.toUpperCase()}) de ${periodoLargo(periodo)}`, en: new Date().toISOString() })
      toast.exito('Reporte generado y descargado.')
    } catch (e) {
      if (e.code === 'REPORTE_VACIO') {
        setProblema({ vacio: true, titulo: 'No hay datos para estos filtros', texto: `${e.message} Pruebe con otro período, nivel geográfico o zona en la barra superior.` })
      } else if (e.code === 'SIN_CRITERIOS_VIGENTES') {
        setProblema({ titulo: 'Sin criterios aprobados', texto: e.message })
      } else {
        Object.entries(e.campos || {}).forEach(([campo, mensaje]) => ['tipo', 'nivel', 'formato'].includes(campo) && setError(campo, { message: mensaje }))
        setProblema({ titulo: e.status === 403 ? 'Sin permiso' : 'No se pudo generar el reporte', texto: e.status === 403 ? 'No tiene permiso para generar reportes.' : e.message })
      }
      toast.error(e.code === 'REPORTE_VACIO' ? 'No se generó el reporte: no hay datos para los filtros.' : e.message)
    }
  })

  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina titulo="Reportes por zona" subtitulo="Genere reportes en PDF o CSV con los filtros de la barra superior" insignias={<EtiquetaProvisional />} />

      <div className="grid grid-cols-1 gap-[var(--gap)] xl:grid-cols-12">
        <GlassPanel className="p-5 md:p-6 xl:col-span-8">
          <form noValidate onSubmit={generar} onChange={() => setProblema(null)} className="flex flex-col gap-6">
            <fieldset className="flex flex-col gap-2" aria-describedby={errors.tipo ? 'err-tipo' : undefined} aria-invalid={errors.tipo ? true : undefined}>
              <legend className="mb-2 text-sm font-semibold text-ink">Tipo de reporte</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {TIPOS.map((t) => (
                  <Opcion key={t.valor} registro={register('tipo')} valor={t.valor} activo={tipo === t.valor}>
                    <span className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-2 font-semibold text-ink">
                        {tipo === t.valor && <CheckCircle2 className="size-4 text-brand-600" aria-hidden />}
                        {t.etiqueta}
                      </span>
                      <span className="text-xs text-muted">{t.detalle}</span>
                    </span>
                  </Opcion>
                ))}
              </div>
              {errors.tipo && (
                <span id="err-tipo" className="text-xs font-medium text-danger-ink">
                  {errors.tipo.message}
                </span>
              )}
            </fieldset>

            <fieldset className="flex flex-col gap-2" aria-describedby={[errors.nivel && 'err-nivel', esClasificacion && 'ayuda-nivel'].filter(Boolean).join(' ') || undefined} aria-invalid={errors.nivel ? true : undefined}>
              <legend className="mb-2 text-sm font-semibold text-ink">Nivel geográfico</legend>
              <div className="flex flex-wrap gap-2">
                {NIVELES.map((n) => (
                  <Opcion key={n.valor} registro={register('nivel')} valor={n.valor} activo={nivelEfectivo === n.valor} deshabilitado={esClasificacion} className="rounded-full py-2">
                    <span className="flex items-center gap-1.5 font-medium">
                      {nivelEfectivo === n.valor && <CheckCircle2 className="size-4 text-brand-600" aria-hidden />}
                      {n.etiqueta}
                    </span>
                  </Opcion>
                ))}
              </div>
              {esClasificacion && (
                <span id="ayuda-nivel" className="text-xs text-muted">
                  La clasificación se calcula por barrio o sector; el nivel no aplica.
                </span>
              )}
              {errors.nivel && (
                <span id="err-nivel" className="text-xs font-medium text-danger-ink">
                  {errors.nivel.message}
                </span>
              )}
            </fieldset>

            <fieldset className="flex flex-col gap-2" aria-describedby={errors.formato ? 'err-formato' : undefined} aria-invalid={errors.formato ? true : undefined}>
              <legend className="mb-2 text-sm font-semibold text-ink">Formato</legend>
              <div className="grid grid-cols-2 gap-2 sm:max-w-md">
                {FORMATOS.map((f) => (
                  <Opcion key={f.valor} registro={register('formato')} valor={f.valor} activo={formato === f.valor}>
                    <span className="flex items-center gap-3">
                      <f.icono className={`size-5 shrink-0 ${formato === f.valor ? 'text-brand-600' : 'text-muted'}`} aria-hidden />
                      <span className="flex flex-col">
                        <span className="font-semibold text-ink">{f.etiqueta}</span>
                        <span className="text-xs text-muted">{f.detalle}</span>
                      </span>
                    </span>
                  </Opcion>
                ))}
              </div>
              {errors.formato && (
                <span id="err-formato" className="text-xs font-medium text-danger-ink">
                  {errors.formato.message}
                </span>
              )}
            </fieldset>

            <div className="glass-inset rounded-card p-4">
              <p className="text-sm font-semibold text-ink">Filtros de la barra superior</p>
              <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted">Período</dt>
                  <dd className="font-semibold text-ink-2">{periodo ? periodoLargo(periodo) : 'Sin períodos con datos'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Zona</dt>
                  <dd className="font-semibold text-ink-2">{esClasificacion ? 'Todo su ámbito' : zonaPadre ? `Dentro de ${zonaPadre.nombre}` : 'Todo su ámbito'}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-muted">Para cambiarlos use el período y los filtros geográficos de la barra superior.</p>
            </div>

            {problema && (
              <div role="alert" className={`flex items-start gap-3 rounded-card p-4 ${problema.vacio ? 'bg-sun-100' : 'bg-[#fbe9e5]'}`}>
                {problema.vacio ? <FileSearch className="mt-0.5 size-5 shrink-0 text-sun-700" aria-hidden /> : <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger-ink" aria-hidden />}
                <div>
                  <p className={`font-semibold ${problema.vacio ? 'text-sun-700' : 'text-danger-ink'}`}>{problema.titulo}</p>
                  <p className="mt-0.5 text-sm text-ink-2">{problema.texto}</p>
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 border-t border-white/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted" role="status">
                {ultimo ? (
                  <>
                    <CheckCircle2 className="mr-1 inline size-4 text-ok" aria-hidden />
                    {ultimo.texto} · descargado {fmtFechaHora(ultimo.en)}
                  </>
                ) : (
                  'El archivo se descarga al terminar de generarse.'
                )}
              </p>
              <GlassButton type="submit" variante="primario" icono={Download} cargando={isSubmitting} disabled={!periodo} tam="lg">
                Generar y descargar
              </GlassButton>
            </div>
          </form>
        </GlassPanel>

        <GlassPanel className="flex flex-col gap-4 p-5 md:p-6 xl:col-span-4">
          <div>
            <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">Qué incluye cada reporte</h2>
            <p className="text-sm text-muted">Todos los reportes, en PDF o CSV, contienen:</p>
          </div>
          <ul className="flex flex-col gap-3">
            {INCLUYE.map((i) => (
              <Pieza as="li" key={i.texto} className="flex items-start gap-3 text-sm text-ink-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                  <i.icono className="size-4" aria-hidden />
                </span>
                {i.texto}
              </Pieza>
            ))}
          </ul>
          <p className="glass-inset rounded-card p-3 text-xs text-muted">Si no hay datos para los filtros elegidos, el reporte no se genera vacío: se le avisa para que ajuste los filtros.</p>
        </GlassPanel>
      </div>
    </Ensamblado>
  )
}
