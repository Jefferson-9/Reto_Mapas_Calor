import { Ban, CircleCheckBig, EyeOff, Inbox, PencilLine, RefreshCw, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { cacheInvalidate } from '../../api/client'
import { Aviso, Cifra, EncabezadoSeccion, EstadoChip, ListaErrores } from '../../components/admin/Bloques'
import { Campo, FiltroSelect } from '../../components/admin/Campos'
import { DialogoJustificacion } from '../../components/admin/DialogoJustificacion'
import { aplicarErroresServidor, ariaCampo, claseControl, RE_PERIODO } from '../../components/admin/formulario'
import { EmptyState, ErrorState, LoadingState } from '../../components/feedback/Estados'
import { Chip, GlassButton, GlassPanel } from '../../components/glass/Glass'
import { GlassModal } from '../../components/glass/Overlay'
import { Ensamblado, EncabezadoPagina } from '../../components/layout/Ensamblado'
import { DataTable, LoadMoreFooter } from '../../components/tables/DataTable'
import { useBarraSuperior } from '../../context/FiltrosContext'
import { useToast } from '../../context/ToastContext'
import { CAMPOS_INFO, datosApi, EDITABLES, ESTADOS_OBSERVADO, etiquetaCampo, etiquetaTipo, TIPOS_CARGA } from '../../features/datos/api'
import { useApi, useCursorList } from '../../hooks/useApi'
import { fmtEntero, fmtFechaHora, periodoCorto } from '../../utils/format'

const AFECTADAS = ['/panel', '/mapa', '/indicadores', '/comparar', '/clasificacion', '/reportes', '/potencial']
const RE_ISO = /^\d{4}-\d{2}-\d{2}$/
const RE_DECIMAL = /^-?\d+(\.\d+)?$/
const RE_ENTERO = /^\d+$/

export default function Observados() {
  useBarraSuperior({}, [])
  const toast = useToast()
  const [estado, setEstado] = useState('pendiente')
  const [tipo, setTipo] = useState(null)
  const [accion, setAccion] = useState(null) // {tipo: 'corregir'|'descartar'|'conservar', obs}
  const resumen = useApi((s) => datosApi.resumenObservados(s), [])
  const lista = useCursorList(({ cursor, signal }) => datosApi.observados({ estado, tipo, cursor }, signal), [estado, tipo])

  const terminar = (mensaje) => {
    setAccion(null)
    toast.exito(mensaje)
    lista.recargar()
    resumen.recargar()
  }
  const resolver = async (fn, mensaje, nota) => {
    await fn(accion.obs.id, nota)
    terminar(mensaje)
  }

  const r = resumen.data
  const pe = r?.por_estado || {}
  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina titulo="Bandeja de depuración" subtitulo="Registros observados en las cargas: corríjalos, descártelos o consérvelos con una justificación" />

      <GlassPanel className="p-5 md:p-6" aria-labelledby="titulo-resumen-obs">
        <EncabezadoSeccion
          id="titulo-resumen-obs"
          titulo="Resumen"
          subtitulo="Los registros pendientes y los conservados con observación no participan en mapas ni indicadores."
          extra={<GlassButton tam="sm" icono={RefreshCw} onClick={() => (resumen.recargar(), lista.recargar())}>Actualizar</GlassButton>}
        />
        {resumen.error ? (
          <ErrorState error={resumen.error} alReintentar={resumen.recargar} compacto />
        ) : !r ? (
          <LoadingState filas={2} alto="h-20" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <Cifra etiqueta="Pendientes" valor={fmtEntero(pe.pendiente ?? 0)} tono="ambar" />
              <Cifra etiqueta="Corregidos" valor={fmtEntero(pe.corregido ?? 0)} tono="verde" />
              <Cifra etiqueta="Descartados" valor={fmtEntero(pe.descartado ?? 0)} />
              <Cifra etiqueta="Conservados" valor={fmtEntero(pe.conservado ?? 0)} tono="violeta" />
              <Cifra className="col-span-2 md:col-span-1" etiqueta="Excluidos de mapas e indicadores" valor={fmtEntero(r.excluidos ?? 0)} tono="rojo" icono={EyeOff} detalle="Pendientes + conservados" />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-2">
              <span className="text-muted">Por tipo:</span>
              {TIPOS_CARGA.map((t) => (
                <Chip key={t.valor}>
                  {t.etiqueta}: {fmtEntero(r.por_tipo?.[t.valor] ?? 0)}
                </Chip>
              ))}
              {r.socios_sin_zona > 0 && <span className="text-xs text-muted">· Además, {fmtEntero(r.socios_sin_zona)} socios sin zona válida están excluidos de mapas e indicadores.</span>}
            </div>
          </>
        )}
      </GlassPanel>

      <GlassPanel className="min-w-0 p-2 md:p-3" aria-labelledby="titulo-bandeja">
        <div className="px-3 pt-3 md:px-4">
          <EncabezadoSeccion id="titulo-bandeja" titulo="Registros" subtitulo="Los datos personales se muestran enmascarados." />
          <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-xl">
            <FiltroSelect id="f-obs-estado" etiqueta="Estado" valor={estado} alCambiar={setEstado} opciones={ESTADOS_OBSERVADO} />
            <FiltroSelect id="f-obs-tipo" etiqueta="Tipo" valor={tipo} alCambiar={setTipo} opciones={TIPOS_CARGA} />
          </div>
        </div>
        <DataTable
          etiqueta="Registros observados"
          filas={lista.items}
          cargando={lista.cargando}
          error={lista.error}
          alReintentar={lista.recargar}
          vacio={
            <EmptyState
              icono={estado === 'pendiente' ? CircleCheckBig : Inbox}
              titulo={estado === 'pendiente' ? 'No hay registros pendientes' : 'Sin registros'}
              texto={estado === 'pendiente' ? 'Todos los registros observados están resueltos. Los nuevos aparecerán aquí al confirmar una carga.' : 'No hay registros con estos filtros.'}
            />
          }
          columnas={[
            {
              clave: 'registro',
              titulo: 'Registro',
              movil: 'titulo',
              render: (f) => (
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold text-ink">
                    {etiquetaTipo(f.tipo)} · fila {f.numero_fila}
                  </span>
                  <span className="truncate text-xs text-muted">
                    {f.archivo} · {periodoCorto(f.periodo)}
                  </span>
                </span>
              ),
            },
            { clave: 'motivos', titulo: 'Motivos', render: (f) => <Motivos motivos={f.motivos} /> },
            { clave: 'fila_raw', titulo: 'Fila (enmascarada)', render: (f) => <ResumenFila fila={f.fila_raw} /> },
            {
              clave: 'estado',
              titulo: 'Estado',
              render: (f) => (
                <span className="flex flex-col items-start gap-1">
                  <EstadoChip dominio="observado" estado={f.estado} />
                  {f.resuelto_por && (
                    <span className="text-xs text-muted">
                      {f.resuelto_por} · {fmtFechaHora(f.resolved_at)}
                    </span>
                  )}
                  {f.nota && <span className="line-clamp-2 text-xs text-ink-2">«{f.nota}»</span>}
                </span>
              ),
            },
          ]}
          acciones={(f) =>
            ['pendiente', 'conservado'].includes(f.estado) && (
              <span className="inline-flex flex-wrap justify-end gap-1.5">
                <GlassButton tam="sm" variante="primario" icono={PencilLine} onClick={() => setAccion({ tipo: 'corregir', obs: f })}>
                  Corregir
                </GlassButton>
                {f.estado === 'pendiente' && (
                  <GlassButton tam="sm" icono={ShieldAlert} onClick={() => setAccion({ tipo: 'conservar', obs: f })}>
                    Conservar
                  </GlassButton>
                )}
                <GlassButton tam="sm" icono={Ban} onClick={() => setAccion({ tipo: 'descartar', obs: f })}>
                  Descartar
                </GlassButton>
              </span>
            )
          }
        />
        <LoadMoreFooter mostrando={lista.items.length} total={lista.total} hayMas={lista.hasMore} cargando={lista.cargandoMas} alVerMas={lista.verMas} />
      </GlassPanel>

      <GlassModal
        abierto={accion?.tipo === 'corregir'}
        alCerrar={() => setAccion(null)}
        titulo="Corregir registro observado"
        descripcion="La corrección se revalida antes de incorporarse a mapas e indicadores."
        ancho="max-w-2xl"
      >
        {accion?.tipo === 'corregir' && (
          <FormCorregir
            key={accion.obs.id}
            obs={accion.obs}
            alCerrar={() => setAccion(null)}
            alHecho={() => {
              cacheInvalidate(...AFECTADAS)
              terminar('Registro corregido, revalidado e incorporado a mapas e indicadores.')
            }}
          />
        )}
      </GlassModal>
      <DialogoJustificacion
        abierto={accion?.tipo === 'descartar'}
        alCerrar={() => setAccion(null)}
        titulo="Descartar registro"
        descripcion="El registro no se incorporará. La decisión queda registrada en el historial con su justificación."
        confirmar="Descartar"
        peligro
        alEnviar={(nota) => resolver(datosApi.descartar, 'Registro descartado.', nota)}
      >
        {accion?.obs && <ResumenObs obs={accion.obs} />}
      </DialogoJustificacion>
      <DialogoJustificacion
        abierto={accion?.tipo === 'conservar'}
        alCerrar={() => setAccion(null)}
        titulo="Conservar con observación"
        descripcion="El registro se conserva, pero sigue excluido de mapas e indicadores hasta que se corrija."
        confirmar="Conservar"
        alEnviar={(nota) => resolver(datosApi.conservar, 'Registro conservado con observación.', nota)}
      >
        {accion?.obs && <ResumenObs obs={accion.obs} />}
      </DialogoJustificacion>
    </Ensamblado>
  )
}

function Motivos({ motivos }) {
  if (!motivos?.length) return <span className="text-muted">—</span>
  return (
    <ul className="flex flex-col gap-0.5 text-sm">
      {motivos.map((m, i) => (
        <li key={i}>
          {m.campo && <span className="font-semibold text-ink">{etiquetaCampo(m.campo)}: </span>}
          <span className="text-ink-2">{m.motivo}</span>
        </li>
      ))}
    </ul>
  )
}

function ResumenFila({ fila }) {
  const e = Object.entries(fila || {}).slice(0, 5)
  if (!e.length) return <span className="text-muted">—</span>
  return <span className="line-clamp-3 text-xs text-ink-2">{e.map(([k, v]) => `${k}: ${v || '∅'}`).join(' · ')}</span>
}

function ResumenObs({ obs }) {
  return (
    <div className="glass-inset flex flex-col gap-2 rounded-card p-4">
      <p className="font-semibold text-ink">
        {etiquetaTipo(obs.tipo)} · fila {obs.numero_fila} · {obs.archivo}
      </p>
      <Motivos motivos={obs.motivos} />
    </div>
  )
}

/** Tipo de control según el campo y el valor actual (fechas no ISO se editan como texto para no perderlas). */
function controlDe(campo, valor) {
  const info = CAMPOS_INFO[campo] || {}
  if (info.tipo === 'fecha') return !valor || RE_ISO.test(valor) ? { type: 'date' } : { type: 'text', placeholder: 'AAAA-MM-DD' }
  if (info.tipo === 'periodo') return !valor || RE_PERIODO.test(valor) ? { type: 'month', placeholder: 'AAAA-MM' } : { type: 'text', placeholder: 'AAAA-MM' }
  if (info.tipo === 'decimal') return { type: 'text', inputMode: 'decimal' }
  if (info.tipo === 'entero') return { type: 'text', inputMode: 'numeric' }
  return { type: 'text' }
}

function reglas(campo) {
  const t = CAMPOS_INFO[campo]?.tipo
  if (campo === 'cedula') return { validate: (v) => !v || /^\d{10,13}$/.test(v.trim()) || 'La cédula debe tener de 10 a 13 dígitos.' }
  if (t === 'decimal') return { validate: (v) => !v || RE_DECIMAL.test(v.trim()) || 'Ingrese un número (use punto decimal).' }
  if (t === 'entero') return { validate: (v) => !v || RE_ENTERO.test(v.trim()) || 'Ingrese un número entero.' }
  if (t === 'periodo') return { validate: (v) => !v || RE_PERIODO.test(v.trim()) || 'Use el formato AAAA-MM.' }
  return {}
}

function FormCorregir({ obs, alCerrar, alHecho }) {
  const campos = EDITABLES[obs.tipo] || []
  const base = obs.datos?._fila || {}
  const iniciales = Object.fromEntries(campos.map((c) => [c, c === 'cedula' ? '' : String(base[c] ?? '')]))
  const conMotivo = new Set((obs.motivos || []).map((m) => m.campo))
  const [sueltos, setSueltos] = useState([])
  const [aunObservado, setAunObservado] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { datos: iniciales, nota: '' } })

  const enviar = async (v) => {
    setSueltos([])
    setAunObservado(false)
    const cambios = {}
    for (const c of campos) {
      const nuevo = (v.datos[c] ?? '').trim()
      if (c === 'cedula' ? nuevo : nuevo !== iniciales[c].trim()) cambios[c] = nuevo
    }
    try {
      await datosApi.corregir(obs.id, cambios, v.nota.trim())
      alHecho()
    } catch (e) {
      const alias = Object.fromEntries(campos.map((c) => [c, `datos.${c}`]))
      const resto = aplicarErroresServidor(e, setError, Object.values(alias), alias)
      setAunObservado(e.code === 'REGISTRO_AUN_OBSERVADO')
      setSueltos(resto.length ? resto : e.details?.length ? [] : [e.message])
    }
  }

  return (
    <form onSubmit={handleSubmit(enviar)} noValidate className="flex flex-col gap-4">
      <ResumenObs obs={obs} />
      {aunObservado && (
        <Aviso tono="aviso" rol="alert" titulo="El registro todavía no cumple las validaciones">
          Revise los campos marcados; no se incorporó ningún cambio.
        </Aviso>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {campos.map((c) => {
          const id = `corr-${c}`
          const err = errors.datos?.[c]
          const info = CAMPOS_INFO[c] || {}
          const ayuda = c === 'cedula' ? `Actual: ${base.cedula_mascara || 'sin cédula'}. Escriba la cédula completa solo si necesita corregirla; el servidor guarda únicamente su huella.` : info.ayuda
          return (
            <Campo
              key={c}
              id={id}
              error={err?.message}
              ayuda={ayuda}
              etiqueta={
                <>
                  {etiquetaCampo(c)}
                  {conMotivo.has(c) && (
                    <span className="ml-2 inline-flex rounded-full bg-sun-100 px-2 py-0.5 align-middle text-[11px] font-semibold text-sun-700">Observado</span>
                  )}
                </>
              }
            >
              <input
                {...register(`datos.${c}`, reglas(c))}
                {...controlDe(c, iniciales[c])}
                {...(c === 'cedula' ? { inputMode: 'numeric', autoComplete: 'off', placeholder: 'Sin cambios' } : { autoComplete: 'off' })}
                {...ariaCampo(id, err, ayuda)}
                className={claseControl(err)}
              />
            </Campo>
          )
        })}
      </div>
      <Campo id="corr-nota" etiqueta="Nota" opcional error={errors.nota?.message} ayuda="Se guarda en el historial junto con la corrección.">
        <textarea {...register('nota', { maxLength: { value: 300, message: 'Máximo 300 caracteres.' } })} {...ariaCampo('corr-nota', errors.nota, true)} rows={2} maxLength={300} className={claseControl(errors.nota, 'min-h-20 py-2.5')} />
      </Campo>
      <ListaErrores mensajes={sueltos} />
      <div className="flex flex-wrap justify-end gap-2">
        <GlassButton onClick={alCerrar} disabled={isSubmitting}>
          Cancelar
        </GlassButton>
        <GlassButton type="submit" variante="primario" icono={CircleCheckBig} cargando={isSubmitting}>
          Revalidar y corregir
        </GlassButton>
      </div>
    </form>
  )
}
