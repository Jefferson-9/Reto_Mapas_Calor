import { CopyPlus, FilePlus2, Info, SlidersHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { EditorCriterios } from '../components/analisis/EditorCriterios'
import { DialogoRechazo, EstadoVersion, TarjetaVersion } from '../components/analisis/VersionCriterios'
import { desdeVersion, versionVacia } from '../components/analisis/criteriosForm'
import { ConfirmDialog, EmptyState, ErrorState, EtiquetaProvisional, LoadingState } from '../components/feedback/Estados'
import { GlassButton, GlassPanel } from '../components/glass/Glass'
import { Ensamblado, EncabezadoPagina, Grupo, Pieza } from '../components/layout/Ensamblado'
import { useAuth } from '../context/AuthContext'
import { useBarraSuperior } from '../context/FiltrosContext'
import { useToast } from '../context/ToastContext'
import { clasificacionApi } from '../features/clasificacion/api'
import { useApi } from '../hooks/useApi'
import { fmtFechaHora } from '../utils/format'

export default function Criterios() {
  const { puede } = useAuth()
  const toast = useToast()
  const definir = puede('criterios.definir')
  const aprobar = puede('criterios.aprobar')
  useBarraSuperior({}, [])

  const { data, error, cargando, recargar } = useApi((s) => clasificacionApi.versiones(s), [])
  const versiones = data?.items || []
  const vigente = versiones.find((v) => v.estado === 'vigente')
  const pendientes = versiones.filter((v) => v.estado === 'pendiente').length

  const [editor, setEditor] = useState(null) // {clave, valores, origen}
  const [reemplazo, setReemplazo] = useState(null)
  const [aprobando, setAprobando] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [rechazando, setRechazando] = useState(null)
  const refEditor = useRef(null)

  useEffect(() => {
    if (editor?.clave) refEditor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [editor?.clave])

  const abrirEditor = (valores, origen) => setEditor((e) => ({ clave: (e?.clave || 0) + 1, valores, origen }))
  // Si ya hay un borrador abierto, se confirma antes de reemplazarlo
  const pedirEditor = (valores, origen) => (editor ? setReemplazo({ valores, origen }) : abrirEditor(valores, origen))
  const nueva = () => pedirEditor(versionVacia(), 'Versión en blanco')
  const plantilla = (v) => pedirEditor(desdeVersion(v), `Plantilla: versión ${v.version}${v.estado === 'vigente' ? ' (vigente)' : ''}`)

  const confirmarAprobacion = async () => {
    setEnviando(true)
    try {
      const v = await clasificacionApi.aprobar(aprobando.id)
      toast.exito(`Versión ${v.version} aprobada y vigente. La clasificación de zonas se recalculó.`)
      setAprobando(null)
      recargar()
    } catch (e) {
      toast.error(e.status === 403 ? 'No tiene permiso para aprobar criterios.' : e.message)
    } finally {
      setEnviando(false)
    }
  }
  const rechazar = async (motivo) => {
    try {
      const v = await clasificacionApi.rechazar(rechazando.id, motivo)
      toast.exito(`Versión ${v.version} rechazada.`)
      setRechazando(null)
      recargar()
    } catch (e) {
      if (e.status === 403) toast.error('No tiene permiso para rechazar criterios.')
      throw e
    }
  }

  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina
        titulo="Criterios de clasificación"
        subtitulo="Versiones de categorías y reglas para clasificar y priorizar zonas"
        insignias={<EtiquetaProvisional texto="Umbrales DEMO / definición provisional" detalle="Los umbrales de los criterios son de demostración y deben validarse con la cooperativa; no son oficiales." />}
        extra={
          definir && (
            <>
              {vigente && (
                <GlassButton icono={CopyPlus} onClick={() => plantilla(vigente)} redondo>
                  Partir de la vigente
                </GlassButton>
              )}
              <GlassButton icono={FilePlus2} variante="primario" onClick={nueva} redondo>
                Nueva versión
              </GlassButton>
            </>
          )
        }
      />

      <GlassPanel className="flex flex-col gap-3 p-5 md:flex-row md:items-start md:gap-6 md:p-6">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
            <SlidersHorizontal className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">Versión vigente</h2>
            {!data && !error ? (
              <LoadingState filas={1} alto="h-6" />
            ) : vigente ? (
              <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
                Versión {vigente.version} <EstadoVersion estado="vigente" /> aprobada por <strong>{vigente.aprobado_por || '—'}</strong> el {fmtFechaHora(vigente.aprobado_en)}.
              </p>
            ) : (
              <p className="text-sm text-ink-2">No hay una versión aprobada: las zonas no se pueden clasificar hasta que se apruebe una.</p>
            )}
            {pendientes > 0 && <p className="mt-1 text-sm font-medium text-sun-700">{pendientes === 1 ? 'Hay 1 versión pendiente de aprobación.' : `Hay ${pendientes} versiones pendientes de aprobación.`}</p>}
          </div>
        </div>
        <p className="flex items-start gap-2 text-xs text-muted md:max-w-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Las reglas de una categoría se combinan con «Y». Las categorías se evalúan por prioridad (1 = mayor) y gana la primera que se cumple. Al aprobar una versión, la anterior se conserva como «Anterior» y la clasificación se recalcula.
        </p>
      </GlassPanel>

      {editor && (
        <div ref={refEditor} className="scroll-mt-[calc(var(--bar-h)+32px)]">
          <EditorCriterios
            key={editor.clave}
            valoresIniciales={editor.valores}
            origen={editor.origen}
            alCancelar={() => setEditor(null)}
            alGuardado={() => {
              setEditor(null)
              recargar()
            }}
          />
        </div>
      )}

      <GlassPanel className="flex flex-col gap-4 p-5 md:p-6">
        <div>
          <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">Historial de versiones</h2>
          <p className="text-sm text-muted">Estado, quién definió y aprobó cada versión y cuándo.</p>
        </div>
        {error ? (
          <ErrorState error={error} alReintentar={recargar} />
        ) : !data || cargando ? (
          <LoadingState filas={3} alto="h-28" />
        ) : versiones.length === 0 ? (
          <EmptyState
            titulo="Aún no hay versiones"
            texto="Defina la primera versión de criterios para poder clasificar las zonas."
            accion={definir && <GlassButton icono={FilePlus2} variante="primario" onClick={nueva}>Nueva versión</GlassButton>}
          />
        ) : (
          <Grupo as="ul" escalon={0.04} className="flex flex-col gap-3">
            {versiones.map((v) => (
              <Pieza as="li" key={v.id}>
                <TarjetaVersion
                  version={v}
                  abiertaInicial={v.estado === 'pendiente'}
                  alPlantilla={definir ? plantilla : null}
                  alAprobar={aprobar && v.estado === 'pendiente' ? setAprobando : null}
                  alRechazar={aprobar && v.estado === 'pendiente' ? setRechazando : null}
                />
              </Pieza>
            ))}
          </Grupo>
        )}
      </GlassPanel>

      <ConfirmDialog
        abierto={Boolean(aprobando)}
        alCerrar={() => !enviando && setAprobando(null)}
        alConfirmar={confirmarAprobacion}
        cargando={enviando}
        titulo={`¿Aprobar la versión ${aprobando?.version ?? ''}?`}
        texto={`Pasará a ser la versión vigente${vigente ? `; la versión ${vigente.version} quedará como anterior` : ''}. La clasificación de todas las zonas se recalculará en todos los períodos. Esta acción no se puede deshacer.`}
        confirmar="Aprobar y aplicar"
      />
      <ConfirmDialog
        abierto={Boolean(reemplazo)}
        alCerrar={() => setReemplazo(null)}
        alConfirmar={() => {
          abrirEditor(reemplazo.valores, reemplazo.origen)
          setReemplazo(null)
        }}
        titulo="¿Reemplazar el borrador?"
        texto="Ya hay una versión en edición. Si continúa, se perderán los cambios no guardados."
        confirmar="Reemplazar"
        peligro
      />
      {rechazando && <DialogoRechazo key={rechazando.id} version={rechazando} alCerrar={() => setRechazando(null)} alRechazar={rechazar} />}
    </Ensamblado>
  )
}
