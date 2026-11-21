import { Bell, CalendarDays, ChevronDown, LogOut, MapPin, SlidersHorizontal, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useFiltros } from '../../context/FiltrosContext'
import { useMediaQuery } from '../../hooks/useApi'
import { useOffline } from '../../offline/OfflineContext'
import { IndicadorConexion } from '../offline/Conexion'
import { useSpecularHover } from '../../hooks/useSpecularHover'
import { fmtFecha, iniciales, periodoCorto } from '../../utils/format'
import { IconButton } from '../glass/Glass'
import { GlassModal, GlassPopover } from '../glass/Overlay'
import { PildoraSelect } from './Pildora'

const GEO = [
  ['provincia', 'Prov'],
  ['canton', 'Cantón'],
  ['parroquia', 'Pq.'],
  ['barrio', 'Barrio'],
]

function FiltrosGeo({ apilados = false }) {
  const { geo, elegir, hijosDe } = useFiltros()
  return GEO.map(([nivel, prefijo]) => {
    const ops = hijosDe(nivel).map((z) => ({ valor: z.id, etiqueta: z.nombre }))
    const etiquetaNivel = { provincia: 'Provincia', canton: 'Cantón', parroquia: 'Parroquia', barrio: 'Barrio o sector' }[nivel]
    return (
      <div key={nivel} className={apilados ? 'flex flex-col gap-1' : 'contents'}>
        {apilados && <span className="text-xs font-semibold text-muted">{etiquetaNivel}</span>}
        <PildoraSelect prefijo={apilados ? null : prefijo} etiquetaAccesible={etiquetaNivel} valor={geo[nivel]} opciones={ops} alCambiar={(v) => elegir(nivel, v)} deshabilitada={!ops.length} />
      </div>
    )
  })
}

function FiltroPeriodo() {
  const { periodos, periodo, setPeriodo } = useFiltros()
  const ops = [...periodos.items].reverse().map((p) => ({ valor: p, etiqueta: periodoCorto(p) }))
  return <PildoraSelect icono={CalendarDays} etiquetaAccesible="Período (mes)" valor={periodo} opciones={ops} alCambiar={setPeriodo} todos={null} ancho={200} />
}

function Notificaciones() {
  const { puede } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const [avisos, setAvisos] = useState([])
  const ancla = useRef(null)
  useEffect(() => {
    const ctrl = new AbortController()
    const tareas = []
    if (puede('datos.validar'))
      tareas.push(
        api.get('/observados/resumen/', { signal: ctrl.signal, cacheTtl: 60000 }).then((r) => (r.por_estado?.pendiente ? [{ texto: `${r.por_estado.pendiente} registros observados pendientes de depuración`, to: '/datos/observados' }] : [])),
      )
    if (puede('criterios.aprobar'))
      tareas.push(
        api.get('/criterios/', { signal: ctrl.signal, cacheTtl: 60000 }).then((r) => {
          const n = r.items.filter((v) => v.estado === 'pendiente').length
          return n ? [{ texto: `${n} versión(es) de criterios pendientes de aprobación`, to: '/criterios' }] : []
        }),
      )
    Promise.allSettled(tareas).then((rs) => {
      if (!ctrl.signal.aborted) setAvisos(rs.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])))
    })
    return () => ctrl.abort()
  }, [puede])
  return (
    <>
      <span ref={ancla} className="relative">
        <IconButton icono={Bell} etiqueta={`Avisos (${avisos.length})`} onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} />
        {avisos.length > 0 && <span className="pointer-events-none absolute top-2 right-2 size-2.5 rounded-full bg-warn ring-2 ring-white" aria-hidden />}
      </span>
      <GlassPopover abierto={abierto} alCerrar={() => setAbierto(false)} ancla={ancla} ancho={300} alinear="fin" etiqueta="Avisos">
        <p className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Avisos</p>
        {avisos.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted">No hay avisos pendientes.</p>
        ) : (
          avisos.map((a) => (
            <Link key={a.to} to={a.to} onClick={() => setAbierto(false)} className="press block rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-white/70">
              {a.texto}
            </Link>
          ))
        )}
      </GlassPopover>
    </>
  )
}

function MenuPerfil({ compacto }) {
  const { usuario } = useAuth()
  const { cerrarSesion } = useOffline()
  const [abierto, setAbierto] = useState(false)
  const ancla = useRef(null)
  const spec = useSpecularHover()
  const ambito = usuario.agencia ? usuario.agencia.nombre : 'Toda la cooperativa'
  return (
    <>
      <button
        ref={(el) => {
          ancla.current = el
          return spec(el)
        }}
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label={`Perfil de ${usuario.nombre_completo}`}
        className="press specular glass-control flex h-12 max-w-[13rem] items-center gap-2.5 rounded-full p-1 pr-3"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-b from-brand-50 to-brand-100 text-sm font-bold text-brand-700">{iniciales(usuario.nombre_completo)}</span>
        {!compacto && (
          <span className="min-w-0 text-left leading-tight">
            <span className="block truncate text-sm font-semibold text-ink">{usuario.nombre_completo}</span>
            <span className="block truncate text-xs text-muted">{usuario.cargo || usuario.rol.nombre} · {usuario.agencia?.nombre || 'Cooperativa'}</span>
          </span>
        )}
        {!compacto && <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />}
      </button>
      <GlassPopover abierto={abierto} alCerrar={() => setAbierto(false)} ancla={ancla} ancho={280} alinear="fin" etiqueta="Menú de perfil">
        <div className="px-3 pt-2 pb-3">
          <p className="font-semibold text-ink">{usuario.nombre_completo}</p>
          <p className="text-xs text-muted">{usuario.rol.nombre}</p>
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
            <MapPin className="size-3" aria-hidden /> Ámbito: {ambito}
          </p>
        </div>
        <div role="menu" className="flex flex-col gap-0.5 border-t border-white/70 pt-1">
          <Link role="menuitem" to="/perfil" onClick={() => setAbierto(false)} className="press flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm hover:bg-white/70">
            <UserRound className="size-4" aria-hidden /> Mi perfil y sesión
          </Link>
          <button role="menuitem" type="button" onClick={() => {
              setAbierto(false)
              cerrarSesion()
            }} className="press flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-sm text-danger-ink hover:bg-white/70">
            <LogOut className="size-4" aria-hidden /> Cerrar sesión
          </button>
        </div>
      </GlassPopover>
    </>
  )
}

export function TopGlassBar() {
  const { barra, periodos } = useFiltros()
  const escritorio = useMediaQuery('(min-width: 1280px)')
  const tablet = useMediaQuery('(min-width: 768px)')
  const amplio = useMediaQuery('(min-width: 1536px)')
  const [hoja, setHoja] = useState(false)
  const hayFiltros = barra.geo || barra.periodo || barra.extra
  const Accion = barra.accion

  return (
    <header className="no-print fixed inset-x-3 top-[calc(10px+var(--safe-top))] z-40 md:inset-x-4 md:top-4">
      <div className="glass-bar flex h-[64px] items-center gap-2 rounded-panel pr-2 pl-3 md:h-[var(--bar-h)] md:gap-3 md:pr-3 md:pl-4">
        <Link to="/panel" className="flex min-w-0 shrink-0 items-center gap-3 rounded-2xl" aria-label="Ir al panel">
          <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-white shadow-[0_6px_16px_-8px_rgb(16_34_61/0.4)]">
            <img src="/logo-icono.png" alt="" className="h-9 w-9 object-contain"/>
          </span>
          <span className="hidden min-w-0 leading-tight sm:block">
            <span className="block truncate text-[15px] font-bold tracking-[-0.02em] text-ink">COAC Padre Julián Lorente</span>
            <span className="flex items-center gap-1.5 truncate text-xs text-muted">
              <span className="size-2 rounded-full bg-brand-500" aria-hidden />
              Última carga: {periodos.ultima_carga_at ? fmtFecha(periodos.ultima_carga_at) : 'sin cargas'}
            </span>
          </span>
        </Link>

        <div className="no-scrollbar flex min-w-0 flex-1 items-center justify-center-safe gap-2 overflow-x-auto px-1">
          {escritorio && hayFiltros && (
            <>
              {barra.geo && <FiltrosGeo />}
              {barra.periodo && <FiltroPeriodo />}
              {barra.extra}
            </>
          )}
        </div>

        {!escritorio && hayFiltros && (
          <button type="button" onClick={() => setHoja(true)} className="press glass-control flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold" aria-label="Abrir filtros">
            <SlidersHorizontal className="size-4 text-brand-600" aria-hidden />
            <span className="hidden sm:inline">Filtros</span>
          </button>
        )}
        {Accion && tablet && <Accion />}
        <IndicadorConexion />
        {tablet && <Notificaciones />}
        <MenuPerfil compacto={!amplio} />
      </div>

      <GlassModal abierto={hoja} alCerrar={() => setHoja(false)} titulo="Filtros" descripcion="Se aplican a la pantalla actual.">
        <div className="flex flex-col gap-4 pb-2">
          {barra.geo && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FiltrosGeo apilados />
            </div>
          )}
          {barra.periodo && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-muted">Período (mes)</span>
              <FiltroPeriodo />
            </div>
          )}
          {barra.extra && <div className="flex flex-wrap gap-2">{barra.extra}</div>}
          {Accion && !tablet && <Accion />}
        </div>
      </GlassModal>
    </header>
  )
}
