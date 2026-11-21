import { zodResolver } from '@hookform/resolvers/zod'
import { Ban, CheckCircle2, FileJson, FlaskConical, History, Map as IconoMapa, RefreshCw, RotateCcw, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { cacheInvalidate } from '../../api/client'
import { Aviso, Cifra, EncabezadoSeccion, EstadoChip, ListaErrores } from '../../components/admin/Bloques'
import { Campo, Casilla } from '../../components/admin/Campos'
import { ariaCampo, claseControl, tamanoLegible } from '../../components/admin/formulario'
import { ConfirmDialog, EmptyState, InsigniaDemo } from '../../components/feedback/Estados'
import { Chip, GlassButton, GlassPanel } from '../../components/glass/Glass'
import { GlassModal } from '../../components/glass/Overlay'
import { Ensamblado, EncabezadoPagina } from '../../components/layout/Ensamblado'
import { DataTable, LoadMoreFooter } from '../../components/tables/DataTable'
import { useAuth } from '../../context/AuthContext'
import { useBarraSuperior } from '../../context/FiltrosContext'
import { useToast } from '../../context/ToastContext'
import { datosApi } from '../../features/datos/api'
import { useCursorList } from '../../hooks/useApi'
import { fmtEntero, fmtFechaHora } from '../../utils/format'

// Todo lo que depende de las divisiones geográficas se vuelve a pedir tras confirmar
const AFECTADAS = ['/zonas', '/mapa', '/panel', '/indicadores', '/comparar', '/clasificacion', '/reportes', '/potencial']

const PROPIEDADES = [
  ['codigo', 'Código único de la zona', true],
  ['nombre', 'Nombre de la zona', true],
  ['tipo_zona', 'provincia, canton, parroquia o barrio (también «sector»)', true],
  ['zona_superior_codigo', 'Código de la zona del nivel inmediato superior (no aplica a provincias)', true],
  ['hogares_estimados', 'Número entero de hogares (para la penetración)', false],
  ['fuente_oficial', 'Fuente de los límites (p. ej. INEC, GAD)', false],
]

const EJEMPLO = `{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "properties": {
      "codigo": "LOJ-VAL-05",
      "nombre": "Barrio de ejemplo",
      "tipo_zona": "barrio",
      "zona_superior_codigo": "LOJ-VAL",
      "hogares_estimados": 600,
      "fuente_oficial": "DEMO (sintético)"
    },
    "geometry": { "type": "Polygon", "coordinates": [[[-79.18, -3.952], …]] }
  }]
}`

export default function Limites() {
  useBarraSuperior({}, [])
  const toast = useToast()
  const [carga, setCarga] = useState(null)
  const [rechazo, setRechazo] = useState(null)
  const [retirar, setRetirar] = useState(false)
  const [dialogo, setDialogo] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const historial = useCursorList(({ cursor, signal }) => datosApi.limites({ cursor }, signal), [])

  const subida = (c) => {
    setRechazo(null)
    setRetirar(false)
    setCarga(c)
    historial.recargar()
  }
  const confirmar = async () => {
    setOcupado(true)
    try {
      const c = await datosApi.confirmarLimites(carga.id, retirar)
      cacheInvalidate(...AFECTADAS)
      setCarga(c)
      toast.exito('Divisiones geográficas actualizadas. Los indicadores se recalcularon.')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setOcupado(false)
      setDialogo(null)
      historial.recargar()
    }
  }
  const cancelar = async () => {
    setOcupado(true)
    try {
      await datosApi.cancelarLimites(carga.id)
      setCarga(null)
      toast.info('Carga de límites cancelada. Se conservan las divisiones vigentes.')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setOcupado(false)
      setDialogo(null)
      historial.recargar()
    }
  }
  const retomar = (c) => {
    setDetalle(null)
    setRechazo(null)
    setRetirar(false)
    setCarga(c)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const conteo = carga?.resumen?.conteo || {}
  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina
        titulo="Límites geográficos"
        subtitulo="Actualice provincias, cantones, parroquias y barrios desde un archivo GeoJSON con vista previa de cambios"
        insignias={
          <>
            <Chip tono="violeta" icono={FlaskConical}>Límites actuales: DEMO (sintético)</Chip>
            <InsigniaDemo />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-[var(--gap)] xl:grid-cols-12">
        <GlassPanel className="flex min-w-0 flex-col gap-5 p-5 md:p-6 xl:col-span-7" aria-labelledby="titulo-limites-flujo">
          <h2 id="titulo-limites-flujo" className="sr-only">
            Actualizar límites
          </h2>
          {!carga || carga.estado === 'cancelada' ? (
            <>
              <FormLimites alSubida={subida} alRechazo={(r) => (setRechazo(r), historial.recargar())} />
              {rechazo && (
                <Aviso tono="error" rol="alert" titulo={rechazo.mensaje}>
                  {rechazo.details?.length > 0 && (
                    <ul className="mt-1 max-h-64 list-disc space-y-0.5 overflow-y-auto pl-4">
                      {rechazo.details.map((d, i) => (
                        <li key={i}>
                          <span className="font-semibold">{d.campo}:</span> {d.mensaje}
                        </li>
                      ))}
                    </ul>
                  )}
                </Aviso>
              )}
            </>
          ) : carga.estado === 'requiere_revision' ? (
            <>
              <EncabezadoSeccion nivel={3} titulo="Vista previa de cambios" subtitulo={`«${carga.nombre_archivo}» · ${fmtEntero(carga.leidos)} zonas en el archivo`} extra={<EstadoChip estado={carga.estado} />} />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Cifra etiqueta="Nuevas" valor={fmtEntero(conteo.nuevas)} tono="verde" />
                <Cifra etiqueta="Modificadas" valor={fmtEntero(conteo.modificadas)} tono="ambar" />
                <Cifra etiqueta="Sin cambio" valor={fmtEntero(conteo.sin_cambio)} />
                <Cifra etiqueta="Ausentes en el archivo" valor={fmtEntero(conteo.ausentes)} tono="rojo" />
              </div>
              <ListaCodigos titulo="Zonas nuevas" codigos={carga.resumen.nuevas} tono="verde" />
              <ListaCodigos titulo="Zonas modificadas" codigos={carga.resumen.modificadas} tono="ambar" />
              <ListaCodigos titulo="Zonas vigentes que no están en el archivo" codigos={carga.resumen.ausentes} tono="rojo" />
              {conteo.ausentes > 0 && (
                <div className="rounded-card bg-white/50 px-3">
                  <Casilla
                    id="limites-retirar"
                    checked={retirar}
                    onChange={(e) => setRetirar(e.target.checked)}
                    etiqueta={`Retirar las ${fmtEntero(conteo.ausentes)} zonas ausentes`}
                    descripcion="Dejarán de estar vigentes. Si no lo marca, se conservan tal como están y solo se aplican las nuevas y modificadas."
                  />
                </div>
              )}
              <Aviso tono="info">Al confirmar se reasignan las ubicaciones de socios a las nuevas zonas y se recalculan todos los indicadores. Hasta entonces se mantienen las divisiones vigentes.</Aviso>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <GlassButton icono={Ban} onClick={() => setDialogo('cancelar')}>
                  Cancelar
                </GlassButton>
                <GlassButton variante="primario" icono={CheckCircle2} onClick={() => setDialogo('confirmar')}>
                  Confirmar cambios
                </GlassButton>
              </div>
            </>
          ) : (
            <ResultadoLimites carga={carga} alNueva={() => setCarga(null)} />
          )}
        </GlassPanel>

        <GlassPanel className="min-w-0 p-5 md:p-6 xl:col-span-5" aria-labelledby="titulo-formato-geojson">
          <EncabezadoSeccion id="titulo-formato-geojson" titulo="Formato esperado" subtitulo="GeoJSON FeatureCollection en coordenadas WGS 84 (SRID 4326: longitud, latitud)" />
          <ul className="flex flex-col gap-2 text-sm">
            {PROPIEDADES.map(([p, d, req]) => (
              <li key={p} className="glass-inset rounded-2xl px-3 py-2">
                <span className="flex flex-wrap items-center gap-2">
                  <code className="font-semibold text-brand-700">{p}</code>
                  <Chip tono={req ? 'azul' : 'neutro'}>{req ? 'Obligatoria' : 'Opcional'}</Chip>
                </span>
                <span className="mt-0.5 block text-ink-2">{d}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-ink-2">Geometrías Polygon o MultiPolygon válidas. Si el archivo está incompleto o no puede interpretarse, se rechaza completo y se conservan las divisiones vigentes.</p>
          <details className="mt-3">
            <summary className="press flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-brand-700">
              <FileJson className="size-4" aria-hidden /> Ver un ejemplo
            </summary>
            <pre className="thin-scroll mt-2 max-w-full overflow-x-auto rounded-2xl bg-white/70 p-3 text-xs leading-relaxed text-ink-2">{EJEMPLO}</pre>
          </details>
        </GlassPanel>
      </div>

      <GlassPanel className="min-w-0 p-2 md:p-3" aria-labelledby="titulo-historial-limites">
        <div className="px-3 pt-3 md:px-4">
          <EncabezadoSeccion
            id="titulo-historial-limites"
            titulo="Historial de actualizaciones"
            subtitulo="Seleccione una carga para ver su detalle."
            extra={<GlassButton tam="sm" icono={RefreshCw} onClick={historial.recargar}>Actualizar</GlassButton>}
          />
        </div>
        <DataTable
          etiqueta="Historial de cargas de límites"
          filas={historial.items}
          cargando={historial.cargando}
          error={historial.error}
          alReintentar={historial.recargar}
          alSeleccionar={setDetalle}
          seleccionado={detalle?.id}
          vacio={<EmptyState icono={History} titulo="Sin actualizaciones" texto="Las cargas de límites que realice aparecerán aquí." />}
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
            { clave: 'estado', titulo: 'Estado', render: (f) => <EstadoChip estado={f.estado} /> },
            { clave: 'leidos', titulo: 'Zonas', alinear: 'derecha', render: (f) => fmtEntero(f.leidos) },
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
        titulo="¿Aplicar los nuevos límites?"
        texto={`Se crearán ${fmtEntero(conteo.nuevas)} zonas y se actualizarán ${fmtEntero(conteo.modificadas)}.${retirar ? ` Se retirarán ${fmtEntero(conteo.ausentes)} zonas ausentes.` : ''} Se recalcularán todos los indicadores.`}
        confirmar="Aplicar límites"
      />
      <ConfirmDialog
        abierto={dialogo === 'cancelar'}
        alCerrar={() => !ocupado && setDialogo(null)}
        alConfirmar={cancelar}
        cargando={ocupado}
        peligro
        titulo="¿Cancelar la actualización?"
        texto="Se descartará la vista previa y se conservarán las divisiones vigentes."
        confirmar="Cancelar actualización"
      />
      <GlassModal abierto={Boolean(detalle)} alCerrar={() => setDetalle(null)} titulo="Detalle de la carga de límites" ancho="max-w-2xl">
        {detalle && <DetalleLimites carga={detalle} alRetomar={retomar} />}
      </GlassModal>
    </Ensamblado>
  )
}

function FormLimites({ alSubida, alRechazo }) {
  const { parametros } = useAuth()
  const maxMb = parametros?.max_mb_carga
  const [sueltos, setSueltos] = useState([])
  const esquema = useMemo(
    () =>
      z.object({
        archivo: z.any().superRefine((v, ctx) => {
          const f = v?.[0]
          if (!f) ctx.addIssue({ code: 'custom', message: 'Seleccione un archivo GeoJSON.' })
          else if (!/\.(geo)?json$/i.test(f.name)) ctx.addIssue({ code: 'custom', message: 'El archivo debe tener extensión .geojson o .json.' })
          else if (maxMb && f.size > maxMb * 1024 * 1024) ctx.addIssue({ code: 'custom', message: `El archivo supera el límite de ${maxMb} MB.` })
        }),
      }),
    [maxMb],
  )
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(esquema) })
  const archivo = useWatch({ control, name: 'archivo' })?.[0]

  const enviar = async (v) => {
    setSueltos([])
    const fd = new FormData()
    fd.append('archivo', v.archivo[0])
    try {
      alSubida(await datosApi.subirLimites(fd))
    } catch (e) {
      if (e.code === 'LIMITES_INVALIDOS') alRechazo({ mensaje: e.message, details: e.details })
      else if (e.campos?.archivo || ['ARCHIVO_DEMASIADO_GRANDE', 'ARCHIVO_VACIO'].includes(e.code)) setError('archivo', { type: 'server', message: e.campos?.archivo || e.message }, { shouldFocus: true })
      else setSueltos([e.message])
    }
  }

  return (
    <form onSubmit={handleSubmit(enviar)} noValidate className="flex flex-col gap-4">
      <EncabezadoSeccion nivel={3} titulo="Subir archivo de límites" subtitulo="Primero verá los cambios; nada se aplica hasta que confirme." />
      <Campo id="limites-archivo" etiqueta="Archivo GeoJSON" error={errors.archivo?.message} ayuda={archivo ? `${archivo.name} · ${tamanoLegible(archivo.size)}` : `Hasta ${maxMb ?? '—'} MB.`}>
        <input
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          {...register('archivo')}
          {...ariaCampo('limites-archivo', errors.archivo, true)}
          className={claseControl(errors.archivo, 'py-2 text-sm file:mr-3 file:min-h-9 file:cursor-pointer file:rounded-full file:border-0 file:bg-brand-50 file:px-4 file:font-semibold file:text-brand-700')}
        />
      </Campo>
      <ListaErrores mensajes={sueltos} />
      {isSubmitting && <Aviso tono="info" icono={RefreshCw}>Validando geometrías y jerarquía… puede tardar unos segundos.</Aviso>}
      <div className="flex justify-end">
        <GlassButton type="submit" variante="primario" icono={Upload} cargando={isSubmitting}>
          Subir y comparar
        </GlassButton>
      </div>
    </form>
  )
}

function ListaCodigos({ titulo, codigos, tono }) {
  const [todos, setTodos] = useState(false)
  if (!codigos?.length) return null
  const visibles = todos ? codigos : codigos.slice(0, 24)
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-ink-2">
        {titulo} ({fmtEntero(codigos.length)})
      </h4>
      <ul className="flex flex-wrap gap-1.5">
        {visibles.map((c) => (
          <li key={c}>
            <Chip tono={tono}>{c}</Chip>
          </li>
        ))}
      </ul>
      {codigos.length > 24 && (
        <button type="button" onClick={() => setTodos((t) => !t)} className="press mt-1 min-h-11 text-sm font-semibold text-brand-700 hover:underline" aria-expanded={todos}>
          {todos ? 'Mostrar menos' : `Ver los ${fmtEntero(codigos.length)}`}
        </button>
      )}
    </div>
  )
}

function ResultadoLimites({ carga, alNueva }) {
  const a = carga.resumen?.aplicado || {}
  return (
    <div className="flex flex-col gap-4">
      <EncabezadoSeccion nivel={3} titulo="Límites actualizados" subtitulo={`«${carga.nombre_archivo}» · ${fmtFechaHora(carga.confirmada_en)}`} extra={<EstadoChip estado={carga.estado} />} />
      {carga.estado === 'completada' ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cifra etiqueta="Creadas" valor={fmtEntero(a.creadas)} tono="verde" />
          <Cifra etiqueta="Actualizadas" valor={fmtEntero(a.actualizadas)} tono="azul" />
          <Cifra etiqueta="Retiradas" valor={fmtEntero(a.retiradas)} tono="rojo" />
          <Cifra etiqueta="Ubicaciones reasignadas" valor={fmtEntero(a.ubicaciones_reasignadas)} icono={IconoMapa} />
        </div>
      ) : (
        <Aviso tono={carga.estado === 'fallida' ? 'error' : 'info'}>{carga.mensaje}</Aviso>
      )}
      <div className="flex justify-end">
        <GlassButton variante="primario" icono={Upload} onClick={alNueva}>
          Subir otro archivo
        </GlassButton>
      </div>
    </div>
  )
}

function DetalleLimites({ carga, alRetomar }) {
  const r = carga.resumen || {}
  const errores = r.errores || []
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <EstadoChip estado={carga.estado} />
        <span className="text-sm text-muted">
          {carga.usuario?.nombre || carga.usuario?.username} · {fmtFechaHora(carga.created_at)}
        </span>
      </div>
      <p className="font-semibold break-words text-ink">{carga.nombre_archivo}</p>
      {carga.mensaje && <Aviso tono={carga.estado === 'fallida' ? 'error' : 'info'}>{carga.mensaje}</Aviso>}
      {r.conteo && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cifra etiqueta="Nuevas" valor={fmtEntero(r.conteo.nuevas)} tono="verde" />
          <Cifra etiqueta="Modificadas" valor={fmtEntero(r.conteo.modificadas)} tono="ambar" />
          <Cifra etiqueta="Sin cambio" valor={fmtEntero(r.conteo.sin_cambio)} />
          <Cifra etiqueta="Ausentes" valor={fmtEntero(r.conteo.ausentes)} tono="rojo" />
        </div>
      )}
      {r.aplicado && (
        <p className="text-sm text-ink-2">
          Aplicado: {fmtEntero(r.aplicado.creadas)} creadas, {fmtEntero(r.aplicado.actualizadas)} actualizadas, {fmtEntero(r.aplicado.retiradas)} retiradas y {fmtEntero(r.aplicado.ubicaciones_reasignadas)} ubicaciones reasignadas.
        </p>
      )}
      {errores.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-ink-2">Errores encontrados ({fmtEntero(errores.length)})</h3>
          <ul className="thin-scroll max-h-64 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm text-ink-2">
            {errores.map((e, i) => (
              <li key={i}>
                <span className="font-semibold text-ink">{e.codigo}:</span> {e.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}
      {carga.estado === 'requiere_revision' && (
        <div className="flex justify-end">
          <GlassButton variante="primario" icono={RotateCcw} onClick={() => alRetomar(carga)}>
            Retomar la vista previa
          </GlassButton>
        </div>
      )}
    </div>
  )
}
