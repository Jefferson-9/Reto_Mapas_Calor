import { zodResolver } from '@hookform/resolvers/zod'
import { RotateCcw, Save } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Aviso, EncabezadoSeccion, ListaErrores } from '../components/admin/Bloques'
import { Campo, Interruptor } from '../components/admin/Campos'
import { aplicarErroresServidor, ariaCampo, claseControl } from '../components/admin/formulario'
import { ConfirmDialog, ErrorState, EtiquetaProvisional, LoadingState } from '../components/feedback/Estados'
import { Chip, GlassButton, GlassPanel } from '../components/glass/Glass'
import { Ensamblado, EncabezadoPagina } from '../components/layout/Ensamblado'
import { useAuth } from '../context/AuthContext'
import { useBarraSuperior } from '../context/FiltrosContext'
import { useToast } from '../context/ToastContext'
import { adminApi } from '../features/admin/api'
import { useApi } from '../hooks/useApi'
import { fmtFechaHora } from '../utils/format'

const INTERRUPTORES = [
  {
    clave: 'habilitar_registro_visitas',
    etiqueta: 'Registro y seguimiento de visitas',
    descripcion: 'Permite a los oficiales registrar visitas de campo y a jefaturas y supervisión darles seguimiento. Actívelo solo con la aprobación de la cooperativa.',
    activar: 'Las pantallas de Visitas y Seguimiento aparecerán para los roles con permiso.',
    desactivar: 'Las pantallas de Visitas y Seguimiento dejarán de estar disponibles. Los registros existentes se conservan.',
  },
  {
    clave: 'habilitar_analisis_predictivo',
    etiqueta: 'Análisis de potencial de captación',
    descripcion: 'Puntaje ponderado y transparente por zona (no es un modelo de aprendizaje automático). Requiere la aprobación de la cooperativa y suficientes períodos con datos.',
    activar: 'Las pantallas de Potencial y Análisis aparecerán para los roles con permiso. Los resultados siempre se marcan como «Estimación no confirmada».',
    desactivar: 'Las pantallas de Potencial y Análisis dejarán de estar disponibles. Las configuraciones y ejecuciones guardadas se conservan.',
  },
  {
    clave: 'habilitar_modo_offline',
    etiqueta: 'Modo campo sin conexión',
    descripcion: 'Requisito adicional propuesto (riesgo del Acta), pendiente de validación. Permite a los oficiales consultar sus zonas y rutas y registrar posibles socios, rutas nuevas y visitas sin internet; se sincroniza al reconectar. No es una aplicación de tienda: se usa por la misma URL tras una visita previa con conexión.',
    activar: 'Tras su próxima visita con conexión, los oficiales podrán abrir la aplicación sin internet dentro de la ventana configurada. Solo se guardan en el dispositivo sus zonas, rutas e indicadores agregados (nunca datos individuales de socios).',
    desactivar: 'Se retirará el service worker y los datos locales de los dispositivos en su próxima visita con conexión; antes se enviarán los registros pendientes para no perder trabajo.',
  },
]
const BLOQUEADOS = [
  {
    clave: 'habilitar_conexion_bd',
    etiqueta: 'Conexión directa a la base de datos',
    descripcion: 'No disponible: requiere aprobación institucional, un sistema fuente y credenciales. La información se incorpora mediante carga de archivos CSV.',
  },
]

const ent = (min, max) =>
  z
    .number({ error: 'Ingrese un número.' })
    .int('Debe ser un número entero.')
    .min(min, `Mínimo ${min.toLocaleString('es-EC')}.`)
    .max(max, `Máximo ${max.toLocaleString('es-EC')}.`)
const banda = z.number({ error: 'Ingrese un número.' }).gt(0, 'Debe ser mayor que 0.').lt(1, 'Debe ser menor que 1.')

const esquema = z
  .object({
    minutos_inactividad_sesion: ent(1, 480),
    horas_ventana_offline: ent(1, 168),
    dias_atraso_minimo: ent(1, 365),
    max_mb_carga: ent(1, 100),
    max_filas_carga: ent(10, 500000),
    tamano_lote: ent(50, 5000),
    decimales_minimos_coordenada: ent(0, 8),
    tamano_pagina: ent(5, 100),
    max_puntos_mapa: ent(100, 20000),
    bandas_potencial: z.object({ alto: banda, medio: banda }),
  })
  .refine((v) => v.bandas_potencial.medio < v.bandas_potencial.alto, { path: ['bandas_potencial', 'medio'], message: 'El umbral medio debe ser menor que el alto.' })

const GRUPOS = [
  {
    titulo: 'Sesión',
    campos: [
      ['minutos_inactividad_sesion', 'Cierre por inactividad', 'minutos', 'La sesión se cierra tras este tiempo sin actividad (1 a 480). Sin conexión, la pantalla se bloquea.'],
      ['horas_ventana_offline', 'Ventana de trabajo sin conexión', 'horas', 'Tiempo desde el último acceso en línea en que se puede trabajar sin conexión (1 a 168).'],
    ],
  },
  { titulo: 'Indicadores', campos: [['dias_atraso_minimo', 'Atraso mínimo para «pago atrasado»', 'días', 'Un crédito cuenta como atrasado desde estos días de atraso (1 a 365).']] },
  {
    titulo: 'Carga de archivos',
    campos: [
      ['max_mb_carga', 'Tamaño máximo por archivo', 'MB', 'De 1 a 100 MB.'],
      ['max_filas_carga', 'Filas máximas por archivo', 'filas', 'De 10 a 500 000 filas.'],
      ['tamano_lote', 'Tamaño de lote al guardar', 'filas', 'De 50 a 5000. Afecta al rendimiento de la confirmación.'],
      ['decimales_minimos_coordenada', 'Decimales mínimos en coordenadas', 'decimales', 'Precisión mínima de latitud y longitud (0 a 8).'],
    ],
  },
  {
    titulo: 'Listas y mapa',
    campos: [
      ['tamano_pagina', 'Registros por página', 'filas', 'De 5 a 100 por cada «Ver más».'],
      ['max_puntos_mapa', 'Puntos individuales máximos en el mapa', 'puntos', 'De 100 a 20 000.'],
    ],
  },
]
const CAMPOS = [...GRUPOS.flatMap((g) => g.campos.map((c) => c[0])), 'bandas_potencial.alto', 'bandas_potencial.medio']

const aFormulario = (d) => ({
  ...Object.fromEntries(GRUPOS.flatMap((g) => g.campos.map(([k]) => [k, Number(d[k])]))),
  bandas_potencial: { alto: Number(d.bandas_potencial?.alto), medio: Number(d.bandas_potencial?.medio) },
})

export default function Parametros() {
  useBarraSuperior({}, [])
  const { data, error, cargando, recargar, mutar } = useApi((s) => adminApi.parametros(s), [])
  const { recargarParametros } = useAuth()
  const actualizado = (nuevo) => {
    mutar(nuevo)
    recargarParametros()
  }
  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina titulo="Parámetros institucionales" subtitulo={data ? `Última modificación: ${fmtFechaHora(data.updated_at)}. Cada cambio queda en el historial.` : 'Interruptores de funciones y límites de operación'} />
      {error ? (
        <GlassPanel>
          <ErrorState error={error} alReintentar={recargar} />
        </GlassPanel>
      ) : cargando || !data ? (
        <GlassPanel className="p-5">
          <LoadingState filas={6} alto="h-16" />
        </GlassPanel>
      ) : (
        <>
          <PanelInterruptores data={data} alActualizado={actualizado} />
          <FormParametros data={data} alActualizado={actualizado} />
        </>
      )}
    </Ensamblado>
  )
}

function PanelInterruptores({ data, alActualizado }) {
  const toast = useToast()
  const [pendiente, setPendiente] = useState(null) // {def, valor}
  const [guardando, setGuardando] = useState(false)
  const aplicar = async () => {
    const { def, valor } = pendiente
    setGuardando(true)
    try {
      alActualizado(await adminApi.guardarParametros({ [def.clave]: valor }))
      toast.exito(`${def.etiqueta}: ${valor ? 'activado' : 'desactivado'}.`)
      setPendiente(null)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setGuardando(false)
    }
  }
  return (
    <GlassPanel className="p-5 md:p-6" aria-labelledby="titulo-interruptores">
      <EncabezadoSeccion id="titulo-interruptores" titulo="Funciones condicionadas" subtitulo="Funciones que dependen de una decisión de la cooperativa. Cada cambio se confirma y se audita." />
      <ul className="flex flex-col gap-3">
        {INTERRUPTORES.map((d) => (
          <li key={d.clave} className="glass-inset rounded-card p-4">
            <Interruptor id={`sw-${d.clave}`} activo={Boolean(data[d.clave])} etiqueta={d.etiqueta} descripcion={d.descripcion} cargando={guardando && pendiente?.def.clave === d.clave} alCambiar={(v) => setPendiente({ def: d, valor: v })} />
          </li>
        ))}
        {BLOQUEADOS.map((d) => (
          <li key={d.clave} className="glass-inset rounded-card p-4">
            <Interruptor id={`sw-${d.clave}`} activo={Boolean(data[d.clave])} etiqueta={d.etiqueta} descripcion={d.descripcion} bloqueado insignia={<Chip tono="neutro">No disponible</Chip>} />
          </li>
        ))}
      </ul>
      <ConfirmDialog
        abierto={Boolean(pendiente)}
        alCerrar={() => !guardando && setPendiente(null)}
        alConfirmar={aplicar}
        cargando={guardando}
        peligro={pendiente?.valor === false}
        titulo={pendiente ? `¿${pendiente.valor ? 'Activar' : 'Desactivar'} «${pendiente.def.etiqueta}»?` : ''}
        texto={pendiente ? (pendiente.valor ? pendiente.def.activar : pendiente.def.desactivar) : ''}
        confirmar={pendiente?.valor ? 'Activar' : 'Desactivar'}
      >
        {pendiente?.valor && <p className="text-sm text-ink-2">Confirme que existe la aprobación de la cooperativa para esta función.</p>}
      </ConfirmDialog>
    </GlassPanel>
  )
}

function FormParametros({ data, alActualizado }) {
  const toast = useToast()
  const [sueltos, setSueltos] = useState([])
  const iniciales = aFormulario(data)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, dirtyFields, isDirty },
  } = useForm({ resolver: zodResolver(esquema), defaultValues: iniciales })

  const enviar = async (v) => {
    setSueltos([])
    const cambios = {}
    GRUPOS.forEach((g) => g.campos.forEach(([k]) => dirtyFields[k] && (cambios[k] = v[k])))
    if (dirtyFields.bandas_potencial) cambios.bandas_potencial = { alto: v.bandas_potencial.alto, medio: v.bandas_potencial.medio }
    if (!Object.keys(cambios).length) return
    try {
      const nuevo = await adminApi.guardarParametros(cambios)
      alActualizado(nuevo)
      reset(aFormulario(nuevo))
      toast.exito('Parámetros guardados.')
    } catch (e) {
      const resto = aplicarErroresServidor(e, setError, CAMPOS, { bandas_potencial: 'bandas_potencial.alto' })
      setSueltos(resto.length ? resto : e.details?.length ? [] : [e.message])
    }
  }

  const campo = ([k, etiqueta, unidad, ayuda]) => {
    const id = `par-${k}`
    return (
      <Campo key={k} id={id} etiqueta={etiqueta} error={errors[k]?.message} ayuda={ayuda}>
        <span className="relative flex items-center">
          <input type="number" inputMode="numeric" step="1" {...register(k, { valueAsNumber: true })} {...ariaCampo(id, errors[k], true)} className={claseControl(errors[k], 'pr-24')} />
          <span aria-hidden className="pointer-events-none absolute right-3 text-sm text-muted">
            {unidad}
          </span>
        </span>
      </Campo>
    )
  }
  const eb = errors.bandas_potencial || {}
  return (
    <GlassPanel className="p-5 md:p-6" aria-labelledby="titulo-parametros">
      <form onSubmit={handleSubmit(enviar)} noValidate>
        <EncabezadoSeccion id="titulo-parametros" titulo="Parámetros de operación" subtitulo="Solo se envían los valores que modifique." extra={isDirty && <Chip tono="ambar">Cambios sin guardar</Chip>} />
        <div className="flex flex-col gap-6">
          {GRUPOS.map((g) => (
            <fieldset key={g.titulo} className="min-w-0">
              <legend className="mb-3 text-sm font-bold text-ink">{g.titulo}</legend>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{g.campos.map(campo)}</div>
            </fieldset>
          ))}
          <fieldset className="min-w-0">
            <legend className="mb-3 flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
              Bandas del potencial de captación <EtiquetaProvisional texto="Umbrales DEMO" detalle="Los umbrales iniciales son de demostración y deben validarse con la cooperativa." />
            </legend>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Campo id="par-banda-alto" etiqueta="Potencial alto desde" error={eb.alto?.message} ayuda="Puntaje entre 0 y 1 (p. ej. 0,66).">
                <input type="number" inputMode="decimal" step="0.01" min="0" max="1" {...register('bandas_potencial.alto', { valueAsNumber: true })} {...ariaCampo('par-banda-alto', eb.alto, true)} className={claseControl(eb.alto)} />
              </Campo>
              <Campo id="par-banda-medio" etiqueta="Potencial medio desde" error={eb.medio?.message} ayuda="Debe ser menor que el umbral alto; por debajo, el potencial es bajo.">
                <input type="number" inputMode="decimal" step="0.01" min="0" max="1" {...register('bandas_potencial.medio', { valueAsNumber: true })} {...ariaCampo('par-banda-medio', eb.medio, true)} className={claseControl(eb.medio)} />
              </Campo>
            </div>
          </fieldset>
          <Aviso tono="info">Los cambios en los límites de carga y en el atraso mínimo se aplican a las próximas cargas y recálculos; no modifican resultados ya guardados.</Aviso>
          <ListaErrores mensajes={sueltos} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <GlassButton icono={RotateCcw} disabled={!isDirty || isSubmitting} onClick={() => (reset(iniciales), setSueltos([]))}>
              Descartar
            </GlassButton>
            <GlassButton type="submit" variante="primario" icono={Save} disabled={!isDirty} cargando={isSubmitting}>
              Guardar parámetros
            </GlassButton>
          </div>
        </div>
      </form>
    </GlassPanel>
  )
}
