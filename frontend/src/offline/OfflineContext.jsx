import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, cacheInvalidate } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { borrarPaquete, borrarTodo, guardarMeta, leerMeta, pedirPersistencia } from './almacen'
import { PERMISOS_CAMPO, pendientesDe, rechazadosDe, useEnLinea, useEstadoOffline } from './conexion'
import { quitarSW, registrarSW } from './registroSW'
import { activar, guardarPaquete } from './servicio'

const OfflineContext = createContext(null)

/** Orquesta el modo campo: service worker, paquete de consulta, cola de salida y sus disparadores de sincronización. */
export function OfflineProvider({ children }) {
  const { usuario, parametros, sinConexion, autenticadoEn, logout, borrarLocalYSalir } = useAuth()
  const toast = useToast()
  const enLinea = useEnLinea()
  const { cola, items, paquete } = useEstadoOffline()
  const [sincronizando, setSincronizando] = useState(false)
  const [ultimaSync, setUltimaSync] = useState(null)
  const [panelAbierto, setPanelAbierto] = useState(false)
  const [confirmarCierre, setConfirmarCierre] = useState(false)
  const reintento = useRef(null)

  const uid = usuario?.id ?? null
  const deCampo = Boolean(usuario && PERMISOS_CAMPO.some((p) => usuario.permisos?.includes(p)))
  const habilitado = Boolean(deCampo && parametros?.habilitar_modo_offline)
  const enLineaReal = enLinea && !sinConexion // con token y red

  // Service worker: solo con el interruptor encendido; apagado, se quita (y su caché de estáticos)
  useEffect(() => {
    if (!parametros || sinConexion) return
    if (parametros.habilitar_modo_offline) registrarSW()
    else quitarSW()
  }, [parametros, sinConexion])

  // Activar la cola del usuario en sesiones en línea (sin conexión la activa AuthContext antes de mostrar datos)
  useEffect(() => {
    if (!uid || !parametros || sinConexion) return
    let vivo = true
    ;(async () => {
      const meta = await leerMeta()
      if (meta && meta.usuarioId !== uid) await borrarPaquete(meta.usuarioId) // minimización: otro usuario en este navegador
      if (habilitado) {
        await activar(uid)
        pedirPersistencia()
      } else if (meta?.usuarioId === uid) {
        // Interruptor apagado con datos previos: se vacía la cola pendiente (no se pierde trabajo) y luego se borra todo
        const c = await activar(uid, { cargarPaquete: false })
        await c.sincronizar({ forzar: true })
        const quedan = (await c.listar()).filter((i) => i.estado !== 'sincronizado')
        if (vivo && !quedan.length) await borrarTodo(uid)
      }
    })()
    return () => {
      vivo = false
    }
  }, [uid, habilitado, parametros, sinConexion])

  const descargarPaquete = useCallback(async () => {
    if (!uid || !habilitado) return
    try {
      const p = await api.get('/campo/paquete-offline/')
      await guardarPaquete(uid, p)
    } catch (e) {
      if (e?.code === 'SIN_ESPACIO') toast.error(e.message)
    }
  }, [uid, habilitado, toast])

  // Meta de la sesión y paquete de consulta: se renuevan con cada autenticación en línea
  useEffect(() => {
    if (!habilitado || !enLineaReal || !autenticadoEn) return
    guardarMeta({
      usuarioId: uid,
      perfil: usuario,
      parametros,
      autenticadoEn,
      horas: parametros.horas_ventana_offline || 24,
      minutosInactividad: parametros.minutos_inactividad_sesion || 15,
      offline: true,
      bloqueado: false,
    }).catch((e) => e?.code === 'SIN_ESPACIO' && toast.error(e.message))
  }, [habilitado, enLineaReal, autenticadoEn, uid, usuario, parametros, toast])
  useEffect(() => {
    if (habilitado && enLineaReal && cola) descargarPaquete()
  }, [habilitado, enLineaReal, cola, descargarPaquete])

  const sincronizar = useCallback(
    async ({ forzar = false } = {}) => {
      if (!cola || !enLineaReal) {
        if (forzar) toast.info('Sin conexión: se sincronizará automáticamente al recuperarla.')
        return null
      }
      setSincronizando(true)
      try {
        const r = await cola.sincronizar({ forzar })
        setUltimaSync(Date.now())
        if (r.resultado === 'borrar') {
          await borrarLocalYSalir('Su cuenta fue desactivada o ya no tiene permisos de trabajo de campo: se borraron los datos de este dispositivo.')
          return r
        }
        if (r.sincronizados) {
          toast.exito(`${r.sincronizados} ${r.sincronizados === 1 ? 'registro sincronizado' : 'registros sincronizados'}.`)
          cacheInvalidate('/prospectos/', '/rutas/', '/mapa/', '/visitas/', '/mis-zonas/')
          descargarPaquete()
        }
        if (r.rechazados) toast.error(`${r.rechazados} ${r.rechazados === 1 ? 'registro fue rechazado' : 'registros fueron rechazados'}: revise el motivo en Pendientes.`)
        if (forzar && r.resultado === 'nada') toast.info('No hay registros pendientes.')
        if (forzar && (r.resultado === 'sin_conexion' || r.resultado === 'error')) toast.error(r.mensaje || 'No se pudo sincronizar; se reintentará.')
        return r
      } finally {
        setSincronizando(false)
      }
    },
    [cola, enLineaReal, toast, borrarLocalYSalir, descargarPaquete],
  )

  // Disparadores: al abrir (o recuperar sesión/red) y al volver al primer plano
  useEffect(() => {
    if (!cola || !enLineaReal) return undefined
    const t = setTimeout(() => sincronizar(), 0)
    return () => clearTimeout(t)
  }, [cola, enLineaReal, sincronizar])
  useEffect(() => {
    const alVolver = () => document.visibilityState === 'visible' && sincronizar()
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [sincronizar])
  // Reintentos con retroceso exponencial mientras la aplicación esté abierta
  useEffect(() => {
    clearTimeout(reintento.current)
    if (!cola || !enLineaReal) return undefined
    let vivo = true
    cola.proximoIntento().then((t) => {
      if (vivo && t != null) reintento.current = setTimeout(() => sincronizar(), Math.max(1000, t - Date.now()))
    })
    return () => {
      vivo = false
      clearTimeout(reintento.current)
    }
  }, [cola, items, enLineaReal, sincronizar])

  const pendientes = useMemo(() => pendientesDe(items), [items])
  const rechazados = useMemo(() => rechazadosDe(items), [items])

  /** Cerrar sesión: si hay registros sin sincronizar se avisa antes (se perderían al borrar lo local). */
  const cerrarSesion = useCallback(() => {
    if (pendientes.length + rechazados.length > 0) setConfirmarCierre(true)
    else logout()
  }, [pendientes.length, rechazados.length, logout])

  const valor = useMemo(
    () => ({
      habilitado,
      enLinea: enLineaReal,
      sinRed: !enLinea,
      sinConexion,
      items,
      pendientes,
      rechazados,
      paquete,
      sincronizando,
      ultimaSync,
      sincronizar,
      descartar: (u) => cola?.descartar(u),
      reintentar: (u) => cola?.corregir(u).then(() => sincronizar({ forzar: true })),
      panelAbierto,
      abrirPanel: () => setPanelAbierto(true),
      cerrarPanel: () => setPanelAbierto(false),
      cerrarSesion,
      confirmarCierre,
      cancelarCierre: () => setConfirmarCierre(false),
      cerrarYBorrar: async () => {
        setConfirmarCierre(false)
        await logout()
      },
    }),
    [habilitado, enLineaReal, enLinea, sinConexion, items, pendientes, rechazados, paquete, sincronizando, ultimaSync, sincronizar, cola, panelAbierto, cerrarSesion, confirmarCierre, logout],
  )
  return <OfflineContext.Provider value={valor}>{children}</OfflineContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- el hook acompaña a su proveedor
export const useOffline = () => useContext(OfflineContext)
