import { ChevronDown, FilterX, Fingerprint, History as IconoHistorial, ShieldCheck, ShieldX } from 'lucide-react'
import { useState } from 'react'
import { Aviso, EncabezadoSeccion, ValorJSON } from '../components/admin/Bloques'
import { FiltroSelect, FiltroTexto } from '../components/admin/Campos'
import { humanizar } from '../components/admin/formulario'
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/Estados'
import { Chip, GlassButton, GlassPanel } from '../components/glass/Glass'
import { Ensamblado, EncabezadoPagina } from '../components/layout/Ensamblado'
import { LoadMoreFooter } from '../components/tables/DataTable'
import { useBarraSuperior } from '../context/FiltrosContext'
import { CATEGORIAS_HISTORIAL, adminApi } from '../features/admin/api'
import { useApi, useCursorList, useDebounce } from '../hooks/useApi'
import { fmtEntero, fmtFechaHora } from '../utils/format'

const TONO_CATEGORIA = { acceso: 'neutro', usuarios: 'azul', datos: 'verde', geografia: 'violeta', criterios: 'ambar', campo: 'azul', analisis: 'violeta', reportes: 'neutro', configuracion: 'ambar' }
const VACIOS = { desde: '', hasta: '', usuario: '', categoria: null, accion: null, entidad: '' }

export default function Historial() {
  useBarraSuperior({}, [])
  const [f, setF] = useState(VACIOS)
  const usuario = useDebounce(f.usuario.trim(), 300)
  const entidad = useDebounce(f.entidad.trim(), 300)
  const [verificacion, setVerificacion] = useState(null)
  const [verificando, setVerificando] = useState(false)
  const opciones = useApi((s) => adminApi.filtrosHistorial(s), [])
  const rangoInvalido = Boolean(f.desde && f.hasta && f.desde > f.hasta)
  const lista = useCursorList(
    ({ cursor, signal }) =>
      adminApi.historial({ desde: f.desde, hasta: rangoInvalido ? undefined : f.hasta, usuario, categoria: f.categoria, accion: f.accion, entidad, cursor }, signal),
    [f.desde, f.hasta, usuario, f.categoria, f.accion, entidad, rangoInvalido],
  )
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v ?? (typeof VACIOS[k] === 'string' ? '' : null) }))
  const hayFiltros = JSON.stringify(f) !== JSON.stringify(VACIOS)

  const verificar = async () => {
    setVerificando(true)
    try {
      setVerificacion(await adminApi.verificarHistorial())
    } catch (e) {
      setVerificacion({ error: e.message })
    } finally {
      setVerificando(false)
    }
  }

  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina
        titulo="Historial de cambios"
        subtitulo="Registro inmutable de accesos, cargas, cambios de configuración y decisiones. Solo lectura."
        extra={
          <GlassButton variante="primario" icono={ShieldCheck} cargando={verificando} onClick={verificar}>
            Verificar integridad
          </GlassButton>
        }
      />

      {verificacion &&
        (verificacion.error ? (
          <Aviso tono="error" rol="alert" titulo="No se pudo verificar la cadena">
            {verificacion.error}
          </Aviso>
        ) : verificacion.integra ? (
          <Aviso tono="ok" icono={ShieldCheck} titulo="Cadena íntegra">
            Se verificaron {fmtEntero(verificacion.total)} eventos: la secuencia y las huellas SHA-256 encadenadas son correctas.
          </Aviso>
        ) : (
          <Aviso tono="error" rol="alert" icono={ShieldX} titulo="La cadena del historial no es íntegra">
            {verificacion.motivo} (evento n.º {fmtEntero(verificacion.secuencia_error)} de {fmtEntero(verificacion.total)}). Informe al responsable de seguridad.
          </Aviso>
        ))}

      <GlassPanel className="p-5 md:p-6" aria-labelledby="titulo-filtros-historial">
        <EncabezadoSeccion
          id="titulo-filtros-historial"
          titulo="Filtros"
          extra={
            hayFiltros && (
              <GlassButton tam="sm" variante="fantasma" icono={FilterX} onClick={() => setF(VACIOS)}>
                Limpiar
              </GlassButton>
            )
          }
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <FiltroTexto id="h-desde" etiqueta="Desde" type="date" valor={f.desde} alCambiar={set('desde')} max={f.hasta || undefined} />
          <FiltroTexto id="h-hasta" etiqueta="Hasta" type="date" valor={f.hasta} alCambiar={set('hasta')} min={f.desde || undefined} aria-invalid={rangoInvalido || undefined} aria-describedby={rangoInvalido ? 'h-rango-err' : undefined} />
          <FiltroTexto id="h-usuario" etiqueta="Usuario" valor={f.usuario} alCambiar={set('usuario')} placeholder="Identificador exacto" autoCapitalize="none" spellCheck={false} />
          <FiltroSelect id="h-cat" etiqueta="Categoría" valor={f.categoria} alCambiar={set('categoria')} todos="Todas" opciones={(opciones.data?.categorias || Object.keys(CATEGORIAS_HISTORIAL)).map((c) => ({ valor: c, etiqueta: CATEGORIAS_HISTORIAL[c] || humanizar(c) }))} />
          <FiltroSelect id="h-accion" etiqueta="Tipo de acción" valor={f.accion} alCambiar={set('accion')} todos="Todas" opciones={(opciones.data?.acciones || []).map((a) => ({ valor: a, etiqueta: humanizar(a) }))} />
          <FiltroTexto id="h-entidad" etiqueta="Entidad" valor={f.entidad} alCambiar={set('entidad')} placeholder="Ej.: CargaDatos#12" spellCheck={false} />
        </div>
        {rangoInvalido && (
          <p id="h-rango-err" className="mt-2 text-xs font-medium text-danger-ink">
            La fecha «hasta» debe ser posterior a «desde».
          </p>
        )}
      </GlassPanel>

      <GlassPanel className="min-w-0 p-3 md:p-4" aria-labelledby="titulo-eventos">
        <div className="px-2 pt-2">
          <EncabezadoSeccion id="titulo-eventos" titulo="Eventos" subtitulo={lista.total != null ? `${fmtEntero(lista.total)} eventos con los filtros actuales, del más reciente al más antiguo` : 'Del más reciente al más antiguo'} />
        </div>
        {lista.cargando ? (
          <LoadingState filas={6} alto="h-20" />
        ) : lista.error ? (
          <ErrorState error={lista.error} alReintentar={lista.recargar} />
        ) : !lista.items.length ? (
          <EmptyState icono={IconoHistorial} titulo="Sin eventos" texto={hayFiltros ? 'No hay eventos con estos filtros. Amplíe el rango de fechas o limpie los filtros.' : 'Aún no hay eventos registrados.'} />
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Eventos del historial">
            {lista.items.map((e) => (
              <Evento key={e.id} e={e} />
            ))}
          </ul>
        )}
        <LoadMoreFooter mostrando={lista.items.length} total={lista.total} hayMas={lista.hasMore} cargando={lista.cargandoMas} alVerMas={lista.verMas} />
      </GlassPanel>
    </Ensamblado>
  )
}

function Evento({ e }) {
  const [abierto, setAbierto] = useState(false)
  const tieneValores = e.valor_anterior != null || e.valor_nuevo != null || (e.metadatos && Object.keys(e.metadatos).length > 0)
  const idDet = `ev-${e.id}-det`
  return (
    <li className="glass-inset rounded-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tono={TONO_CATEGORIA[e.categoria] || 'neutro'}>{CATEGORIAS_HISTORIAL[e.categoria] || e.categoria}</Chip>
            <span className="font-semibold text-ink">{humanizar(e.accion)}</span>
          </div>
          <p className="mt-1 text-sm break-words text-ink-2">{e.detalle || '—'}</p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
            <span>
              <time dateTime={e.fecha_hora}>{fmtFechaHora(e.fecha_hora)}</time>
            </span>
            <span>Responsable: {e.username || 'Sistema'}</span>
            <span className="break-all">Entidad: {e.entidad_afectada || '—'}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-row items-center justify-between gap-2 sm:flex-col sm:items-end">
          <span className="tnum inline-flex items-center gap-1 text-xs text-muted" title={`Huella SHA-256: ${e.hash}`}>
            <Fingerprint className="size-3.5" aria-hidden />#{e.secuencia} · <code>{e.hash?.slice(0, 10)}…</code>
          </span>
          {tieneValores && (
            <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} aria-controls={idDet} className="press inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-brand-700 hover:bg-white/70">
              {abierto ? 'Ocultar valores' : 'Ver valores'}
              <ChevronDown className={`size-4 transition-transform ${abierto ? 'rotate-180' : ''}`} aria-hidden />
            </button>
          )}
        </div>
      </div>
      {abierto && (
        <div id={idDet} className="mt-3 grid grid-cols-1 gap-3 border-t border-white/80 pt-3 lg:grid-cols-2">
          <section className="min-w-0 rounded-2xl bg-white/50 p-3">
            <h3 className="mb-1.5 text-xs font-bold tracking-wide text-muted uppercase">Valor anterior</h3>
            <ValorJSON valor={e.valor_anterior} />
          </section>
          <section className="min-w-0 rounded-2xl bg-white/50 p-3">
            <h3 className="mb-1.5 text-xs font-bold tracking-wide text-muted uppercase">Valor nuevo</h3>
            <ValorJSON valor={e.valor_nuevo} />
          </section>
          {e.metadatos && Object.keys(e.metadatos).length > 0 && (
            <section className="min-w-0 rounded-2xl bg-white/50 p-3 lg:col-span-2">
              <h3 className="mb-1.5 text-xs font-bold tracking-wide text-muted uppercase">Metadatos</h3>
              <ValorJSON valor={e.metadatos} />
            </section>
          )}
          <p className="text-xs break-all text-muted lg:col-span-2">
            Huella: <code>{e.hash}</code> · anterior: <code>{e.prev_hash?.slice(0, 16)}…</code>
            {e.correlation_id && (
              <>
                {' '}
                · correlación: <code>{e.correlation_id}</code>
              </>
            )}
          </p>
        </div>
      )}
    </li>
  )
}
