import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Plus, Save, ShieldCheck, Trash2, TriangleAlert, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Controller, get, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useToast } from '../../context/ToastContext'
import { OPERADORES_CRITERIO, VARIABLES_CRITERIO, clasificacionApi } from '../../features/clasificacion/api'
import { ConfirmDialog, EtiquetaProvisional } from '../feedback/Estados'
import { Chip, GlassButton, GlassPanel, IconButton } from '../glass/Glass'
import { Campo } from './Partes'
import { aPayload, categoriaVacia, esquemaCriterios, lugarError, mapaErrores, reglaVacia } from './criteriosForm'
import { CLASE_CONTROL } from './formatos'

const UNIDAD = {
  tasa_morosidad: 'En porcentaje: 10 equivale a 10 %.',
  penetracion_pct: 'En porcentaje: 3 equivale a 3 %.',
  monto_cartera: 'En dólares (USD).',
  saldo_vencido: 'En dólares (USD).',
}
const COLOR_OK = /^#[0-9A-Fa-f]{6}$/

function ReglaEditor({ base, indice, control, register, error, quitar, unica }) {
  const op = useWatch({ control, name: `${base}.operador` })
  const variable = useWatch({ control, name: `${base}.variable` })
  const errUmbral = error(`${base}.umbral`)
  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-white/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">Regla {indice + 1}</span>
        <IconButton icono={Trash2} etiqueta={`Quitar regla ${indice + 1}`} onClick={quitar} disabled={unica} className="disabled:opacity-40" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
        <Campo etiqueta="Variable" error={error(`${base}.variable`)}>
          {(a11y) => (
            <select {...a11y} {...register(`${base}.variable`)} className={CLASE_CONTROL}>
              {VARIABLES_CRITERIO.map((v) => (
                <option key={v.valor} value={v.valor}>
                  {v.etiqueta}
                </option>
              ))}
            </select>
          )}
        </Campo>
        <Campo etiqueta="Condición" error={error(`${base}.operador`)}>
          {(a11y) => (
            <select {...a11y} {...register(`${base}.operador`)} className={CLASE_CONTROL}>
              {OPERADORES_CRITERIO.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          )}
        </Campo>
        {op === 'entre' ? (
          <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
            <Campo etiqueta="Mínimo" error={error(`${base}.umbral_min`) || errUmbral} ayuda={UNIDAD[variable]}>
              {(a11y) => <input {...a11y} {...register(`${base}.umbral_min`)} type="text" inputMode="decimal" autoComplete="off" className={CLASE_CONTROL} />}
            </Campo>
            <Campo etiqueta="Máximo" error={error(`${base}.umbral_max`)}>
              {(a11y) => <input {...a11y} {...register(`${base}.umbral_max`)} type="text" inputMode="decimal" autoComplete="off" className={CLASE_CONTROL} />}
            </Campo>
          </div>
        ) : (
          <Campo etiqueta="Umbral" error={errUmbral} ayuda={UNIDAD[variable]}>
            {(a11y) => <input {...a11y} {...register(`${base}.umbral`)} type="text" inputMode="decimal" autoComplete="off" className={CLASE_CONTROL} />}
          </Campo>
        )}
      </div>
    </li>
  )
}

function CategoriaEditor({ indice, control, register, error, quitar, unica, alCambiarEstructura }) {
  const base = `categorias.${indice}`
  const reglas = useFieldArray({ control, name: `${base}.reglas` })
  const color = useWatch({ control, name: `${base}.color_hex` })
  const nombre = useWatch({ control, name: `${base}.nombre` })
  const errReglas = error(`${base}.reglas`)
  return (
    <li className="glass-inset flex flex-col gap-4 rounded-card p-4 md:p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 text-base font-bold text-ink">
          <span className="size-4 shrink-0 rounded-full ring-2 ring-white" style={{ background: COLOR_OK.test(color || '') ? color : '#c9c2b4' }} aria-hidden />
          <span className="truncate">
            Categoría {indice + 1}
            {nombre?.trim() ? `: ${nombre.trim()}` : ''}
          </span>
        </h3>
        <GlassButton
          variante="fantasma"
          icono={Trash2}
          tam="sm"
          disabled={unica}
          onClick={() => {
            quitar()
            alCambiarEstructura()
          }}
        >
          Quitar categoría
        </GlassButton>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Nombre" error={error(`${base}.nombre`)} className="sm:col-span-2">
          {(a11y) => <input {...a11y} {...register(`${base}.nombre`)} type="text" maxLength={80} autoComplete="off" className={CLASE_CONTROL} />}
        </Campo>
        <Controller
          control={control}
          name={`${base}.color_hex`}
          render={({ field }) => (
            <Campo etiqueta="Color (#RRGGBB)" error={error(`${base}.color_hex`)}>
              {(a11y) => (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    name={field.name}
                    aria-label={`Elegir color de la categoría ${indice + 1}`}
                    value={COLOR_OK.test(field.value || '') ? field.value.toLowerCase() : '#000000'}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    className="press h-11 w-12 shrink-0 cursor-pointer rounded-control border-0 bg-transparent p-0.5"
                  />
                  <input
                    {...a11y}
                    ref={field.ref}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    maxLength={7}
                    autoComplete="off"
                    spellCheck={false}
                    className={`${CLASE_CONTROL} uppercase`}
                  />
                </div>
              )}
            </Campo>
          )}
        />
        <Campo etiqueta="Prioridad (1 = mayor)" error={error(`${base}.prioridad`)}>
          {(a11y) => <input {...a11y} {...register(`${base}.prioridad`)} type="number" inputMode="numeric" min={1} step={1} className={CLASE_CONTROL} />}
        </Campo>
        <Campo etiqueta="Frecuencia de visita (días)" error={error(`${base}.frecuencia_visita_dias`)} ayuda="Opcional." className="sm:col-span-2 lg:col-span-1">
          {(a11y) => <input {...a11y} {...register(`${base}.frecuencia_visita_dias`)} type="number" inputMode="numeric" min={1} step={1} className={CLASE_CONTROL} />}
        </Campo>
        <Campo etiqueta="Descripción" error={error(`${base}.descripcion`)} ayuda="Qué significa la categoría y qué acción sugiere (opcional)." className="sm:col-span-2 lg:col-span-3">
          {(a11y) => <textarea {...a11y} {...register(`${base}.descripcion`)} rows={2} maxLength={300} className={`${CLASE_CONTROL} h-auto min-h-11 py-2.5`} />}
        </Campo>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-ink-2">Reglas: la zona debe cumplir todas (Y)</p>
        {errReglas && (
          <p role="alert" className="text-xs font-medium text-danger-ink">
            {errReglas}
          </p>
        )}
        <ol className="flex flex-col gap-2">
          {reglas.fields.map((r, j) => (
            <ReglaEditor
              key={r.id}
              base={`${base}.reglas.${j}`}
              indice={j}
              control={control}
              register={register}
              error={error}
              unica={reglas.fields.length === 1}
              quitar={() => {
                reglas.remove(j)
                alCambiarEstructura()
              }}
            />
          ))}
        </ol>
        <GlassButton
          icono={Plus}
          tam="sm"
          className="self-start"
          onClick={() => {
            reglas.append(reglaVacia())
            alCambiarEstructura()
          }}
        >
          Agregar regla
        </GlassButton>
      </div>
    </li>
  )
}

/**
 * Editor de una nueva versión de criterios (RF-011.01/02): categorías con reglas AND,
 * validación de consistencia en el servidor y guardado como pendiente de aprobación.
 */
export function EditorCriterios({ valoresIniciales, origen, alGuardado, alCancelar }) {
  const toast = useToast()
  const {
    control,
    register,
    handleSubmit,
    getValues,
    formState: { errors, isDirty },
  } = useForm({ resolver: zodResolver(esquemaCriterios), defaultValues: valoresIniciales, mode: 'onTouched' })
  const categorias = useFieldArray({ control, name: 'categorias' })
  const [srv, setSrv] = useState({})
  const [resultado, setResultado] = useState(null)
  const [accion, setAccion] = useState(null)
  const [salir, setSalir] = useState(false)

  const error = (ruta) => {
    const e = get(errors, ruta)
    return e?.message || e?.root?.message || srv[ruta]
  }
  const marcarDesactualizado = () => setResultado((r) => (r && !r.desactualizado ? { ...r, desactualizado: true } : r))
  // Al editar un campo se retira su error del servidor (y los del grupo que lo contiene)
  const alEditar = (e) => {
    const nombre = e.target?.name
    if (!nombre) return
    const ruta = nombre.replace(/\.(umbral_min|umbral_max)$/, '.umbral')
    setSrv((s) => {
      const quitar = Object.keys(s).filter((k) => ruta === k || ruta.startsWith(`${k}.`) || k === '_general')
      if (!quitar.length) return s
      const n = { ...s }
      quitar.forEach((k) => delete n[k])
      return n
    })
    marcarDesactualizado()
  }
  // Agregar o quitar elementos cambia los índices: los errores del servidor dejan de corresponder
  const alCambiarEstructura = () => {
    setSrv({})
    marcarDesactualizado()
  }

  const manejarError = (e) => {
    if (e.code === 'CRITERIOS_INCONSISTENTES' || e.code === 'VALIDACION') {
      setSrv(mapaErrores(e.details))
      setResultado({ valida: false, errores: e.details || [], advertencias: [] })
    }
    toast.error(e.status === 403 ? 'No tiene permiso para definir criterios.' : e.message)
  }
  const alInvalido = () => toast.aviso('Revise los campos marcados antes de continuar.')

  const validar = handleSubmit(async (v) => {
    setAccion('validar')
    try {
      const r = await clasificacionApi.validar(aPayload(v))
      setResultado(r)
      setSrv(mapaErrores(r.errores))
      if (r.valida) toast.exito(r.advertencias.length ? 'La versión es consistente, con advertencias.' : 'La versión es consistente.')
      else toast.aviso(`Se encontraron ${r.errores.length} error(es) de consistencia.`)
    } catch (e) {
      manejarError(e)
    } finally {
      setAccion(null)
    }
  }, alInvalido)

  const guardar = handleSubmit(async (v) => {
    setAccion('guardar')
    try {
      const creada = await clasificacionApi.crear(aPayload(v))
      toast.exito(`Versión ${creada.version} guardada como pendiente de aprobación.`)
      alGuardado(creada)
    } catch (e) {
      manejarError(e)
      setAccion(null)
    }
  }, alInvalido)

  const cancelar = () => (isDirty ? setSalir(true) : alCancelar())
  const generales = [srv._general, srv.categorias, errors.categorias?.root?.message, errors.categorias?.message].filter(Boolean)

  return (
    <GlassPanel className="flex flex-col gap-5 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">Nueva versión de criterios</h2>
          <p className="mt-0.5 text-sm text-muted">Se guardará como pendiente; solo será vigente cuando la apruebe Metodología.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {origen && <Chip tono="azul">{origen}</Chip>}
            <EtiquetaProvisional texto="Umbrales DEMO / definición provisional" detalle="Los umbrales propuestos son de demostración: deben validarse con la cooperativa antes de usarse como oficiales." />
          </div>
        </div>
      </div>

      <form noValidate onChange={alEditar} onSubmit={guardar} className="flex flex-col gap-5">
        <Campo etiqueta="Nota de la versión" error={error('nota')} ayuda="Opcional: motivo del cambio o fuente de los umbrales.">
          {(a11y) => <textarea {...a11y} {...register('nota')} rows={2} maxLength={300} className={`${CLASE_CONTROL} h-auto min-h-11 py-2.5`} />}
        </Campo>

        {generales.length > 0 && (
          <p role="alert" className="rounded-control bg-[#fbe9e5] px-3 py-2 text-sm font-medium text-danger-ink">
            {generales[0]}
          </p>
        )}

        <ol className="flex flex-col gap-4">
          {categorias.fields.map((c, i) => (
            <CategoriaEditor
              key={c.id}
              indice={i}
              control={control}
              register={register}
              error={error}
              unica={categorias.fields.length === 1}
              quitar={() => categorias.remove(i)}
              alCambiarEstructura={alCambiarEstructura}
            />
          ))}
        </ol>
        <GlassButton
          icono={Plus}
          className="self-start"
          onClick={() => {
            const usadas = getValues('categorias').map((c) => Number(c.prioridad) || 0)
            categorias.append(categoriaVacia(Math.max(0, ...usadas) + 1))
            alCambiarEstructura()
          }}
        >
          Agregar categoría
        </GlassButton>

        {resultado && (
          <div role="status" aria-live="polite" className={`rounded-card p-4 text-sm ${resultado.valida ? 'bg-[#e6f5ee]' : 'bg-[#fbe9e5]'}`}>
            <p className={`flex items-center gap-2 font-semibold ${resultado.valida ? 'text-ok-ink' : 'text-danger-ink'}`}>
              {resultado.valida ? <CheckCircle2 className="size-5" aria-hidden /> : <XCircle className="size-5" aria-hidden />}
              {resultado.valida ? 'La versión es consistente y puede guardarse.' : `La versión tiene ${resultado.errores.length} error(es) que deben corregirse.`}
            </p>
            {resultado.desactualizado && <p className="mt-1 text-xs text-ink-2">Hubo cambios después de la última validación; vuelva a validar.</p>}
            {!resultado.valida && resultado.errores.length > 0 && (
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-ink-2">
                {resultado.errores.map((e, i) => (
                  <li key={i}>
                    {lugarError(e.campo) && <span className="font-semibold">{lugarError(e.campo)}: </span>}
                    {e.mensaje}
                  </li>
                ))}
              </ul>
            )}
            {resultado.advertencias?.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-warn-ink">
                {resultado.advertencias.map((a, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {a}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-white/70 pt-4 sm:flex-row sm:justify-end">
          <GlassButton variante="fantasma" onClick={cancelar} disabled={Boolean(accion)}>
            Cancelar
          </GlassButton>
          <GlassButton icono={ShieldCheck} onClick={validar} cargando={accion === 'validar'} disabled={accion === 'guardar'}>
            Validar
          </GlassButton>
          <GlassButton type="submit" variante="primario" icono={Save} cargando={accion === 'guardar'} disabled={accion === 'validar'}>
            Guardar como pendiente
          </GlassButton>
        </div>
      </form>

      <ConfirmDialog
        abierto={salir}
        alCerrar={() => setSalir(false)}
        alConfirmar={() => {
          setSalir(false)
          alCancelar()
        }}
        titulo="¿Descartar el borrador?"
        texto="Los cambios de esta versión no se han guardado y se perderán."
        confirmar="Descartar"
        peligro
      />
    </GlassPanel>
  )
}
