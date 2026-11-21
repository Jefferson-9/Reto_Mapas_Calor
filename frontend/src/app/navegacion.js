import {
  BarChart3,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  FileText,
  GitCompareArrows,
  History,
  LayoutDashboard,
  Map as MapIcon,
  MapPinned,
  Route as RouteIcon,
  ScanSearch,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Target,
  Users,
  Workflow,
  Layers,
  UserCheck,
} from 'lucide-react'

// Cada destino declara los permisos que lo habilitan (también se validan en el servidor)
// y, si es condicionado, el interruptor institucional que lo activa.
export const GRUPOS = [
  {
    grupo: 'Análisis',
    items: [
      { to: '/panel', etiqueta: 'Panel', icono: LayoutDashboard, permisos: ['panel.ver'], principal: true },
      { to: '/mapa', etiqueta: 'Mapa y calor', icono: MapIcon, permisos: ['mapa.ver'], principal: true },
      { to: '/indicadores', etiqueta: 'Indicadores', icono: Table2, permisos: ['indicadores.ver'], principal: true },
      { to: '/comparar', etiqueta: 'Evolución', icono: GitCompareArrows, permisos: ['comparar.ver'] },
    ],
  },
  {
    grupo: 'Clasificación',
    items: [
      { to: '/clasificacion', etiqueta: 'Clasificación', icono: Layers, permisos: ['clasificacion.ver'], principal: true },
      { to: '/criterios', etiqueta: 'Criterios', icono: SlidersHorizontal, permisos: ['criterios.definir', 'criterios.aprobar'] },
    ],
  },
  {
    grupo: 'Trabajo de campo',
    items: [
      { to: '/mis-zonas', etiqueta: 'Mis zonas', icono: Target, permisos: ['zonas.propias'], principal: true },
      { to: '/asignaciones', etiqueta: 'Asignación de zonas', icono: UserCheck, permisos: ['zonas.asignar'] },
      { to: '/prospectos', etiqueta: 'Posibles socios', icono: MapPinned, permisos: ['prospectos.registrar'] },
      { to: '/rutas', etiqueta: 'Rutas de visita', icono: RouteIcon, permisos: ['rutas.gestionar'], principal: true },
      { to: '/visitas', etiqueta: 'Registro de visitas', icono: ClipboardCheck, permisos: ['visitas.registrar'], interruptor: 'habilitar_registro_visitas' },
      { to: '/seguimiento', etiqueta: 'Seguimiento', icono: ScanSearch, permisos: ['seguimiento.ver'], interruptor: 'habilitar_registro_visitas' },
    ],
  },
  {
    grupo: 'Reportes y potencial',
    items: [
      { to: '/reportes', etiqueta: 'Reportes', icono: FileText, permisos: ['reportes.generar'] },
      { to: '/potencial', etiqueta: 'Potencial de captación', icono: Sparkles, permisos: ['potencial.ver'], interruptor: 'habilitar_analisis_predictivo' },
    ],
  },
  {
    grupo: 'Datos y administración',
    items: [
      { to: '/datos/cargas', etiqueta: 'Carga de archivos', icono: Database, permisos: ['datos.cargar'] },
      { to: '/datos/observados', etiqueta: 'Depuración', icono: ShieldCheck, permisos: ['datos.validar'] },
      { to: '/datos/limites', etiqueta: 'Límites geográficos', icono: Workflow, permisos: ['limites.gestionar'] },
      { to: '/datos/esquemas', etiqueta: 'Esquemas de carga', icono: FileSpreadsheet, permisos: ['config.gestionar'] },
      { to: '/historial', etiqueta: 'Historial', icono: History, permisos: ['historial.ver'] },
      { to: '/usuarios', etiqueta: 'Usuarios y roles', icono: Users, permisos: ['usuarios.gestionar'] },
      { to: '/analisis', etiqueta: 'Análisis predictivo', icono: BarChart3, permisos: ['analisis.ejecutar'], interruptor: 'habilitar_analisis_predictivo' },
      { to: '/parametros', etiqueta: 'Parámetros', icono: Settings2, permisos: ['config.gestionar'] },
    ],
  },
]

// Los destinos condicionados se muestran (bloqueados con su motivo) aunque el interruptor esté apagado
export function destinosVisibles(puede) {
  return GRUPOS.map((g) => ({ ...g, items: g.items.filter((i) => puede(...i.permisos)) })).filter((g) => g.items.length)
}
