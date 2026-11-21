import { zodResolver } from '@hookform/resolvers/zod'
import { Lock, Plus, RotateCcw, Save, Trash2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Aviso, EncabezadoSeccion, ListaErrores } from '../../components/admin/Bloques'
import { Campo, Casilla } from '../../components/admin/Campos'
import { aplicarErroresServidor, ariaCampo, claseControl } from '../../components/admin/formulario'
import { ConfirmDialog, EmptyState, ErrorState, EtiquetaProvisional, LoadingState } from '../../components/feedback/Estados'
import { Chip, GlassButton, GlassPanel } from '../../components/glass/Glass'
import { GlassModal } from '../../components/glass/Overlay'
import { Ensamblado, EncabezadoPagina } from '../../components/layout/Ensamblado'
import { Segmentado } from '../../components/layout/Pildora'
import { DataTable } from '../../components/tables/DataTable'
import { useBarraSuperior } from '../../context/FiltrosContext'
import { useToast } from '../../context/ToastContext'
import { datosApi, etiquetaTipo, TIPOS_ESQUEMA } from '../../features/datos/api'
import { useApi } from '../../hooks/useApi'
import { fmtFechaHora } from '../../utils/format'

const TIPOS_DATO = [
  { valor: 'texto', etiqueta: 'Texto' },
  { valor: 'numero', etiqueta: 'Número decimal' },
  { valor: 'entero', etiqueta: 'Número entero' },
  { valor: 'fecha', etiqueta: 'Fecha' },
  { valor: 'booleano', etiqueta: 'Sí / No' },
]
const etiquetaDato = (t) => TIPOS_DATO.find((x) => x.valor === t)?.etiqueta || t
const aTexto = (alias = []) => alias.join(', ')
const aLista = (txt = '') => [...new Set(txt.split(',').map((a) => a.trim()).filter(Boolean))]
const limpiar = (c) => ({ campo: c.campo, etiqueta: c.etiqueta.trim(), tipo_dato: c.tipo_dato, requerido: c.requerido, nucleo: c.nucleo, sensible: c.sensible, alias: aLista(c.aliasTexto) })
const huella = (campos) => JSON.stringify(campos.map((c) => ({ ...c, alias: [...c.alias].sort() })))

export default function Esquemas() {
  useBarraSuperior({}, [])
  const [tipo, setTipo] = useState('socios')
  const { data, error, cargando, recargar } = useApi((s) => datosApi.esquema(tipo, s), [tipo])
  const [verVersion, setVerVersion] = useState(null)
  const vigente = data?.vigente

  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina
        titulo="Esquemas de carga"
        subtitulo="Campos que se reconocen en cada tipo de archivo, con sus etiquetas y alias. Cada cambio crea una versión auditada."
        insignias={<EtiquetaProvisional texto="Esquema inicial propuesto" detalle="Los campos y alias iniciales son una propuesta del equipo; deben validarse con la cooperativa." />}
        extra={
          <div className="no-scrollbar max-w-full overflow-x-auto">
            <Segmentado etiqueta="Tipo de archivo" valor={tipo} alCambiar={setTipo} opciones={TIPOS_ESQUEMA.map((t) => ({ valor: t.valor, etiqueta: t.valor === 'limites' ? 'Límites' : t.etiqueta }))} />
          </div>
        }
      />
      <Aviso tono="aviso" icono={TriangleAlert} titulo="Los campos adicionales no participan en los indicadores">
        Se guardan como atributos del registro y no intervienen en KPIs, mapas ni en la clasificación de zonas. Los campos núcleo no se pueden eliminar ni dejar de ser obligatorios.
      </Aviso>

      <GlassPanel className="min-w-0 p-5 md:p-6" aria-labelledby="titulo-editor-esquema">
        {error ? (
          <ErrorState error={error} alReintentar={recargar} />
        ) : cargando || !vigente ? (
          <LoadingState filas={6} alto="h-16" />
        ) : (
          <EditorEsquema key={`${tipo}-${vigente.version}`} tipo={tipo} vigente={vigente} alGuardado={recargar} />
        )}
      </GlassPanel>

      <GlassPanel className="min-w-0 p-2 md:p-3" aria-labelledby="titulo-versiones-esquema">
        <div className="px-3 pt-3 md:px-4">
          <EncabezadoSeccion id="titulo-versiones-esquema" titulo="Versiones" subtitulo={`Historial de versiones del esquema de ${etiquetaTipo(tipo).toLowerCase()}. Seleccione una para ver sus campos.`} />
        </div>
        <DataTable
          etiqueta="Versiones del esquema"
          filas={data?.versiones || []}
          cargando={cargando}
          error={error}
          alReintentar={recargar}
          alSeleccionar={setVerVersion}
          vacio={<EmptyState titulo="Sin versiones" texto="Aún no hay versiones de este esquema." />}
          columnas={[
            { clave: 'version', titulo: 'Versión', movil: 'titulo', render: (v) => <span className="flex items-center gap-2 font-semibold">v{v.version} {v.vigente && <Chip tono="verde">Vigente</Chip>}</span> },
            { clave: 'campos', titulo: 'Campos', render: (v) => `${v.campos.length} (${v.campos.filter((c) => !c.nucleo).length} adicionales)` },
            { clave: 'autor', titulo: 'Autor', render: (v) => v.autor || 'Sistema' },
            { clave: 'created_at', titulo: 'Fecha', render: (v) => fmtFechaHora(v.created_at) },
          ]}
        />
      </GlassPanel>

      <GlassModal abierto={Boolean(verVersion)} alCerrar={() => setVerVersion(null)} titulo={verVersion ? `Versión ${verVersion.version}` : ''} descripcion={verVersion ? `${verVersion.autor || 'Sistema'} · ${fmtFechaHora(verVersion.created_at)}` : ''} ancho="max-w-2xl">
        {verVersion && (
          <ul className="flex flex-col gap-2">
            {verVersion.campos.map((c) => (
              <li key={c.campo} className="glass-inset rounded-2xl p-3 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                  {c.etiqueta} <code className="text-xs text-muted">{c.campo}</code>
                </p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  <Chip tono={c.nucleo ? 'azul' : 'neutro'}>{c.nucleo ? 'Núcleo' : 'Adicional'}</Chip>
                  <Chip>{c.requerido ? 'Obligatorio' : 'Opcional'}</Chip>
                  <Chip>{etiquetaDato(c.tipo_dato)}</Chip>
                  {c.sensible && <Chip tono="violeta">Sensible</Chip>}
                </p>
                {c.alias?.length > 0 && <p className="mt-1 text-xs text-muted">Alias: {c.alias.join(', ')}</p>}
              </li>
            ))}
          </ul>
        )}
      </GlassModal>
    </Ensamblado>
  )
}

function EditorEsquema({ tipo, vigente, alGuardado }) {
  const toast = useToast()
  const original = vigente.campos.map((c) => ({ ...c, aliasTexto: aTexto(c.alias) }))
  const [campos, setCampos] = useState(original)
  const [errores, setErrores] = useState({})
  const [sueltos, setSueltos] = useState([])
  const [confirmar, setConfirmar] = useState(false)
  const [agregar, setAgregar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const cambiado = huella(campos.map(limpiar)) !== huella(original.map(limpiar))

  const editar = (i, cambios) => {
    setCampos((cs) => cs.map((c, j) => (j === i ? { ...c, ...cambios } : c)))
    setErrores((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(`campos[${i}]`))))
  }
  const quitar = (i) => {
    setCampos((cs) => cs.filter((_, j) => j !== i))
    setErrores({})
  }
  const validar = () => {
    const e = {}
    campos.forEach((c, i) => {
      if (!c.etiqueta.trim()) e[`campos[${i}].etiqueta`] = 'La etiqueta es obligatoria.'
      else if (c.etiqueta.trim().length > 80) e[`campos[${i}].etiqueta`] = 'Máximo 80 caracteres.'
      if (aLista(c.aliasTexto).some((a) => a.length > 60)) e[`campos[${i}].alias`] = 'Cada alias admite hasta 60 caracteres.'
    })
    setErrores(e)
    return !Object.keys(e).length
  }
  const pedirGuardar = () => {
    setSueltos([])
    if (validar()) setConfirmar(true)
  }
  const guardar = async () => {
    setGuardando(true)
    try {
      const nuevo = await datosApi.editarEsquema(tipo, campos.map(limpiar))
      toast.exito(`Esquema guardado como versión ${nuevo.version}.`)
      setConfirmar(false)
      alGuardado()
    } catch (e) {
      const porCampo = {}
      const resto = []
      for (const d of e.details || []) {
        if (d.campo && /^campos\[\d+\]\./.test(d.campo)) porCampo[d.campo] = d.mensaje
        else if (d.campo && /^campos\[\d+\]$/.test(d.campo)) porCampo[`${d.campo}.etiqueta`] = d.mensaje
        else resto.push(d.mensaje)
      }
      setErrores(porCampo)
      setSueltos(resto.length || Object.keys(porCampo).length ? resto : [e.message])
      setConfirmar(false)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <EncabezadoSeccion
        id="titulo-editor-esquema"
        titulo={`Campos de ${etiquetaTipo(tipo).toLowerCase()}`}
        subtitulo={`Versión vigente v${vigente.version} · ${vigente.autor || 'Sistema'} · ${fmtFechaHora(vigente.created_at)}`}
        extra={
          <>
            {cambiado && <Chip tono="ambar">Cambios sin guardar</Chip>}
            <GlassButton tam="sm" icono={Plus} onClick={() => setAgregar(true)}>
              Agregar campo
            </GlassButton>
          </>
        }
      />
      <ul className="flex flex-col gap-3">
        {campos.map((c, i) => {
          const base = `esq-${c.campo}`
          const errEtiqueta = errores[`campos[${i}].etiqueta`]
          const errAlias = errores[`campos[${i}].alias`]
          const errFila = errores[`campos[${i}].campo`] || errores[`campos[${i}].tipo_dato`]
          return (
            <li key={c.campo} className="glass-inset rounded-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <code className="rounded-lg bg-white/80 px-2 py-0.5 text-sm font-semibold text-brand-700">{c.campo}</code>
                  <Chip tono={c.nucleo ? 'azul' : 'neutro'} icono={c.nucleo ? Lock : undefined}>
                    {c.nucleo ? 'Núcleo' : c._nuevo ? 'Adicional (nuevo)' : 'Adicional'}
                  </Chip>
                  <Chip>{c.requerido ? 'Obligatorio' : 'Opcional'}</Chip>
                  <Chip>{etiquetaDato(c.tipo_dato)}</Chip>
                  {c.sensible && <Chip tono="violeta">Sensible</Chip>}
                </div>
                {!c.nucleo && (
                  <GlassButton tam="sm" variante="fantasma" icono={Trash2} onClick={() => quitar(i)} aria-label={`Quitar el campo ${c.etiqueta || c.campo}`}>
                    Quitar
                  </GlassButton>
                )}
              </div>
              {errFila && <p className="mb-2 text-xs font-medium text-danger-ink">{errFila}</p>}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Campo id={`${base}-etq`} etiqueta="Etiqueta visible" error={errEtiqueta}>
                  <input value={c.etiqueta} maxLength={80} onChange={(e) => editar(i, { etiqueta: e.target.value })} {...ariaCampo(`${base}-etq`, errEtiqueta)} className={claseControl(errEtiqueta)} />
                </Campo>
                <Campo id={`${base}-alias`} etiqueta="Alias de columna" opcional error={errAlias} ayuda="Separe los alias con comas. Se comparan sin tildes ni mayúsculas.">
                  <input value={c.aliasTexto} onChange={(e) => editar(i, { aliasTexto: e.target.value })} {...ariaCampo(`${base}-alias`, errAlias, true)} className={claseControl(errAlias)} />
                </Campo>
              </div>
              {!c.nucleo && <Casilla id={`${base}-sens`} checked={c.sensible} onChange={(e) => editar(i, { sensible: e.target.checked })} etiqueta="Dato sensible" descripcion="Se enmascara en vistas previas, observados y descargas de errores." className="mt-2" />}
            </li>
          )
        })}
      </ul>
      <div className="mt-4 flex flex-col gap-3">
        <ListaErrores titulo="El esquema no es válido" mensajes={sueltos} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <GlassButton
            icono={RotateCcw}
            disabled={!cambiado || guardando}
            onClick={() => {
              setCampos(original)
              setErrores({})
              setSueltos([])
            }}
          >
            Descartar cambios
          </GlassButton>
          <GlassButton variante="primario" icono={Save} disabled={!cambiado} cargando={guardando} onClick={pedirGuardar}>
            Guardar nueva versión
          </GlassButton>
        </div>
      </div>

      <ConfirmDialog
        abierto={confirmar}
        alCerrar={() => !guardando && setConfirmar(false)}
        alConfirmar={guardar}
        cargando={guardando}
        titulo={`¿Guardar la versión ${vigente.version + 1}?`}
        texto="Las próximas cargas usarán este esquema. Las cargas anteriores conservan la versión con la que se procesaron. El cambio queda en el historial."
        confirmar="Guardar versión"
      />
      <GlassModal abierto={agregar} alCerrar={() => setAgregar(false)} titulo="Agregar campo adicional" descripcion="Los campos adicionales son opcionales y no participan en KPIs ni en la clasificación.">
        {agregar && (
          <FormNuevoCampo
            existentes={campos.map((c) => c.campo)}
            alCancelar={() => setAgregar(false)}
            alAgregar={(c) => {
              setCampos((cs) => [...cs, c])
              setAgregar(false)
            }}
          />
        )}
      </GlassModal>
    </>
  )
}

function FormNuevoCampo({ existentes, alAgregar, alCancelar }) {
  const esquema = z.object({
    campo: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{1,39}$/, 'Use de 2 a 40 caracteres: minúsculas sin tildes, números y guion bajo; empiece con una letra.')
      .refine((v) => !existentes.includes(v), 'Ya existe un campo con ese nombre.'),
    etiqueta: z.string().trim().min(1, 'La etiqueta es obligatoria.').max(80, 'Máximo 80 caracteres.'),
    tipo_dato: z.enum(['texto', 'numero', 'entero', 'fecha', 'booleano'], { error: 'Elija el tipo de dato.' }),
    sensible: z.boolean(),
    aliasTexto: z.string().max(400, 'Demasiados alias.'),
  })
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(esquema), defaultValues: { campo: '', etiqueta: '', tipo_dato: 'texto', sensible: false, aliasTexto: '' } })
  const enviar = (v) => {
    if (aLista(v.aliasTexto).some((a) => a.length > 60)) {
      aplicarErroresServidor({ details: [{ campo: 'aliasTexto', mensaje: 'Cada alias admite hasta 60 caracteres.' }] }, setError, ['aliasTexto'])
      return
    }
    alAgregar({ campo: v.campo, etiqueta: v.etiqueta, tipo_dato: v.tipo_dato, requerido: false, nucleo: false, sensible: v.sensible, alias: aLista(v.aliasTexto), aliasTexto: v.aliasTexto, _nuevo: true })
  }
  return (
    <form onSubmit={handleSubmit(enviar)} noValidate className="flex flex-col gap-4">
      <Campo id="nc-campo" etiqueta="Nombre interno" error={errors.campo?.message} ayuda="Ejemplo: telefono_contacto. No se puede cambiar después.">
        <input {...register('campo')} autoCapitalize="none" spellCheck={false} data-autofocus {...ariaCampo('nc-campo', errors.campo, true)} className={claseControl(errors.campo)} />
      </Campo>
      <Campo id="nc-etq" etiqueta="Etiqueta visible" error={errors.etiqueta?.message}>
        <input {...register('etiqueta')} {...ariaCampo('nc-etq', errors.etiqueta)} className={claseControl(errors.etiqueta)} />
      </Campo>
      <Campo id="nc-tipo" etiqueta="Tipo de dato" error={errors.tipo_dato?.message}>
        <select {...register('tipo_dato')} {...ariaCampo('nc-tipo', errors.tipo_dato)} className={claseControl(errors.tipo_dato)}>
          {TIPOS_DATO.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.etiqueta}
            </option>
          ))}
        </select>
      </Campo>
      <Campo id="nc-alias" etiqueta="Alias de columna" opcional error={errors.aliasTexto?.message} ayuda="Otros nombres con los que puede venir la columna, separados por comas.">
        <input {...register('aliasTexto')} {...ariaCampo('nc-alias', errors.aliasTexto, true)} className={claseControl(errors.aliasTexto)} />
      </Campo>
      <Casilla id="nc-sens" {...register('sensible')} etiqueta="Dato sensible" descripcion="Se enmascara en vistas previas y descargas." />
      <p className="text-xs text-muted">El campo se agrega como opcional. Se guarda al pulsar «Guardar nueva versión».</p>
      <div className="flex flex-wrap justify-end gap-2">
        <GlassButton onClick={alCancelar}>Cancelar</GlassButton>
        <GlassButton type="submit" variante="primario" icono={Plus}>
          Agregar
        </GlassButton>
      </div>
    </form>
  )
}
