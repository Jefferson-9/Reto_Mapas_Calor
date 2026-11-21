import { LogOut, ShieldCheck } from 'lucide-react'
import { Chip, GlassButton, GlassPanel } from '../components/glass/Glass'
import { Ensamblado, EncabezadoPagina } from '../components/layout/Ensamblado'
import { useAuth } from '../context/AuthContext'
import { useBarraSuperior } from '../context/FiltrosContext'
import { useOffline } from '../offline/OfflineContext'
import { fmtFechaHora, iniciales } from '../utils/format'

export default function Perfil() {
  const { usuario, parametros, autenticadoEn } = useAuth()
  const offline = useOffline()
  useBarraSuperior({}, [])
  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina titulo="Mi perfil y sesión" subtitulo="Datos de su cuenta, rol y ámbito de responsabilidad" />
      <div className="grid grid-cols-1 gap-[var(--gap)] lg:grid-cols-3">
        <GlassPanel className="flex flex-col items-center gap-3 p-6 text-center">
          <span className="grid size-20 place-items-center rounded-full bg-gradient-to-b from-brand-50 to-brand-100 text-2xl font-bold text-brand-700">{iniciales(usuario.nombre_completo)}</span>
          <div>
            <h2 className="text-xl font-bold">{usuario.nombre_completo}</h2>
            <p className="text-sm text-muted">@{usuario.username}</p>
          </div>
          <Chip tono="azul">{usuario.rol.nombre}</Chip>
          <p className="text-sm text-ink-2">{usuario.cargo}</p>
          <GlassButton icono={LogOut} variante="peligro" onClick={offline.cerrarSesion} className="mt-2">
            Cerrar sesión
          </GlassButton>
        </GlassPanel>
        <GlassPanel className="p-6 lg:col-span-2">
          <h2 className="text-lg font-bold">Ámbito y sesión</h2>
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="glass-inset rounded-card p-4">
              <dt className="text-xs text-muted">Ámbito de datos</dt>
              <dd className="font-semibold">{usuario.agencia ? usuario.agencia.nombre : 'Toda la cooperativa'}</dd>
            </div>
            <div className="glass-inset rounded-card p-4">
              <dt className="text-xs text-muted">Cierre por inactividad</dt>
              <dd className="font-semibold">{parametros?.minutos_inactividad_sesion ?? '—'} minutos</dd>
            </div>
            {offline.habilitado && (
              <div className="glass-inset rounded-card p-4 sm:col-span-2">
                <dt className="text-xs text-muted">Modo campo sin conexión</dt>
                <dd className="font-semibold">
                  Puede trabajar sin conexión hasta {autenticadoEn ? fmtFechaHora(new Date(autenticadoEn + (parametros?.horas_ventana_offline || 24) * 3600000).toISOString()) : '—'} ({parametros?.horas_ventana_offline || 24} h desde su último acceso en línea).
                </dd>
                <dd className="mt-1 text-xs text-muted">Al cerrar sesión se borra todo lo guardado en este dispositivo. Sin una visita previa con conexión no hay nada guardado; el modo incógnito o borrar los datos del navegador lo eliminan.</dd>
              </div>
            )}
          </dl>
          <h3 className="mt-6 flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-4 text-ok" aria-hidden /> Permisos de su rol ({usuario.permisos.length})
          </h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {usuario.permisos.map((p) => (
              <li key={p}>
                <Chip>{p}</Chip>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">La autorización se valida en el servidor en cada solicitud. Si un administrador cambia su rol o ámbito, los nuevos permisos rigen desde su siguiente acceso.</p>
        </GlassPanel>
      </div>
    </Ensamblado>
  )
}
