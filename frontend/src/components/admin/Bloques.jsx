import { Ban, CheckCircle2, CircleAlert, CircleDashed, Clock3, Info, Loader, ShieldAlert, TriangleAlert, XCircle } from 'lucide-react'
import { Fragment } from 'react'
import { Chip } from '../glass/Glass'

// Estados con tono, ícono y texto (nunca solo color)
const ESTADOS = {
  carga: {
    pendiente: ['azul', CircleDashed, 'Pendiente'],
    validando: ['azul', Loader, 'Validando'],
    procesando: ['azul', Loader, 'Procesando'],
    requiere_revision: ['ambar', Clock3, 'Requiere revisión'],
    completada: ['verde', CheckCircle2, 'Completada'],
    fallida: ['rojo', XCircle, 'Fallida'],
    cancelada: ['neutro', Ban, 'Cancelada'],
  },
  observado: {
    pendiente: ['ambar', Clock3, 'Pendiente'],
    corregido: ['verde', CheckCircle2, 'Corregido'],
    descartado: ['neutro', Ban, 'Descartado'],
    conservado: ['violeta', ShieldAlert, 'Conservado'],
  },
  fila: {
    valido: ['verde', CheckCircle2, 'Válido'],
    observado: ['ambar', CircleAlert, 'Observado'],
    rechazado: ['rojo', XCircle, 'Rechazado'],
  },
}

export function EstadoChip({ estado, dominio = 'carga' }) {
  const [tono, icono, texto] = ESTADOS[dominio]?.[estado] || ['neutro', CircleDashed, estado || '—']
  return (
    <Chip tono={tono} icono={icono}>
      {texto}
    </Chip>
  )
}

const TONOS_CIFRA = { neutro: 'text-ink', verde: 'text-ok-ink', ambar: 'text-sun-700', rojo: 'text-danger-ink', azul: 'text-brand-700', violeta: 'text-[#5b3fa6]' }

/** Cifra resumida dentro de un panel (sub-tarjeta casi opaca, sin vidrio sobre vidrio). */
export function Cifra({ etiqueta, valor, detalle, icono: Icono, tono = 'neutro', className = '' }) {
  return (
    <div className={`glass-inset min-w-0 rounded-card p-4 ${className}`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        {Icono && <Icono className={`size-3.5 ${TONOS_CIFRA[tono]}`} aria-hidden />}
        {etiqueta}
      </p>
      <p className={`tnum mt-1 text-2xl font-bold tracking-[-0.02em] ${TONOS_CIFRA[tono]}`}>{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-muted">{detalle}</p>}
    </div>
  )
}

const AVISOS = {
  info: ['bg-brand-50/90 text-brand-900 ring-brand-200/60', Info],
  aviso: ['bg-sun-100/90 text-sun-700 ring-sun-400/40', TriangleAlert],
  error: ['bg-[#fbe9e5] text-danger-ink ring-danger/20', XCircle],
  ok: ['bg-[#e6f5ee] text-ok-ink ring-ok/20', CheckCircle2],
}

/** Aviso en línea con ícono y texto. `rol="alert"` para errores que interrumpen. */
export function Aviso({ tono = 'info', titulo, children, rol = 'status', icono, className = '' }) {
  const [clase, IconoBase] = AVISOS[tono]
  const Icono = icono || IconoBase
  return (
    <div role={rol} className={`flex items-start gap-3 rounded-card px-4 py-3 text-sm ring-1 ${clase} ${className}`}>
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children && <div className={titulo ? 'mt-0.5' : ''}>{children}</div>}
      </div>
    </div>
  )
}

/** Encabezado de sección dentro de un panel. */
export function EncabezadoSeccion({ titulo, subtitulo, extra, nivel = 2, id }) {
  const H = `h${nivel}`
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <H id={id} className="text-lg font-bold tracking-[-0.02em] text-ink">
          {titulo}
        </H>
        {subtitulo && <p className="mt-0.5 text-sm text-muted">{subtitulo}</p>}
      </div>
      {extra && <div className="flex flex-wrap items-center gap-2">{extra}</div>}
    </div>
  )
}

/** Lista de mensajes del servidor que no corresponden a un campo concreto. */
export function ListaErrores({ titulo = 'Revise lo siguiente', mensajes }) {
  if (!mensajes?.length) return null
  return (
    <Aviso tono="error" rol="alert" titulo={titulo}>
      <ul className="list-disc space-y-0.5 pl-4">
        {mensajes.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
    </Aviso>
  )
}

/** Representación legible de valores JSON (valores anterior/nuevo del historial, resúmenes). */
export function ValorJSON({ valor, profundidad = 0 }) {
  if (valor === null || valor === undefined || valor === '') return <span className="text-muted">—</span>
  if (typeof valor === 'boolean') return <span>{valor ? 'Sí' : 'No'}</span>
  if (typeof valor !== 'object') return <span className="break-words">{String(valor)}</span>
  if (profundidad > 2) return <code className="break-all text-xs">{JSON.stringify(valor)}</code>
  if (Array.isArray(valor)) {
    if (!valor.length) return <span className="text-muted">(vacío)</span>
    if (valor.every((v) => typeof v !== 'object' || v === null)) return <span className="break-words">{valor.join(', ')}</span>
    return (
      <ol className="flex flex-col gap-1.5">
        {valor.slice(0, 50).map((v, i) => (
          <li key={i} className="rounded-xl bg-white/55 px-2.5 py-1.5">
            <ValorJSON valor={v} profundidad={profundidad + 1} />
          </li>
        ))}
        {valor.length > 50 && <li className="text-xs text-muted">… y {valor.length - 50} más</li>}
      </ol>
    )
  }
  const entradas = Object.entries(valor)
  if (!entradas.length) return <span className="text-muted">(vacío)</span>
  return (
    <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
      {entradas.map(([k, v]) => (
        <Fragment key={k}>
          <dt className="font-medium break-all text-muted">{k}</dt>
          <dd className="min-w-0 text-ink">
            <ValorJSON valor={v} profundidad={profundidad + 1} />
          </dd>
        </Fragment>
      ))}
    </dl>
  )
}

/** Indicador de pasos de un asistente (aria-current en el paso activo; texto además del color). */
export function Pasos({ pasos, actual }) {
  return (
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${pasos.length}, minmax(0, 1fr))` }} aria-label="Pasos de la carga">
      {pasos.map((p, i) => {
        const estado = i < actual ? 'hecho' : i === actual ? 'actual' : 'pendiente'
        return (
          <li key={p} aria-current={estado === 'actual' ? 'step' : undefined} className="flex min-w-0 flex-col items-center gap-1.5 text-center sm:flex-row sm:text-left">
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
                estado === 'hecho' ? 'bg-ok text-white' : estado === 'actual' ? 'bg-brand-600 text-white shadow-[0_6px_14px_-6px_rgb(15_93_170/0.8)]' : 'bg-white/70 text-muted'
              }`}
            >
              {estado === 'hecho' ? <CheckCircle2 className="size-4" aria-hidden /> : i + 1}
            </span>
            <span className={`min-w-0 text-xs leading-tight sm:text-sm ${estado === 'actual' ? 'font-semibold text-ink' : 'text-muted'}`}>
              {p}
              <span className="sr-only">{estado === 'hecho' ? ' (completado)' : estado === 'actual' ? ' (paso actual)' : ' (pendiente)'}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
