import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, ChevronDown, Clock, CopyPlus, History, ThumbsDown, ThumbsUp, XCircle } from 'lucide-react'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ESTADOS_VERSION } from '../../features/clasificacion/api'
import { fmtFechaHora } from '../../utils/format'
import { Chip, GlassButton } from '../glass/Glass'
import { GlassModal } from '../glass/Overlay'
import { ChipCategoria, Campo } from './Partes'
import { CLASE_CONTROL, textoRegla } from './formatos'

const ICONOS_ESTADO = { pendiente: Clock, vigente: CheckCircle2, anterior: History, rechazada: XCircle }

export function EstadoVersion({ estado }) {
  const e = ESTADOS_VERSION[estado] || { etiqueta: estado, tono: 'neutro' }
  return (
    <Chip tono={e.tono} icono={ICONOS_ESTADO[estado]}>
      {e.etiqueta}
    </Chip>
  )
}

/** Tarjeta de una versión de criterios: estado, autoría, fechas, categorías y acciones permitidas. */
export function TarjetaVersion({ version: v, alPlantilla, alAprobar, alRechazar, abiertaInicial = false }) {
  const [abierta, setAbierta] = useState(abiertaInicial)
  const id = useId()
  const ordenadas = [...v.categorias].sort((a, b) => a.prioridad - b.prioridad)
  return (
    <article className={`flex flex-col gap-3 rounded-card p-4 md:p-5 ${v.estado === 'pendiente' ? 'bg-white shadow-sm ring-1 ring-sun-400/50' : 'glass-inset'}`} aria-labelledby={`${id}-t`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`${id}-t`} className="flex flex-wrap items-center gap-2 text-base font-bold text-ink">
            Versión {v.version} <EstadoVersion estado={v.estado} />
          </h3>
          <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 text-xs text-muted sm:grid-cols-2">
            <div>
              <dt className="inline">Definida por </dt>
              <dd className="inline font-semibold text-ink-2">{v.creado_por}</dd>
              <dd className="inline"> · {fmtFechaHora(v.created_at)}</dd>
            </div>
            {v.aprobado_por && (
              <div>
                <dt className="inline">Aprobada por </dt>
                <dd className="inline font-semibold text-ink-2">{v.aprobado_por}</dd>
                <dd className="inline"> · {fmtFechaHora(v.aprobado_en)}</dd>
              </div>
            )}
          </dl>
        </div>
        <span className="tnum text-xs text-muted">{v.categorias.length} categorías</span>
      </div>

      {v.nota && <p className="text-sm text-ink-2">{v.nota}</p>}
      {v.estado === 'rechazada' && v.motivo_rechazo && (
        <p className="rounded-control bg-[#fbe9e5] px-3 py-2 text-sm text-danger-ink">
          <span className="font-semibold">Motivo del rechazo:</span> {v.motivo_rechazo}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {ordenadas.map((c) => (
          <ChipCategoria key={c.id} categoria={c} />
        ))}
      </div>

      <button type="button" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta} aria-controls={`${id}-d`} className="press inline-flex min-h-11 items-center gap-1 self-start rounded-full px-2 text-sm font-semibold text-brand-700 hover:bg-white/60">
        <ChevronDown className={`size-4 transition-transform ${abierta ? 'rotate-180' : ''}`} aria-hidden />
        {abierta ? 'Ocultar reglas' : 'Ver categorías y reglas'}
      </button>
      {abierta && (
        <ol id={`${id}-d`} className="flex flex-col gap-2">
          {ordenadas.map((c) => (
            <li key={c.id} className="rounded-2xl bg-white/70 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  <span className="tnum text-muted">{c.prioridad}.</span>
                  <ChipCategoria categoria={c} />
                </span>
                <span className="text-xs text-muted">{c.frecuencia_visita_dias ? `Visita cada ${c.frecuencia_visita_dias} días` : 'Sin frecuencia de visita'}</span>
              </div>
              {c.descripcion && <p className="mt-1 text-ink-2">{c.descripcion}</p>}
              <p className="mt-1 text-ink-2">
                <span className="font-semibold">Reglas: </span>
                {c.reglas.length ? c.reglas.map(textoRegla).join(' y ') : 'sin reglas'}
              </p>
            </li>
          ))}
        </ol>
      )}

      {(alPlantilla || alAprobar || alRechazar) && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-white/70 pt-3">
          {alPlantilla && (
            <GlassButton icono={CopyPlus} tam="sm" onClick={() => alPlantilla(v)}>
              Usar como plantilla
            </GlassButton>
          )}
          {alRechazar && (
            <GlassButton icono={ThumbsDown} tam="sm" variante="fantasma" onClick={() => alRechazar(v)}>
              Rechazar
            </GlassButton>
          )}
          {alAprobar && (
            <GlassButton icono={ThumbsUp} tam="sm" variante="primario" onClick={() => alAprobar(v)}>
              Aprobar
            </GlassButton>
          )}
        </div>
      )}
    </article>
  )
}

const esquemaRechazo = z.object({ motivo: z.string().trim().min(1, 'Indique el motivo del rechazo.').max(300, 'Máximo 300 caracteres.') })

/** Rechazo con motivo obligatorio (se audita). Errores del servidor mapeados al campo. */
export function DialogoRechazo({ version, alCerrar, alRechazar }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(esquemaRechazo), defaultValues: { motivo: '' } })
  const enviar = handleSubmit(async ({ motivo }) => {
    try {
      await alRechazar(motivo.trim())
    } catch (e) {
      setError('motivo', { message: e.campos?.motivo || e.message })
    }
  })
  return (
    <GlassModal
      abierto={Boolean(version)}
      alCerrar={isSubmitting ? undefined : alCerrar}
      titulo={`Rechazar la versión ${version?.version ?? ''}`}
      descripcion="La versión quedará como rechazada y no podrá aprobarse después. El motivo queda registrado en el historial."
      pie={
        <>
          <GlassButton onClick={alCerrar} disabled={isSubmitting}>
            Cancelar
          </GlassButton>
          <GlassButton variante="peligro" icono={ThumbsDown} onClick={enviar} cargando={isSubmitting}>
            Rechazar versión
          </GlassButton>
        </>
      }
    >
      <form noValidate onSubmit={enviar}>
        <Campo etiqueta="Motivo del rechazo" error={errors.motivo?.message} ayuda="Máximo 300 caracteres.">
          {(a11y) => <textarea {...a11y} {...register('motivo')} rows={4} maxLength={300} data-autofocus className={`${CLASE_CONTROL} h-auto py-2.5`} />}
        </Campo>
      </form>
    </GlassModal>
  )
}
