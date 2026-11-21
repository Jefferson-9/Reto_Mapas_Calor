import { CircleAlert, CloudOff, CloudUpload, Pencil, RefreshCw, RotateCcw, Trash2, WifiOff } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useOffline } from '../../offline/OfflineContext'
import { fmtFechaHora } from '../../utils/format'
import { ConfirmDialog, EmptyState } from '../feedback/Estados'
import { Chip, GlassButton } from '../glass/Glass'
import { GlassModal } from '../glass/Overlay'

const ESTADO = {
  pendiente: { tono: 'ambar', texto: 'Pendiente' },
  enviando: { tono: 'azul', texto: 'Enviando…' },
  sincronizado: { tono: 'verde', texto: 'Sincronizado' },
  rechazado: { tono: 'rojo', texto: 'Rechazado' },
}
const TIPO = { prospecto: 'Posible socio', ruta: 'Ruta', visita: 'Visita' }

/** Insignia de estado de un elemento de la cola de salida. */
export function EstadoCola({ estado, error, className = '' }) {
  const e = ESTADO[estado] || ESTADO.pendiente
  return (
    <Chip tono={e.tono} className={className} title={error?.mensaje || undefined}>
      {e.texto}
    </Chip>
  )
}

/** Indicador global en la barra: «Sin conexión» / «Sincronizando…» / «N pendientes» / «N rechazados». */
export function IndicadorConexion() {
  const o = useOffline()
  if (!o || (!o.habilitado && !o.sinConexion && !o.items.length)) return null
  const n = o.pendientes.length
  const r = o.rechazados.length
  let texto = null
  let Icono = CloudUpload
  let tono = 'glass-control text-ink-2'
  if (o.sinRed || o.sinConexion) {
    texto = n ? `Sin conexión · ${n}` : 'Sin conexión'
    Icono = WifiOff
    tono = 'bg-sun-100 text-sun-700 ring-1 ring-sun-400/40'
  } else if (o.sincronizando) {
    texto = 'Sincronizando…'
    Icono = RefreshCw
  } else if (r) {
    texto = `${r} ${r === 1 ? 'rechazado' : 'rechazados'}`
    Icono = CircleAlert
    tono = 'bg-[#fbe9e5] text-danger-ink ring-1 ring-danger/20'
  } else if (n) {
    texto = `${n} ${n === 1 ? 'pendiente' : 'pendientes'}`
  }
  if (!texto) return null
  return (
    <button type="button" onClick={o.abrirPanel} className={`press flex h-11 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-semibold ${tono}`} aria-haspopup="dialog" aria-label={`Estado de sincronización: ${texto}. Abrir pendientes`}>
      <Icono className={`size-4 ${o.sincronizando ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden />
      <span role="status" aria-live="polite">
        {texto}
      </span>
    </button>
  )
}

const tituloDe = (i) => (i.tipo === 'prospecto' ? i.datos.nombre_negocio : i.tipo === 'ruta' ? i.datos.nombre : `Visita del ${i.datos.fecha_visita}`)

function FilaCola({ item, alCorregir }) {
  const o = useOffline()
  return (
    <li className="glass-inset flex flex-col gap-2 rounded-card p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-muted">{TIPO[item.tipo]}</span>
          <span className="block truncate font-semibold text-ink">{tituloDe(item)}</span>
          <span className="block text-xs text-muted">Registrado en el dispositivo: {fmtFechaHora(item.client_created_at)}</span>
        </span>
        <EstadoCola estado={item.estado} error={item.error} />
      </div>
      {item.estado === 'rechazado' && item.error && (
        <div className="rounded-2xl bg-[#fbe9e5] px-3 py-2 text-sm text-danger-ink" role="note">
          <p className="font-semibold">{item.error.mensaje}</p>
          {item.error.detalles?.length > 0 && <p className="mt-0.5 text-xs">{item.error.detalles.map((d) => d.mensaje).join(' · ')}</p>}
        </div>
      )}
      {item.estado === 'pendiente' && item.error && <p className="text-xs text-muted">{typeof item.error === 'string' ? item.error : item.error.mensaje} Intentos: {item.intentos}.</p>}
      {item.estado === 'rechazado' && (
        <div className="flex flex-wrap gap-2">
          {item.tipo === 'prospecto' && (
            <GlassButton tam="sm" variante="primario" icono={Pencil} onClick={() => alCorregir(item)}>
              Corregir
            </GlassButton>
          )}
          <GlassButton tam="sm" icono={RotateCcw} onClick={() => o.reintentar(item.client_uuid)} disabled={!o.enLinea}>
            Reintentar
          </GlassButton>
          <GlassButton tam="sm" variante="fantasma" icono={Trash2} className="text-danger-ink" onClick={() => o.descartar(item.client_uuid)}>
            Descartar
          </GlassButton>
        </div>
      )}
    </li>
  )
}

/** Panel de pendientes y rechazados, con «Sincronizar ahora». */
function PanelPendientes() {
  const o = useOffline()
  const navigate = useNavigate()
  // Los sincronizados se muestran solo si llegaron en la última sincronización de esta sesión
  const visibles = o.items.filter((i) => i.estado !== 'sincronizado' || (o.ultimaSync && (i.sincronizado_en || 0) >= o.ultimaSync - 60_000))
  const corregir = (item) => {
    o.cerrarPanel()
    navigate('/prospectos', { state: { corregir: item } })
  }
  return (
    <GlassModal
      abierto={o.panelAbierto}
      alCerrar={o.cerrarPanel}
      titulo="Registros sin conexión"
      descripcion={o.sinRed || o.sinConexion ? 'Sin conexión: se enviarán automáticamente al recuperarla (con la aplicación abierta).' : 'Se envían en orden; un rechazo no detiene a los demás.'}
      pie={
        <GlassButton variante="primario" icono={RefreshCw} onClick={() => o.sincronizar({ forzar: true })} cargando={o.sincronizando} disabled={!o.enLinea}>
          {o.enLinea ? 'Sincronizar ahora' : 'Requiere conexión'}
        </GlassButton>
      }
    >
      {visibles.length === 0 ? (
        <EmptyState icono={CloudOff} titulo="Nada pendiente" texto="Todo lo registrado en este dispositivo ya está en el servidor." />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Cola de salida">
          {visibles.map((i) => (
            <FilaCola key={i.client_uuid} item={i} alCorregir={corregir} />
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">
        {o.paquete ? `Datos de consulta guardados el ${fmtFechaHora(o.paquete.generado_en)}; vencen el ${fmtFechaHora(o.paquete.vence_en)}.` : 'Aún no hay datos de consulta guardados en este dispositivo.'}
        {o.ultimaSync ? ` Última sincronización: ${fmtFechaHora(new Date(o.ultimaSync).toISOString())}.` : ''} Sincronice antes de dejar de usar la aplicación: en iPhone/iPad (Safari) el navegador puede borrar los datos locales tras varios días sin uso.
      </p>
    </GlassModal>
  )
}

/** Modales del modo campo (dentro del router): panel de pendientes y confirmación de cierre con pendientes. */
export function CapaOffline() {
  const o = useOffline()
  if (!o) return null
  const n = o.pendientes.length + o.rechazados.length
  return (
    <>
      <PanelPendientes />
      <ConfirmDialog
        abierto={o.confirmarCierre}
        alCerrar={o.cancelarCierre}
        alConfirmar={o.cerrarYBorrar}
        peligro
        titulo="Hay registros sin sincronizar"
        texto={`Este dispositivo tiene ${n} ${n === 1 ? 'registro que aún no llegó' : 'registros que aún no llegaron'} al servidor. Al cerrar sesión se borra todo lo guardado localmente y ${n === 1 ? 'se perderá' : 'se perderán'}.`}
        confirmar="Cerrar sesión y borrar"
      >
        {o.enLinea && (
          <GlassButton
            icono={RefreshCw}
            onClick={() => {
              o.cancelarCierre()
              o.sincronizar({ forzar: true })
            }}
          >
            Sincronizar primero
          </GlassButton>
        )}
      </ConfirmDialog>
    </>
  )
}

/** Estado para pantallas que no funcionan sin conexión (sección 20.1, punto 4). */
export function RequiereConexion() {
  return <EmptyState icono={WifiOff} titulo="Requiere conexión" texto="Esta sección necesita internet. Sin conexión puede consultar Mis zonas y Rutas, y registrar posibles socios, rutas nuevas y visitas (si están habilitadas)." />
}
