import { useSyncExternalStore } from 'react'
import { obtenerEstado, suscribir } from './servicio'

const suscribirRed = (fn) => {
  window.addEventListener('online', fn)
  window.addEventListener('offline', fn)
  return () => {
    window.removeEventListener('online', fn)
    window.removeEventListener('offline', fn)
  }
}
const enLineaAhora = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)

/** Estado de la red según el navegador (`navigator.onLine` y los eventos online/offline). */
export const useEnLinea = () => useSyncExternalStore(suscribirRed, enLineaAhora, () => true)

/** Estado del modo campo (cola y paquete) expuesto por el módulo de servicio. */
export const useEstadoOffline = () => useSyncExternalStore(suscribir, obtenerEstado, obtenerEstado)

// Destinos que funcionan sin conexión (sección 20.1); el resto muestra «Requiere conexión»
export const RUTAS_SIN_CONEXION = ['/mis-zonas', '/rutas', '/prospectos', '/visitas', '/perfil']
export const funcionaSinConexion = (ruta) => RUTAS_SIN_CONEXION.some((r) => ruta === r || ruta.startsWith(`${r}/`))

export const PERMISOS_CAMPO = ['zonas.propias', 'prospectos.registrar', 'rutas.gestionar', 'visitas.registrar']

export const pendientesDe = (items) => items.filter((i) => i.estado === 'pendiente' || i.estado === 'enviando')
export const rechazadosDe = (items) => items.filter((i) => i.estado === 'rechazado')
