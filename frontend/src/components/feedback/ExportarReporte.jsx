import { Download, FileDown } from 'lucide-react'
import { useState } from 'react'
import { descargar } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useFiltros } from '../../context/FiltrosContext'
import { useToast } from '../../context/ToastContext'
import { periodoLargo } from '../../utils/format'
import { GlassButton } from '../glass/Glass'
import { GlassModal } from '../glass/Overlay'
import { Segmentado } from '../layout/Pildora'

const TIPOS = [
  { valor: 'socios', etiqueta: 'Socios' },
  { valor: 'creditos', etiqueta: 'Créditos' },
  { valor: 'pagos_atrasados', etiqueta: 'Pagos atrasados' },
  { valor: 'clasificacion', etiqueta: 'Clasificación' },
]

/** Acción primaria de la barra superior: «+ Exportar (PDF/CSV)» con los filtros vigentes de la pantalla. */
export function BotonExportar({ tipoInicial = 'creditos' }) {
  const { puede } = useAuth()
  const { periodo, seleccion } = useFiltros()
  const toast = useToast()
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState(tipoInicial)
  const [formato, setFormato] = useState('pdf')
  const [cargando, setCargando] = useState(false)
  if (!puede('reportes.generar')) return null
  const generar = async () => {
    setCargando(true)
    try {
      await descargar('/reportes/', { method: 'POST', body: { tipo, formato, periodo, nivel: seleccion.nivelHijo, padre: seleccion.zonaId } })
      toast.exito('Reporte generado y descargado.')
      setAbierto(false)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setCargando(false)
    }
  }
  return (
    <>
      <GlassButton variante="acento" icono={FileDown} onClick={() => setAbierto(true)} redondo className="px-5">
        <span className="hidden lg:inline">+ Exportar (PDF/CSV)</span>
        <span className="lg:hidden">Exportar</span>
      </GlassButton>
      <GlassModal
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo="Exportar reporte"
        descripcion={`Período ${periodoLargo(periodo)} · nivel ${seleccion.nivelHijo}. Solo incluye información de su ámbito.`}
        pie={
          <>
            <GlassButton onClick={() => setAbierto(false)}>Cancelar</GlassButton>
            <GlassButton variante="primario" icono={Download} cargando={cargando} onClick={generar} data-autofocus>
              Descargar
            </GlassButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink-2">Tipo de reporte</span>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS.map((t) => (
                <button key={t.valor} type="button" onClick={() => setTipo(t.valor)} aria-pressed={tipo === t.valor} className={`press min-h-11 rounded-control px-3 text-sm ${tipo === t.valor ? 'bg-white font-semibold text-brand-700 shadow' : 'glass-control text-ink-2'}`}>
                  {t.etiqueta}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink-2">Formato</span>
            <Segmentado etiqueta="Formato" valor={formato} alCambiar={setFormato} opciones={[{ valor: 'pdf', etiqueta: 'PDF' }, { valor: 'csv', etiqueta: 'CSV' }]} />
          </div>
        </div>
      </GlassModal>
    </>
  )
}
