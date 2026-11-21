import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, cacheClear, onSesion, restaurarSesion, setAccessToken, ultimoFalloSesion } from '../api/client'
import { almacenCola, borrarPaquete, borrarTodo, guardarMeta, leerMeta } from '../offline/almacen'
import { activar as activarOffline, desactivar as desactivarOffline } from '../offline/servicio'

const AuthContext = createContext(null)
const EVENTOS_ACTIVIDAD = ['pointerdown', 'keydown', 'wheel', 'touchstart']
const HORA = 3600 * 1000
const sinRed = () => typeof navigator !== 'undefined' && navigator.onLine === false

async function contarPendientes(uid) {
  try {
    return (await almacenCola(uid).listar()).filter((i) => i.estado !== 'sincronizado').length
  } catch {
    return 0
  }
}
const textoPendientes = (n) => (n ? ` Hay ${n} ${n === 1 ? 'registro pendiente' : 'registros pendientes'} guardados en este dispositivo; se conservan.` : '')

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [parametros, setParametros] = useState(null)
  const [iniciando, setIniciando] = useState(true)
  const [aviso, setAviso] = useState(null)
  // Sesión abierta sin conexión desde los datos locales (sin token; nada se envía hasta reconectar e iniciar sesión)
  const [sinConexion, setSinConexion] = useState(false)
  // Última autenticación validada por el servidor (inicio de sesión o renovación): inicio de la ventana sin conexión
  const [autenticadoEn, setAutenticadoEn] = useState(null)
  const minutos = useRef(15)
  const timer = useRef(null)
  const usuarioRef = useRef(null)
  useEffect(() => {
    usuarioRef.current = usuario
  }, [usuario])

  const cargarParametros = useCallback(async () => {
    try {
      setParametros(await api.get('/parametros/publicos/'))
    } catch (e) {
      if (e?.code !== 'SIN_CONEXION') setParametros(null)
    }
  }, [])

  const aplicarSesion = useCallback(
    (data) => {
      setAccessToken(data.access)
      minutos.current = data.minutos_inactividad || 15
      setUsuario(data.usuario)
      setSinConexion(false)
      setAutenticadoEn(Date.now())
      cargarParametros()
    },
    [cargarParametros],
  )

  const limpiar = useCallback((mensaje) => {
    setAccessToken(null)
    cacheClear() // la caché nunca se comparte entre sesiones
    desactivarOffline() // los datos locales dejan de estar en memoria
    setUsuario(null)
    setParametros(null)
    setSinConexion(false)
    if (mensaje) setAviso(mensaje)
  }, [])

  /** Cierre automático (inactividad, ventana vencida, sesión cerrada): oculta los datos y conserva la cola. */
  const bloquear = useCallback(
    async (mensaje, { borrarConsulta = false } = {}) => {
      const uid = usuarioRef.current?.id
      let extra = ''
      if (uid != null) {
        const meta = await leerMeta()
        if (meta?.usuarioId === uid) await guardarMeta({ ...meta, bloqueado: true }).catch(() => undefined)
        if (borrarConsulta) await borrarPaquete(uid)
        extra = textoPendientes(await contarPendientes(uid))
      }
      limpiar(mensaje ? mensaje + extra : null)
    },
    [limpiar],
  )

  /** Borra todo lo local (cuenta desactivada o sin permisos al sincronizar). */
  const borrarLocalYSalir = useCallback(
    async (mensaje) => {
      const uid = usuarioRef.current?.id ?? (await leerMeta())?.usuarioId
      if (uid != null) await borrarTodo(uid)
      limpiar(mensaje)
    },
    [limpiar],
  )

  /** Abre la aplicación sin conexión con la última sesión en línea, si la ventana sigue vigente. */
  const entrarSinConexion = useCallback(async () => {
    const meta = await leerMeta()
    if (!meta?.offline) {
      setAviso('Sin conexión. El primer inicio de sesión requiere conexión a internet.')
      return
    }
    const pend = textoPendientes(await contarPendientes(meta.usuarioId))
    if (meta.bloqueado) {
      setAviso(`Sin conexión. La sesión de este dispositivo está bloqueada: conéctese e inicie sesión para continuar.${pend}`)
      return
    }
    if (Date.now() > meta.autenticadoEn + meta.horas * HORA) {
      await borrarPaquete(meta.usuarioId)
      await guardarMeta({ ...meta, bloqueado: true }).catch(() => undefined)
      setAviso(`Venció la ventana de ${meta.horas} h para trabajar sin conexión. Conéctese e inicie sesión.${pend}`)
      return
    }
    await activarOffline(meta.usuarioId)
    minutos.current = meta.minutosInactividad || 15
    setParametros(meta.parametros)
    setAutenticadoEn(meta.autenticadoEn)
    setSinConexion(true)
    setUsuario(meta.perfil)
  }, [])

  // Restaurar sesión desde la cookie HttpOnly del refresh al abrir la aplicación (o entrar sin conexión)
  useEffect(() => {
    let vivo = true
    restaurarSesion()
      .then(async (data) => {
        if (!vivo) return
        if (data) return aplicarSesion(data)
        const code = ultimoFalloSesion()?.code
        if (code === 'SIN_CONEXION') return entrarSinConexion()
        if (code === 'USUARIO_DESACTIVADO') return borrarLocalYSalir('Su cuenta está desactivada: se borraron los datos de este dispositivo.')
      })
      .finally(() => vivo && setIniciando(false))
    return () => {
      vivo = false
    }
  }, [aplicarSesion, entrarSinConexion, borrarLocalYSalir])

  useEffect(
    () =>
      onSesion((e) => {
        if (e.tipo === 'renovada') return setAutenticadoEn(Date.now())
        if (e.code === 'USUARIO_DESACTIVADO') return borrarLocalYSalir(`${e.mensaje || 'Su cuenta está desactivada.'} Se borraron los datos de este dispositivo.`)
        bloquear(e.mensaje)
      }),
    [bloquear, borrarLocalYSalir],
  )

  // Sesión sin conexión: al volver la red se intenta renovar con la cookie; si no se puede, hay que iniciar sesión
  useEffect(() => {
    if (!sinConexion) return undefined
    const reconectar = async () => {
      const data = await restaurarSesion()
      if (data) return aplicarSesion(data)
      const code = ultimoFalloSesion()?.code
      if (code === 'SIN_CONEXION') return undefined
      if (code === 'USUARIO_DESACTIVADO') return borrarLocalYSalir('Su cuenta está desactivada: se borraron los datos de este dispositivo.')
      return bloquear('Conexión recuperada. Inicie sesión para sincronizar sus registros.')
    }
    window.addEventListener('online', reconectar)
    if (!sinRed()) reconectar()
    return () => window.removeEventListener('online', reconectar)
  }, [sinConexion, aplicarSesion, bloquear, borrarLocalYSalir])

  // Ventana sin conexión (horas_ventana_offline) contada desde la última autenticación en línea
  useEffect(() => {
    if (!usuario || !parametros?.habilitar_modo_offline || !autenticadoEn) return undefined
    const horas = parametros.horas_ventana_offline || 24
    const revisar = () => {
      if ((sinConexion || sinRed()) && Date.now() > autenticadoEn + horas * HORA) {
        bloquear(`Venció la ventana de ${horas} h para trabajar sin conexión. Conéctese e inicie sesión.`, { borrarConsulta: true })
      }
    }
    revisar()
    const t = setInterval(revisar, 30_000)
    return () => clearInterval(t)
  }, [usuario, parametros, autenticadoEn, sinConexion, bloquear])

  const login = useCallback(
    async (username, password) => {
      let data
      try {
        data = await api.post('/auth/login/', { username, password })
      } catch (e) {
        if (e.code === 'SIN_CONEXION') e.message = 'Sin conexión: el inicio de sesión requiere conexión a internet.'
        throw e
      }
      setAviso(null)
      aplicarSesion(data)
      return data.usuario
    },
    [aplicarSesion],
  )

  /** Cierre de sesión pedido por el usuario: borra TODO lo local (la confirmación por pendientes la hace la capa offline). */
  const logout = useCallback(
    async (mensaje) => {
      const uid = usuarioRef.current?.id
      try {
        await api.post('/auth/logout/')
      } catch {
        /* el cierre local ocurre igual */
      }
      if (uid != null) await borrarTodo(uid)
      limpiar(mensaje)
    },
    [limpiar],
  )

  // Temporizador de inactividad (la verificación real ocurre en el servidor). Sin conexión no se puede verificar una
  // contraseña: la pantalla se bloquea (oculta los datos) y se desbloquea al reconectar e iniciar sesión.
  useEffect(() => {
    if (!usuario) return undefined
    const reiniciar = () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(async () => {
        if (sinConexion || sinRed()) return bloquear('Pantalla bloqueada por inactividad. Conéctese e inicie sesión para continuar.')
        try {
          await api.post('/auth/logout/')
        } catch {
          /* el cierre local ocurre igual */
        }
        bloquear('Su sesión se cerró por inactividad. Inicie sesión nuevamente.')
      }, minutos.current * 60 * 1000)
    }
    reiniciar()
    EVENTOS_ACTIVIDAD.forEach((ev) => window.addEventListener(ev, reiniciar, { passive: true }))
    return () => {
      clearTimeout(timer.current)
      EVENTOS_ACTIVIDAD.forEach((ev) => window.removeEventListener(ev, reiniciar))
    }
  }, [usuario, sinConexion, bloquear])

  const puede = useCallback((...permisos) => Boolean(usuario && permisos.some((p) => usuario.permisos?.includes(p))), [usuario])

  const valor = useMemo(
    () => ({ usuario, parametros, iniciando, aviso, setAviso, login, logout, puede, recargarParametros: cargarParametros, sinConexion, autenticadoEn, borrarLocalYSalir, minutos }),
    [usuario, parametros, iniciando, aviso, login, logout, puede, cargarParametros, sinConexion, autenticadoEn, borrarLocalYSalir],
  )
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- el hook acompaña a su proveedor
export const useAuth = () => useContext(AuthContext)
