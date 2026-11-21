import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Ban, Columns3, Database, Download, FileSpreadsheet, FileUp, History, Info, Lock, PlugZap, RefreshCw, RotateCcw, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { cacheInvalidate } from '../../api/client'
import { Aviso, Cifra, EncabezadoSeccion, EstadoChip, ListaErrores, Pasos, ValorJSON } from '../../components/admin/Bloques'
import { Campo, Casilla, FiltroSelect } from '../../components/admin/Campos'
import { aplicarErroresServidor, ariaCampo, claseControl, periodoActual, RE_PERIODO } from '../../components/admin/formulario'
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from '../../components/feedback/Estados'
import { Chip, GlassButton, GlassPanel } from '../../components/glass/Glass'
import { GlassModal } from '../../components/glass/Overlay'
import { Ensamblado, EncabezadoPagina } from '../../components/layout/Ensamblado'
import { DataTable, LoadMoreFooter } from '../../components/tables/DataTable'
import { useAuth } from '../../context/AuthContext'
import { useBarraSuperior } from '../../context/FiltrosContext'
import { useToast } from '../../context/ToastContext'
import { datosApi, ESTADOS_CARGA, etiquetaTipo, TIPOS_CARGA } from '../../features/datos/api'
import { useApi, useCursorList } from '../../hooks/useApi'
import { fmtEntero, fmtFechaHora, periodoCorto } from '../../utils/format'

const PASOS = ['Archivo', 'Columnas', 'Revisión', 'Resultado']
const ERRORES_ARCHIVO = ['ARCHIVO_INVALIDO', 'CODIFICACION_INVALIDA', 'ARCHIVO_DEMASIADO_GRANDE', 'ARCHIVO_VACIO', 'ARCHIVO_YA_CARGADO']
// Pantallas cuyos datos cambian al confirmar una carga (la caché del cliente se invalida)
const AFECTADAS = ['/panel', '/mapa', '/indicadores', '/comparar', '/clasificacion', '/reportes', '/periodos', '/observados', '/potencial']

const pasoDe = (c) => (!c ? 0 : c.estado === 'requiere_revision' ? (c.faltantes?.length ? 1 : 2) : 3)

export default function Cargas() {
  useBarraSuperior({}, [])
  const { parametros, puede } = useAuth()
  const toast = useToast()
  const [carga, setCarga] = useState(null)
  const [periodosRecalc, setPeriodosRecalc] = useState(null)
  const [dialogo, setDialogo] = useState(null) // 'confirmar' | 'cancelar'
  const [ocupado, setOcupado] = useState(false)
  const [filtros, setFiltros] = useState({ tipo: null, estado: null })
  const [detalleId, setDetalleId] = useState(null)
  const historial = useCursorList(({ cursor, signal }) => datosApi.cargas({ tipo: filtros.tipo, estado: filtros.estado, cursor }, signal), [filtros.tipo, filtros.estado])
  const paso = pasoDe(carga)

  const nueva = () => {
    setCarga(null)
    setPeriodosRecalc(null)
  }

  const confirmar = async () => {
    setOcupado(true)
    try {
      const c = await datosApi.confirmar(carga.id)
      cacheInvalidate(...AFECTADAS)
      setCarga(c)
      setPeriodosRecalc(c.periodos_recalculados || [])
      toast.exito(`Carga confirmada: ${fmtEntero(c.cargados)} registros cargados.`)
    } catch (e) {
      toast.error(e.message)
      if (e.code === 'CARGA_FALLIDA' || e.code === 'ESTADO_INVALIDO') datosApi.carga(carga.id).then(setCarga).catch(() => {})
    } finally {
      setOcupado(false)
      setDialogo(null)
      historial.recargar()
    }
  }

  const cancelar = async () => {
    setOcupado(true)
    try {
      const c = await datosApi.cancelar(carga.id)
      setCarga(c)
      toast.info('Carga cancelada. No se guardó ningún registro.')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setOcupado(false)
      setDialogo(null)
      historial.recargar()
    }
  }

  const retomar = (c) => {
    setDetalleId(null)
    setPeriodosRecalc(null)
    setCarga(c)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const validos = carga?.resumen?.validos ?? 0
  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina
        titulo="Carga de datos"
        subtitulo="Importe archivos CSV de socios, créditos o pagos: se validan, se revisan y solo se guardan al confirmar"
        insignias={<Chip tono="azul" icono={Info}>Importación síncrona</Chip>}
      />

      <div className="grid grid-cols-1 gap-[var(--gap)] xl:grid-cols-12">
        <GlassPanel className="flex min-w-0 flex-col gap-5 p-5 md:p-6 xl:col-span-8" aria-labelledby="titulo-asistente">
          <h2 id="titulo-asistente" className="sr-only">
            Asistente de carga
          </h2>
          <Pasos pasos={PASOS} actual={paso} />
          {paso === 0 && <PasoArchivo parametros={parametros} alSubida={(c) => (setCarga(c), historial.recargar())} alFallo={historial.recargar} />}
          {paso === 1 && <PasoColumnas key={carga.id} carga={carga} alActualizada={setCarga} alCancelar={() => setDialogo('cancelar')} />}
          {paso === 2 && <PasoRevision carga={carga} alConfirmar={() => setDialogo('confirmar')} alCancelar={() => setDialogo('cancelar')} />}
          {paso === 3 && <PasoResultado carga={carga} periodos={periodosRecalc} alNueva={nueva} puedeValidar={puede('datos.validar')} />}
        </GlassPanel>

        <div className="flex min-w-0 flex-col gap-[var(--gap)] xl:col-span-4">
          <PanelLimites parametros={parametros} />
          <PanelConexionBD />
        </div>
      </div>

      <GlassPanel className="min-w-0 p-2 md:p-3" aria-labelledby="titulo-historial-cargas">
        <div className="px-3 pt-3 md:px-4">
          <EncabezadoSeccion
            id="titulo-historial-cargas"
            titulo="Historial de cargas"
            subtitulo="Cada carga con su responsable, fecha y resultado. Seleccione una para ver el detalle."
            extra={<GlassButton tam="sm" icono={RefreshCw} onClick={historial.recargar}>Actualizar</GlassButton>}
          />
          <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-xl">
            <FiltroSelect id="f-carga-tipo" etiqueta="Tipo" valor={filtros.tipo} alCambiar={(v) => setFiltros((f) => ({ ...f, tipo: v }))} opciones={TIPOS_CARGA} />
            <FiltroSelect id="f-carga-estado" etiqueta="Estado" valor={filtros.estado} alCambiar={(v) => setFiltros((f) => ({ ...f, estado: v }))} opciones={ESTADOS_CARGA} />
          </div>
        </div>
        <DataTable
          etiqueta="Historial de cargas"
          filas={historial.items}
          cargando={historial.cargando}
          error={historial.error}
          alReintentar={historial.recargar}
          alSeleccionar={(f) => setDetalleId(f.id)}
          seleccionado={detalleId}
          vacio={<EmptyState icono={History} titulo="Sin cargas registradas" texto={filtros.tipo || filtros.estado ? 'No hay cargas con estos filtros.' : 'Las cargas que realice aparecerán aquí con su resultado.'} />}
          columnas={[
            {
              clave: 'nombre_archivo',
              titulo: 'Archivo',
              movil: 'titulo',
              render: (f) => (
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold text-ink">{f.nombre_archivo}</span>
                  <span className="truncate text-xs text-muted">{f.usuario?.nombre || f.usuario?.username}</span>
                </span>
              ),
            },
            { clave: 'tipo', titulo: 'Tipo', render: (f) => etiquetaTipo(f.tipo) },
            { clave: 'periodo', titulo: 'Período', render: (f) => periodoCorto(f.periodo) },
            { clave: 'estado', titulo: 'Estado', render: (f) => <EstadoChip estado={f.estado} /> },
            { clave: 'resultado', titulo: 'Resultado', render: (f) => <span className="tnum text-sm">{fmtEntero(f.cargados)} cargados · {fmtEntero(f.observados)} obs. · {fmtEntero(f.rechazados)} rech.</span> },
            { clave: 'created_at', titulo: 'Fecha', render: (f) => fmtFechaHora(f.created_at) },
          ]}
        />
        <LoadMoreFooter mostrando={historial.items.length} total={historial.total} hayMas={historial.hasMore} cargando={historial.cargandoMas} alVerMas={historial.verMas} />
      </GlassPanel>

      <ConfirmDialog
        abierto={dialogo === 'confirmar'}
        alCerrar={() => !ocupado && setDialogo(null)}
        alConfirmar={confirmar}
        cargando={ocupado}
        titulo="¿Confirmar la carga?"
        texto={`Se guardarán ${fmtEntero(validos)} registros válidos. Los ${fmtEntero(carga?.observados ?? 0)} observados pasarán a la bandeja de depuración y los ${fmtEntero(carga?.rechazados ?? 0)} rechazados no se cargarán.`}
        confirmar="Confirmar carga"
      >
        <p className="text-sm text-ink-2">La importación es síncrona y transaccional: si algo falla se revierte por completo. Al terminar se recalculan los indicadores y la acción queda en el historial.</p>
      </ConfirmDialog>
      <ConfirmDialog
        abierto={dialogo === 'cancelar'}
        alCerrar={() => !ocupado && setDialogo(null)}
        alConfirmar={cancelar}
        cargando={ocupado}
        peligro
        titulo="¿Cancelar esta carga?"
        texto="Se descartará la validación del archivo y no se guardará ningún registro. Podrá subirlo de nuevo cuando lo necesite."
        confirmar="Cancelar carga"
      />
      <DetalleCarga id={detalleId} alCerrar={() => setDetalleId(null)} alRetomar={retomar} />
    </Ensamblado>
  )
}

/* ---------------- Paso 1: archivo, tipo y período ---------------- */
function PasoArchivo({ parametros, alSubida, alFallo }) {
  const maxMb = parametros?.max_mb_carga
  const [sueltos, setSueltos] = useState([])
  const [duplicado, setDuplicado] = useState(false)
  const esquema = useMemo(
    () =>
      z.object({
        tipo: z.enum(['socios', 'creditos', 'pagos'], { error: 'Seleccione el tipo de información.' }),
        periodo: z.string().trim().regex(RE_PERIODO, 'Indique el período en formato AAAA-MM.'),
        archivo: z.any().superRefine((v, ctx) => {
          const f = v?.[0]
          if (!f) ctx.addIssue({ code: 'custom', message: 'Seleccione un archivo .csv.' })
          else if (!f.name.toLowerCase().endsWith('.csv')) ctx.addIssue({ code: 'custom', message: 'El archivo debe tener extensión .csv.' })
          else if (maxMb && f.size > maxMb * 1024 * 1024) ctx.addIssue({ code: 'custom', message: `El archivo supera el límite de ${maxMb} MB.` })
        }),
        reemplazo: z.boolean(),
      }),
    [maxMb],
  )
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(esquema), defaultValues: { tipo: undefined, periodo: periodoActual(), archivo: undefined, reemplazo: false } })
  const archivo = useWatch({ control, name: 'archivo' })?.[0]

  const enviar = async (v) => {
    setSueltos([])
    setDuplicado(false)
    const fd = new FormData()
    fd.append('archivo', v.archivo[0])
    fd.append('tipo', v.tipo)
    fd.append('periodo', v.periodo)
    fd.append('reemplazo', v.reemplazo ? 'true' : 'false')
    try {
      alSubida(await datosApi.subir(fd))
    } catch (e) {
      if (ERRORES_ARCHIVO.includes(e.code)) {
        setError('archivo', { type: 'server', message: e.message }, { shouldFocus: true })
        if (e.code === 'ARCHIVO_YA_CARGADO') setDuplicado(true)
      } else if (e.code === 'VALIDACION') {
        const resto = aplicarErroresServidor(e, setError, ['tipo', 'periodo', 'archivo', 'reemplazo'])
        setSueltos(resto.length ? resto : e.details?.length ? [] : [e.message])
      } else setSueltos([e.message])
      alFallo?.()
    }
  }

  return (
    <form onSubmit={handleSubmit(enviar)} noValidate className="flex flex-col gap-5">
      <EncabezadoSeccion nivel={3} titulo="1. Elija el archivo" subtitulo="Indique qué información contiene y a qué período corresponde." />
      <fieldset className="flex flex-col gap-2" aria-describedby={errors.tipo ? 'carga-tipo-err' : undefined} aria-invalid={errors.tipo ? true : undefined}>
        <legend className="mb-1.5 text-sm font-semibold text-ink-2">Tipo de información</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TIPOS_CARGA.map((t) => (
            <label key={t.valor} className="glass-inset flex min-h-12 cursor-pointer items-center gap-3 rounded-card px-4 py-3 has-[:checked]:bg-white has-[:checked]:ring-2 has-[:checked]:ring-brand-400 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500">
              <input type="radio" value={t.valor} {...register('tipo')} className="size-5 accent-brand-600" />
              <span className="font-semibold text-ink">{t.etiqueta}</span>
            </label>
          ))}
        </div>
        {errors.tipo && (
          <p id="carga-tipo-err" className="text-xs font-medium text-danger-ink">
            {errors.tipo.message}
          </p>
        )}
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="carga-periodo" etiqueta="Período (AAAA-MM)" error={errors.periodo?.message} ayuda="Mes al que corresponden los datos.">
          <input type="month" inputMode="numeric" placeholder="AAAA-MM" {...register('periodo')} {...ariaCampo('carga-periodo', errors.periodo, true)} className={claseControl(errors.periodo)} />
        </Campo>
        <Campo id="carga-archivo" etiqueta="Archivo CSV" error={errors.archivo?.message} ayuda={archivo ? `${archivo.name} · ${(archivo.size / 1024).toLocaleString('es-EC', { maximumFractionDigits: 1 })} KB` : `Codificación UTF-8, hasta ${maxMb ?? '—'} MB.`}>
          <input
            type="file"
            accept=".csv,text/csv"
            {...register('archivo')}
            {...ariaCampo('carga-archivo', errors.archivo, true)}
            className={claseControl(errors.archivo, 'py-2 text-sm file:mr-3 file:min-h-9 file:cursor-pointer file:rounded-full file:border-0 file:bg-brand-50 file:px-4 file:font-semibold file:text-brand-700')}
          />
        </Campo>
      </div>

      <div className={`rounded-card px-3 ${duplicado ? 'bg-sun-100/80 ring-1 ring-sun-400/50' : ''}`}>
        <Casilla
          id="carga-reemplazo"
          {...register('reemplazo')}
          etiqueta="Reemplazar si este mismo archivo ya se cargó"
          descripcion="Márquelo solo si necesita procesar de nuevo un archivo idéntico para el mismo tipo y período. Los registros existentes se actualizan, no se duplican."
        />
      </div>

      <ListaErrores mensajes={sueltos} />
      {isSubmitting && (
        <Aviso tono="info" icono={RefreshCw} titulo="Validando el archivo…">
          La importación es síncrona: se lee y valida el archivo completo. Puede tardar unos segundos; no cierre esta pantalla.
        </Aviso>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <GlassButton type="submit" variante="primario" tam="lg" icono={Upload} cargando={isSubmitting}>
          Subir y validar
        </GlassButton>
      </div>
    </form>
  )
}

/* ---------------- Paso 2: mapeo manual de columnas faltantes ---------------- */
function PasoColumnas({ carga, alActualizada, alCancelar }) {
  const toast = useToast()
  const { data: esq } = useApi((s) => datosApi.esquema(carga.tipo, s), [carga.tipo])
  const etiquetas = useMemo(() => Object.fromEntries((esq?.vigente?.campos || []).map((c) => [c.campo, c.etiqueta])), [esq])
  const usadas = new Set(Object.values(carga.mapeo || {}))
  const libres = (carga.columnas_archivo || []).filter((c) => !usadas.has(c))
  const opciones = libres.length ? libres : carga.columnas_archivo || []
  const [sueltos, setSueltos] = useState([])
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { mapeo: Object.fromEntries(carga.faltantes.map((f) => [f, ''])), guardar_alias: false } })

  const enviar = async (v) => {
    setSueltos([])
    try {
      const c = await datosApi.mapeo(carga.id, v.mapeo, v.guardar_alias)
      if (c.faltantes?.length) toast.aviso('Aún faltan columnas obligatorias por asignar.')
      else toast.exito(v.guardar_alias ? 'Columnas asignadas y guardadas como alias para próximas cargas.' : 'Columnas asignadas. Revise el resultado de la validación.')
      alActualizada(c)
    } catch (e) {
      setSueltos([e.message, ...(e.details || []).map((d) => d.mensaje)])
    }
  }

  const vista = (carga.resumen?.vista_previa || []).map((f, i) => ({ ...f, __i: i }))
  const columnasVista = (carga.columnas_archivo || []).map((c) => ({ clave: c, titulo: c, render: (f) => <span className="whitespace-nowrap">{f[c] ?? ''}</span> }))
  if (columnasVista.length) columnasVista[0].movil = 'titulo'

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoSeccion
        nivel={3}
        titulo="2. Asigne las columnas que faltan"
        subtitulo={`«${carga.nombre_archivo}» · ${etiquetaTipo(carga.tipo)} · ${periodoCorto(carga.periodo)}`}
        extra={<EstadoChip estado={carga.estado} />}
      />
      <Aviso tono="aviso" titulo="No se reconocieron algunas columnas obligatorias">
        Elija, para cada dato, la columna del archivo que lo contiene. Las cédulas de la vista previa se muestran enmascaradas.
      </Aviso>

      <form onSubmit={handleSubmit(enviar)} noValidate className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {carga.faltantes.map((campo) => {
            const id = `mapeo-${campo}`
            const err = errors.mapeo?.[campo]
            return (
              <Campo key={campo} id={id} etiqueta={etiquetas[campo] || campo} error={err?.message} ayuda={`Campo interno: ${campo}`}>
                <select
                  {...register(`mapeo.${campo}`, {
                    required: 'Elija la columna del archivo que contiene este dato.',
                    validate: (v) => Object.entries(getValues('mapeo')).filter(([k, x]) => k !== campo && x === v).length === 0 || 'Esta columna ya está asignada a otro dato.',
                  })}
                  {...ariaCampo(id, err, true)}
                  className={claseControl(err)}
                >
                  <option value="">— Elegir columna —</option>
                  {opciones.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Campo>
            )
          })}
        </div>
        <Casilla id="mapeo-alias" {...register('guardar_alias')} etiqueta="Guardar como alias para próximas cargas" descripcion="El esquema de carga recordará estos nombres de columna (crea una nueva versión del esquema, auditada)." />
        <ListaErrores mensajes={sueltos} />
        <div className="flex flex-wrap justify-end gap-2">
          <GlassButton icono={Ban} onClick={alCancelar} disabled={isSubmitting}>
            Cancelar carga
          </GlassButton>
          <GlassButton type="submit" variante="primario" icono={Columns3} cargando={isSubmitting}>
            Aplicar y validar
          </GlassButton>
        </div>
      </form>

      {Object.keys(carga.mapeo || {}).length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink-2">Columnas reconocidas automáticamente</h4>
          <ul className="flex flex-wrap gap-2">
            {Object.entries(carga.mapeo).map(([campo, col]) => (
              <li key={campo}>
                <Chip tono="verde">
                  {etiquetas[campo] || campo} ← {col}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="min-w-0">
        <h4 className="mb-2 text-sm font-semibold text-ink-2">Vista previa del archivo (primeras filas)</h4>
        <div className="glass-inset rounded-card p-1">
          <DataTable etiqueta="Vista previa del archivo" idKey="__i" filas={vista} columnas={columnasVista} vacio={<EmptyState titulo="Sin vista previa" texto="El archivo no tiene filas para mostrar." />} />
        </div>
      </div>
    </div>
  )
}

/* ---------------- Paso 3: revisión y confirmación ---------------- */
function PasoRevision({ carga, alConfirmar, alCancelar }) {
  const toast = useToast()
  const r = carga.resumen || {}
  const conErrores = (carga.observados || 0) + (carga.rechazados || 0) > 0
  const muestra = carga.muestra || []
  const bajar = () => datosApi.errores(carga.id).catch((e) => toast.error(e.message))
  return (
    <div className="flex flex-col gap-5">
      <EncabezadoSeccion
        nivel={3}
        titulo="3. Revise y confirme"
        subtitulo={`«${carga.nombre_archivo}» · ${etiquetaTipo(carga.tipo)} · ${periodoCorto(carga.periodo)} · esquema v${carga.esquema_version ?? '—'}`}
        extra={<EstadoChip estado={carga.estado} />}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra etiqueta="Filas leídas" valor={fmtEntero(carga.leidos)} icono={FileSpreadsheet} />
        <Cifra etiqueta="Válidos" valor={fmtEntero(r.validos)} tono="verde" detalle="Se cargarán" />
        <Cifra etiqueta="Observados" valor={fmtEntero(carga.observados)} tono="ambar" detalle="A la bandeja" />
        <Cifra etiqueta="Rechazados" valor={fmtEntero(carga.rechazados)} tono="rojo" detalle="No se cargan" />
      </div>
      <Aviso tono="info">
        Nada se ha guardado todavía. Los <strong>observados</strong> quedan excluidos de mapas e indicadores hasta que se corrijan en la bandeja de depuración; los <strong>rechazados</strong> no se cargan.
      </Aviso>
      {r.no_reconocidas?.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink-2">Columnas del archivo que no se importarán</h4>
          <ul className="flex flex-wrap gap-2">
            {r.no_reconocidas.map((c) => (
              <li key={c}>
                <Chip>{c}</Chip>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="min-w-0">
        <h4 className="mb-2 text-sm font-semibold text-ink-2">Muestra de filas clasificadas</h4>
        <div className="glass-inset rounded-card p-1">
          <DataTable
            etiqueta="Muestra de filas clasificadas"
            idKey="numero_fila"
            filas={muestra}
            vacio={<EmptyState titulo="Sin muestra" texto="No hay filas para mostrar." />}
            columnas={[
              { clave: 'numero_fila', titulo: 'Fila', movil: 'titulo', render: (f) => <span className="tnum font-semibold">Fila {f.numero_fila}</span> },
              { clave: 'clasificacion', titulo: 'Resultado', render: (f) => <EstadoChip dominio="fila" estado={f.clasificacion} /> },
              { clave: 'motivos', titulo: 'Motivos', render: (f) => <Motivos motivos={f.motivos} /> },
              { clave: 'fila_raw', titulo: 'Datos (enmascarados)', render: (f) => <ResumenFila fila={f.fila_raw} /> },
            ]}
          />
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        {conErrores && (
          <GlassButton icono={Download} onClick={bajar}>
            Descargar errores
          </GlassButton>
        )}
        <GlassButton icono={Ban} onClick={alCancelar}>
          Cancelar carga
        </GlassButton>
        <GlassButton variante="primario" icono={ArrowRight} onClick={alConfirmar} disabled={!r.validos && !carga.observados}>
          Confirmar carga
        </GlassButton>
      </div>
    </div>
  )
}

/* ---------------- Paso 4: resultado ---------------- */
function PasoResultado({ carga, periodos, alNueva, puedeValidar }) {
  const toast = useToast()
  const r = carga.resumen || {}
  const bajar = () => datosApi.errores(carga.id).catch((e) => toast.error(e.message))
  if (carga.estado !== 'completada') {
    return (
      <div className="flex flex-col gap-4">
        <EncabezadoSeccion nivel={3} titulo="Carga sin aplicar" subtitulo={`«${carga.nombre_archivo}»`} extra={<EstadoChip estado={carga.estado} />} />
        <Aviso tono={carga.estado === 'fallida' ? 'error' : 'info'}>{carga.mensaje || 'No se guardó ningún registro.'}</Aviso>
        <div className="flex justify-end">
          <GlassButton variante="primario" icono={FileUp} onClick={alNueva}>
            Nueva carga
          </GlassButton>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-5">
      <EncabezadoSeccion nivel={3} titulo="4. Carga completada" subtitulo={`«${carga.nombre_archivo}» · ${etiquetaTipo(carga.tipo)} · ${periodoCorto(carga.periodo)}`} extra={<EstadoChip estado={carga.estado} />} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Cifra etiqueta="Cargados" valor={fmtEntero(carga.cargados)} tono="verde" />
        <Cifra etiqueta="Observados" valor={fmtEntero(r.observados ?? carga.observados)} tono="ambar" detalle="En la bandeja de depuración" />
        <Cifra etiqueta="Rechazados" valor={fmtEntero(r.rechazados ?? carga.rechazados)} tono="rojo" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Cifra etiqueta="Nuevos" valor={fmtEntero(r.nuevos)} tono="azul" />
        <Cifra etiqueta="Actualizados" valor={fmtEntero(r.actualizados)} tono="azul" />
        <Cifra etiqueta="Sin cambio" valor={fmtEntero(r.sin_cambio)} />
      </div>
      {periodos?.length > 0 && (
        <p className="text-sm text-ink-2">
          Indicadores recalculados para: {periodos.map(periodoCorto).join(', ')}.
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        {(r.observados || r.rechazados) > 0 && (
          <GlassButton icono={Download} onClick={bajar}>
            Descargar errores
          </GlassButton>
        )}
        {puedeValidar && r.observados > 0 && (
          <Link to="/datos/observados" className="press glass-control inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold text-ink hover:bg-white/90">
            Ir a la bandeja de observados <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
        <GlassButton variante="primario" icono={FileUp} onClick={alNueva}>
          Nueva carga
        </GlassButton>
      </div>
    </div>
  )
}

function Motivos({ motivos }) {
  if (!motivos?.length) return <span className="text-muted">—</span>
  return (
    <ul className="flex flex-col gap-0.5 text-sm">
      {motivos.map((m, i) => (
        <li key={i}>
          {m.campo && <span className="font-semibold text-ink">{m.campo}: </span>}
          <span className="text-ink-2">{m.motivo}</span>
        </li>
      ))}
    </ul>
  )
}

function ResumenFila({ fila }) {
  const e = Object.entries(fila || {}).slice(0, 4)
  if (!e.length) return <span className="text-muted">—</span>
  return <span className="line-clamp-2 text-xs text-ink-2">{e.map(([k, v]) => `${k}: ${v || '∅'}`).join(' · ')}</span>
}

/* ---------------- Paneles laterales ---------------- */
function PanelLimites({ parametros }) {
  const toast = useToast()
  const [bajando, setBajando] = useState(null)
  const bajar = async (tipo) => {
    setBajando(tipo)
    try {
      await datosApi.plantilla(tipo)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBajando(null)
    }
  }
  return (
    <GlassPanel className="p-5 md:p-6" aria-labelledby="titulo-limites-carga">
      <EncabezadoSeccion id="titulo-limites-carga" titulo="Antes de cargar" subtitulo="Formato y límites vigentes" />
      <div className="grid grid-cols-2 gap-3">
        <Cifra etiqueta="Tamaño máximo" valor={parametros ? `${fmtEntero(parametros.max_mb_carga)} MB` : '—'} />
        <Cifra etiqueta="Filas máximas" valor={parametros ? fmtEntero(parametros.max_filas_carga) : '—'} />
      </div>
      <ul className="mt-4 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-2">
        <li>CSV en UTF-8 con fila de encabezados; separador coma o punto y coma.</li>
        <li>La importación es síncrona: se valida al subir y se guarda solo al confirmar.</li>
        <li>Los encabezados se reconocen por nombre o alias; si falta alguno, podrá asignarlo a mano.</li>
      </ul>
      <h3 className="mt-5 mb-2 text-sm font-semibold text-ink-2">Plantillas del esquema vigente</h3>
      <div className="flex flex-wrap gap-2">
        {TIPOS_CARGA.map((t) => (
          <GlassButton key={t.valor} tam="sm" icono={Download} cargando={bajando === t.valor} onClick={() => bajar(t.valor)}>
            {t.etiqueta}
          </GlassButton>
        ))}
      </div>
    </GlassPanel>
  )
}

function PanelConexionBD() {
  const { data, error, cargando, recargar } = useApi((s) => datosApi.conexionBD(s), [])
  return (
    <GlassPanel className="p-5 md:p-6" aria-labelledby="titulo-conexion-bd">
      <EncabezadoSeccion id="titulo-conexion-bd" titulo="Conexión directa a la base de datos" extra={<Chip tono="neutro" icono={Lock}>{data?.estado || 'Bloqueado'}</Chip>} />
      {cargando ? (
        <LoadingState filas={2} />
      ) : error ? (
        <ErrorState error={error} alReintentar={recargar} compacto />
      ) : (
        <>
          <p className="text-sm text-ink-2">{data.motivo}</p>
          <GlassButton className="mt-4 w-full" icono={PlugZap} disabled aria-describedby="titulo-conexion-bd">
            Conectar (no disponible)
          </GlassButton>
        </>
      )}
    </GlassPanel>
  )
}

/* ---------------- Detalle de una carga del historial ---------------- */
function DetalleCarga({ id, alCerrar, alRetomar }) {
  return (
    <GlassModal abierto={id != null} alCerrar={alCerrar} titulo="Detalle de la carga" ancho="max-w-2xl">
      {id != null && <ContenidoDetalle id={id} alRetomar={alRetomar} />}
    </GlassModal>
  )
}

function ContenidoDetalle({ id, alRetomar }) {
  const toast = useToast()
  const { data: c, error, cargando, recargar } = useApi((s) => datosApi.carga(id, s), [id])
  if (cargando) return <LoadingState filas={5} />
  if (error) return <ErrorState error={error} alReintentar={recargar} />
  const r = c.resumen || {}
  const filas = [
    ['Archivo', c.nombre_archivo],
    ['Tipo', etiquetaTipo(c.tipo)],
    ['Período', periodoCorto(c.periodo)],
    ['Responsable', c.usuario?.nombre || c.usuario?.username],
    ['Subida', fmtFechaHora(c.created_at)],
    ['Confirmada', fmtFechaHora(c.confirmada_en)],
    ['Versión del esquema', c.esquema_version ? `v${c.esquema_version}` : '—'],
    ['Reemplazo', c.reemplazo ? 'Sí' : 'No'],
    ['Huella del archivo', c.hash_archivo ? `${c.hash_archivo.slice(0, 12)}…` : '—'],
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <EstadoChip estado={c.estado} />
        {c.es_seed && <Chip tono="violeta">Datos de demostración</Chip>}
      </div>
      {c.mensaje && <Aviso tono={c.estado === 'fallida' ? 'error' : 'info'}>{c.mensaje}</Aviso>}
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        {filas.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="font-medium break-words text-ink">{v || '—'}</dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-3 gap-2">
        <Cifra etiqueta="Leídas" valor={fmtEntero(c.leidos)} />
        <Cifra etiqueta="Cargados" valor={fmtEntero(c.cargados)} tono="verde" />
        <Cifra etiqueta="Observados" valor={fmtEntero(c.observados)} tono="ambar" />
        <Cifra etiqueta="Rechazados" valor={fmtEntero(c.rechazados)} tono="rojo" />
        <Cifra etiqueta="Nuevos" valor={fmtEntero(r.nuevos)} tono="azul" />
        <Cifra etiqueta="Actualizados" valor={fmtEntero(r.actualizados)} tono="azul" />
      </div>
      {c.faltantes?.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-ink-2">Columnas faltantes</h3>
          <ValorJSON valor={c.faltantes} />
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {(c.observados || c.rechazados) > 0 && (
          <GlassButton icono={Download} onClick={() => datosApi.errores(c.id).catch((e) => toast.error(e.message))}>
            Descargar errores
          </GlassButton>
        )}
        {c.estado === 'requiere_revision' && (
          <GlassButton variante="primario" icono={RotateCcw} onClick={() => alRetomar(c)}>
            Retomar esta carga
          </GlassButton>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Database className="size-3.5" aria-hidden /> Carga n.º {c.id}
      </p>
    </div>
  )
}
