// Registro del service worker (generado por vite-plugin-pwa/Workbox en la compilación de producción).
// Solo se registra con el interruptor `habilitar_modo_offline` encendido; al apagarlo se quita junto con su caché.
// El service worker guarda únicamente archivos estáticos: nunca respuestas de la API (ver vite.config.js).

const URL_SW = '/sw.js'
const soportado = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD

export async function registrarSW() {
  if (!soportado()) return null
  try {
    return await navigator.serviceWorker.register(URL_SW, { scope: '/' })
  } catch {
    return null // sin HTTPS/localhost o bloqueado por el navegador: la aplicación sigue funcionando en línea
  }
}

export async function quitarSW() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((r) => r.unregister()))
    if (typeof caches !== 'undefined') {
      const claves = await caches.keys()
      await Promise.all(claves.filter((k) => k.startsWith('workbox-') || k.startsWith('coac-')).map((k) => caches.delete(k)))
    }
  } catch {
    /* nada que quitar */
  }
}
