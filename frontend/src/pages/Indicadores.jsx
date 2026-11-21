import { ArrowDownWideNarrow, ArrowUpNarrowWide, CalendarClock, Filter, FilterX, Inbox } from 'lucide-react'
import { useState } from 'react'
import { Campo } from '../components/analisis/Partes'
import { CLASE_CONTROL, TIPOS_ZONA } from '../components/analisis/formatos'
import { EmptyState, EtiquetaProvisional, InsigniaDemo } from '../components/feedback/Estados'
import { BotonExportar } from '../components/feedback/ExportarReporte'
import { Chip, GlassButton, GlassPanel } from '../components/glass/Glass'
import { Ensamblado, EncabezadoPagina } from '../components/layout/Ensamblado'
import { PildoraSelect, Segmentado } from '../components/layout/Pildora'
import { DataTable, LoadMoreFooter } from '../components/tables/DataTable'
import { useBarraSuperior, useFiltros } from '../context/FiltrosContext'
import { analiticaApi } from '../features/analitica/api'
import { useCursorList, useDebounce } from '../hooks/useApi'
import { INDICADORES, fmtFecha, fmtFechaHora, fmtIndicador, periodoLargo } from '../utils/format'

const NIVELES = [
  { valor: 'barrio', etiqueta: 'Barrios' },
  { valor: 'parroquia', etiqueta: 'Parroquias' },
  { valor: 'canton', etiqueta: 'Cantones' },
]
// Títulos cortos de columna (el detalle completo está en INDICADORES)
const COLUMNAS = [
  ['total_socios', 'Socios'],
  ['total_creditos', 'Créditos'],
  ['monto_cartera', 'Cartera'],
  ['creditos_atrasados', 'Atrasados'],
  ['saldo_vencido', 'Saldo vencido'],
  ['tasa_morosidad', 'Morosidad'],
  ['penetracion_pct', 'Penetración'],
]
const CAMPOS = Object.entries(INDICADORES).map(([valor, d]) => ({ valor, etiqueta: d.etiqueta }))
const ORDENES = [{ valor: 'nombre', etiqueta: 'Nombre de zona' }, ...CAMPOS]
const VACIA = { items: [], next_cursor: null, has_more: false, total_count: 0 }

const normalizarNumero = (t) => t.trim().replace(',', '.')
const esNumero = (t) => /^-?\d+(\.\d+)?$/.test(t)

export default function Indicadores() {
  const { periodo, seleccion, opciones } = useFiltros()
  useBarraSuperior({ geo: true, periodo: true, accion: BotonExportar }, [])
  const [nivel, setNivel] = useState('barrio')
  const [orden, setOrden] = useState({ campo: 'nombre', desc: false })
  const [filtroCampo, setFiltroCampo] = useState('tasa_morosidad')
  const [filtroTexto, setFiltroTexto] = useState('')
  const [meta, setMeta] = useState(null)

  // El mínimo se valida al escribir y se aplica con un breve retardo (sin una petición por tecla)
  const textoVivo = normalizarNumero(filtroTexto)
  const errorFiltro = textoVivo !== '' && !esNumero(textoVivo) ? 'Ingrese un número (use coma o punto para los decimales).' : null
  const textoAplicado = normalizarNumero(useDebounce(filtroTexto, 400))
  const filtroMin = textoAplicado !== '' && esNumero(textoAplicado) ? textoAplicado : null
  const campoAplicado = filtroMin ? filtroCampo : null

  const lista = useCursorList(
    ({ cursor, signal }) =>
      periodo
        ? analiticaApi
            .indicadores(
              { periodo, nivel, padre: seleccion.zonaId, orden: orden.campo, desc: orden.desc ? 1 : undefined, filtro_campo: campoAplicado || undefined, filtro_min: filtroMin || undefined, cursor },
              signal,
            )
            .then((p) => {
              if (!cursor) setMeta({ ultima: p.ultima_carga_at, periodo: p.periodo })
              // La fila se identifica por su zona (evita duplicados al agregar páginas)
              return { ...p, items: p.items.map((i) => ({ ...i, id: i.zona.id })) }
            })
        : Promise.resolve(VACIA),
    [periodo, nivel, seleccion.zonaId, orden.campo, orden.desc, campoAplicado, filtroMin],
  )
  const cargando = !periodo || lista.cargando

  const alOrdenar = (campo) => setOrden((o) => (o.campo === campo ? { campo, desc: !o.desc } : { campo, desc: campo !== 'nombre' }))
  const limpiarFiltro = () => setFiltroTexto('')
  const zonaPadre = seleccion.zonaId ? opciones[seleccion.nivelZona]?.find((z) => z.id === seleccion.zonaId) : null
  const etiquetaNivel = NIVELES.find((n) => n.valor === nivel)?.etiqueta

  const columnas = [
    {
      clave: 'nombre',
      titulo: 'Zona',
      movil: 'titulo',
      ordenable: true,
      render: (f) => (
        <span className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-2 font-semibold text-ink">
            {f.zona.nombre}
            {f.sin_datos && <Chip tono="ambar">Sin datos</Chip>}
          </span>
          <span className="text-xs font-normal text-muted">
            {f.zona.codigo} · {TIPOS_ZONA[f.zona.tipo_zona]}
          </span>
        </span>
      ),
    },
    ...COLUMNAS.map(([clave, titulo]) => ({ clave, titulo, alinear: 'derecha', ordenable: true, render: (f) => fmtIndicador(clave, f.indicadores?.[clave]) })),
    { clave: 'ultima_carga_at', titulo: 'Última carga', render: (f) => <span className="whitespace-nowrap text-muted">{fmtFecha(f.ultima_carga_at)}</span> },
  ]

  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina
        titulo="Indicadores por zona"
        subtitulo={`${etiquetaNivel} · ${periodoLargo(periodo)}${zonaPadre ? ` · dentro de ${zonaPadre.nombre}` : ''}`}
        insignias={
          <>
            <EtiquetaProvisional />
            <InsigniaDemo />
          </>
        }
        extra={<Segmentado etiqueta="Nivel geográfico" valor={nivel} alCambiar={setNivel} opciones={NIVELES} />}
      />

      <GlassPanel className="flex flex-col gap-4 p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Filter className="size-4 text-brand-600" aria-hidden /> Mostrar solo zonas con un mínimo
            </p>
            <div className="flex flex-wrap items-start gap-2">
              <PildoraSelect prefijo="Indicador" etiquetaAccesible="Indicador del filtro mínimo" valor={filtroCampo} opciones={CAMPOS} alCambiar={setFiltroCampo} todos={null} ancho={280} />
              <Campo etiqueta={`Valor mínimo de ${INDICADORES[filtroCampo].etiqueta.toLowerCase()}`} oculta error={errorFiltro} className="w-40">
                {(a11y) => (
                  <input
                    {...a11y}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Mínimo"
                    value={filtroTexto}
                    onChange={(e) => setFiltroTexto(e.target.value)}
                    className={`${CLASE_CONTROL} rounded-full`}
                  />
                )}
              </Campo>
              {filtroTexto && (
                <GlassButton icono={FilterX} variante="fantasma" onClick={limpiarFiltro} redondo>
                  Quitar filtro
                </GlassButton>
              )}
            </div>
          </div>
          {/* En móvil las filas son tarjetas: el orden se elige aquí */}
          <div className="flex flex-wrap items-center gap-2 md:hidden">
            <PildoraSelect prefijo="Ordenar" etiquetaAccesible="Ordenar por" valor={orden.campo} opciones={ORDENES} alCambiar={(c) => setOrden({ campo: c, desc: c !== 'nombre' })} todos={null} />
            <GlassButton
              icono={orden.desc ? ArrowDownWideNarrow : ArrowUpNarrowWide}
              onClick={() => setOrden((o) => ({ ...o, desc: !o.desc }))}
              redondo
              aria-label={orden.desc ? 'Orden descendente; cambiar a ascendente' : 'Orden ascendente; cambiar a descendente'}
            >
              {orden.desc ? 'Mayor a menor' : 'Menor a mayor'}
            </GlassButton>
          </div>
          <p className="flex items-center gap-2 text-sm text-muted" role="status">
            <CalendarClock className="size-4 shrink-0" aria-hidden />
            Última carga del período: <span className="font-semibold text-ink-2">{meta ? fmtFechaHora(meta.ultima) : '—'}</span>
          </p>
        </div>

        <div className="glass-inset -mx-1 rounded-card p-1 md:p-2">
          <DataTable
            etiqueta={`Indicadores por ${etiquetaNivel.toLowerCase()}`}
            columnas={columnas}
            filas={lista.items}
            cargando={cargando}
            error={lista.error}
            alReintentar={lista.recargar}
            orden={orden}
            alOrdenar={alOrdenar}
            vacio={
              filtroMin ? (
                <EmptyState
                  icono={FilterX}
                  titulo="Ninguna zona alcanza el mínimo"
                  texto={`No hay zonas con ${INDICADORES[filtroCampo].etiqueta.toLowerCase()} mayor o igual a ${fmtIndicador(filtroCampo, filtroMin)} en ${periodoLargo(periodo)}.`}
                  accion={<GlassButton icono={FilterX} onClick={limpiarFiltro}>Quitar filtro</GlassButton>}
                />
              ) : (
                <EmptyState icono={Inbox} titulo="Sin zonas para mostrar" texto="No hay zonas de este nivel en su ámbito o en la zona elegida en la barra superior. Pruebe con otro nivel geográfico." />
              )
            }
          />
          {!cargando && !lista.error && (
            <LoadMoreFooter mostrando={lista.items.length} total={lista.total} hayMas={lista.hasMore} cargando={lista.cargandoMas} alVerMas={lista.verMas} />
          )}
        </div>
        <p className="px-1 text-xs text-muted">«Sin datos» indica que la zona no tiene información en el período; no equivale a cero. Las zonas sin dato del indicador ordenado se listan al final.</p>
      </GlassPanel>
    </Ensamblado>
  )
}
