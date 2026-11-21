import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '../components/layout/AppShell'
import { Protegida } from './Protegida'

const p = (loader) => lazy(loader)
const Login = p(() => import('../pages/Login'))
const Panel = p(() => import('../pages/Panel'))
const Mapa = p(() => import('../pages/Mapa'))
const Indicadores = p(() => import('../pages/Indicadores'))
const Comparar = p(() => import('../pages/Comparar'))
const Clasificacion = p(() => import('../pages/Clasificacion'))
const Criterios = p(() => import('../pages/Criterios'))
const Prospectos = p(() => import('../pages/Prospectos'))
const Asignaciones = p(() => import('../pages/Asignaciones'))
const MisZonas = p(() => import('../pages/MisZonas'))
const Rutas = p(() => import('../pages/Rutas'))
const Visitas = p(() => import('../pages/Visitas'))
const Seguimiento = p(() => import('../pages/Seguimiento'))
const Reportes = p(() => import('../pages/Reportes'))
const Potencial = p(() => import('../pages/Potencial'))
const Analisis = p(() => import('../pages/Analisis'))
const Cargas = p(() => import('../pages/datos/Cargas'))
const Observados = p(() => import('../pages/datos/Observados'))
const Limites = p(() => import('../pages/datos/Limites'))
const Esquemas = p(() => import('../pages/datos/Esquemas'))
const Historial = p(() => import('../pages/Historial'))
const Usuarios = p(() => import('../pages/Usuarios'))
const Parametros = p(() => import('../pages/Parametros'))
const Perfil = p(() => import('../pages/Perfil'))

const r = (path, Comp, permisos, interruptor) => ({
  path,
  element: (
    <Protegida permisos={permisos} interruptor={interruptor} ruta={path}>
      <Comp />
    </Protegida>
  ),
})

export const rutas = [
  { path: '/login', element: <Login /> },
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/panel" replace /> },
      r('/panel', Panel, ['panel.ver']),
      r('/mapa', Mapa, ['mapa.ver']),
      r('/indicadores', Indicadores, ['indicadores.ver']),
      r('/comparar', Comparar, ['comparar.ver']),
      r('/clasificacion', Clasificacion, ['clasificacion.ver']),
      r('/criterios', Criterios, ['criterios.definir', 'criterios.aprobar']),
      r('/prospectos', Prospectos, ['prospectos.registrar']),
      r('/asignaciones', Asignaciones, ['zonas.asignar']),
      r('/mis-zonas', MisZonas, ['zonas.propias']),
      r('/rutas', Rutas, ['rutas.gestionar']),
      r('/visitas', Visitas, ['visitas.registrar'], 'habilitar_registro_visitas'),
      r('/seguimiento', Seguimiento, ['seguimiento.ver'], 'habilitar_registro_visitas'),
      r('/reportes', Reportes, ['reportes.generar']),
      r('/potencial', Potencial, ['potencial.ver'], 'habilitar_analisis_predictivo'),
      r('/analisis', Analisis, ['analisis.ejecutar'], 'habilitar_analisis_predictivo'),
      r('/datos/cargas', Cargas, ['datos.cargar']),
      r('/datos/observados', Observados, ['datos.validar']),
      r('/datos/limites', Limites, ['limites.gestionar']),
      r('/datos/esquemas', Esquemas, ['config.gestionar']),
      r('/historial', Historial, ['historial.ver']),
      r('/usuarios', Usuarios, ['usuarios.gestionar']),
      r('/parametros', Parametros, ['config.gestionar']),
      { path: '/perfil', element: <Perfil /> },
      { path: '*', element: <Navigate to="/panel" replace /> },
    ],
  },
]

export const crearRouter = () => createBrowserRouter(rutas)
