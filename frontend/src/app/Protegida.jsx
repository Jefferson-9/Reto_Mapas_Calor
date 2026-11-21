import { GlassPanel } from '../components/glass/Glass'
import { AccessDenied, FuncionBloqueada } from '../components/feedback/Estados'
import { Ensamblado } from '../components/layout/Ensamblado'
import { RequiereConexion } from '../components/offline/Conexion'
import { useAuth } from '../context/AuthContext'
import { funcionaSinConexion, useEnLinea } from '../offline/conexion'

const MOTIVOS = {
  habilitar_registro_visitas: ['Función no habilitada', 'El registro y seguimiento de visitas requiere la aprobación de la cooperativa. Un administrador puede activarlo en Parámetros cuando exista esa aprobación.'],
  habilitar_analisis_predictivo: ['Función no habilitada', 'El análisis de potencial de captación requiere la aprobación de la cooperativa y datos suficientes. Un administrador puede activarlo en Parámetros cuando exista esa aprobación.'],
}

/** La interfaz oculta lo que no corresponde, pero la autorización real ocurre en el servidor. */
export function Protegida({ permisos, interruptor, ruta = '', children }) {
  const { puede, parametros, sinConexion } = useAuth()
  const enLinea = useEnLinea()
  if (!puede(...permisos)) {
    return (
      <Ensamblado>
        <GlassPanel className="mt-4">
          <AccessDenied />
        </GlassPanel>
      </Ensamblado>
    )
  }
  // Sin conexión solo funcionan las pantallas del modo campo (20.1); el resto se muestra deshabilitado
  if ((sinConexion || (!enLinea && parametros?.habilitar_modo_offline)) && !funcionaSinConexion(ruta)) {
    return (
      <Ensamblado>
        <GlassPanel className="mt-4">
          <RequiereConexion />
        </GlassPanel>
      </Ensamblado>
    )
  }
  if (interruptor && parametros && !parametros[interruptor]) {
    const [t, m] = MOTIVOS[interruptor]
    return (
      <Ensamblado>
        <GlassPanel className="mt-4">
          <FuncionBloqueada titulo={t} mensaje={m} />
        </GlassPanel>
      </Ensamblado>
    )
  }
  return children
}
