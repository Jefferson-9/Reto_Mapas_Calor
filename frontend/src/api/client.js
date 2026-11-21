// Cliente HTTP único. El access token vive SOLO en memoria (nunca en localStorage);
// el refresh va en cookie HttpOnly gestionada por el servidor.

const BASE = '/api/v1'
let accessToken = null
let refreshEnCurso = null
const oyentes = new Set()

export class ApiError extends Error {
  constructor({ status, code, message, details = [] }) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
  // Mapa campo → mensaje para formularios
  get campos() {
    return Object.fromEntries((this.details || []).filter((d) => d.campo).map((d) => [d.campo, d.mensaje]))
  }
}

export const setAccessToken = (t) => {
  accessToken = t
}
export const getAccessToken = () => accessToken
// Eventos de sesión (expirada, inactiva) para el AuthContext
export const onSesion = (fn) => {
  oyentes.add(fn)
  return () => oyentes.delete(fn)
}
const emitir = (evento) => oyentes.forEach((fn) => fn(evento))

// ---- Caché de cliente por endpoint+filtros (TTL y límite), nunca compartida entre sesiones ----
const CACHE_MAX = 120
const cache = new Map()
export const cacheClear = () => cache.clear()
export const cacheInvalidate = (...prefijos) => {
  for (const k of [...cache.keys()]) if (prefijos.some((p) => k.startsWith(BASE + p))) cache.delete(k)
}
const cacheGet = (k) => {
  const e = cache.get(k)
  if (!e) return undefined
  if (Date.now() > e.exp) {
    cache.delete(k)
    return undefined
  }
  return e.v
}
const cacheSet = (k, v, ttl) => {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
  cache.set(k, { v, exp: Date.now() + ttl })
}

export const qs = (params = {}) => {
  const u = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') u.set(k, Array.isArray(v) ? v.join(',') : String(v))
  })
  const s = u.toString()
  return s ? `?${s}` : ''
}

// Motivo del último refresh fallido: SIN_CONEXION (red) o el código del servidor (p. ej. USUARIO_DESACTIVADO)
let ultimoFallo = null
export const ultimoFalloSesion = () => ultimoFallo

async function refrescar() {
  if (!refreshEnCurso) {
    refreshEnCurso = fetch(`${BASE}/auth/refresh/`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-COAC-Refresh': '1' },
    })
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (!r.ok || !body?.success) {
          accessToken = null
          ultimoFallo = { code: body?.error?.code || 'SESION_INVALIDA', message: body?.error?.message }
          return null
        }
        accessToken = body.data.access
        ultimoFallo = null
        emitir({ tipo: 'renovada' }) // autenticación en línea vigente (cuenta para la ventana sin conexión)
        return body.data
      })
      .catch(() => {
        // Sin red: no hay sesión que renovar, pero no es un rechazo del servidor
        ultimoFallo = { code: 'SIN_CONEXION' }
        return null
      })
      .finally(() => {
        setTimeout(() => {
          refreshEnCurso = null
        }, 0)
      })
  }
  return refreshEnCurso
}
export const restaurarSesion = refrescar

async function parse(r) {
  const tipo = r.headers.get('content-type') || ''
  if (tipo.includes('application/json')) return r.json()
  return null
}

export async function request(path, { method = 'GET', body, params, signal, headers = {}, cacheTtl = 0, raw = false, reintento = true } = {}) {
  const url = BASE + path + qs(params)
  if (method === 'GET' && cacheTtl > 0) {
    const hit = cacheGet(url)
    if (hit !== undefined) return hit
  }
  const h = { Accept: 'application/json', ...headers }
  if (accessToken) h.Authorization = `Bearer ${accessToken}`
  let payload = body
  if (body && !(body instanceof FormData)) {
    h['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  let r
  try {
    r = await fetch(url, { method, body: payload, headers: h, signal, credentials: 'same-origin' })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ApiError({ status: 0, code: 'SIN_CONEXION', message: 'No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.' })
  }
  if (r.status === 401 && reintento) {
    const b = await parse(r.clone())
    const code = b?.error?.code
    if (code === 'TOKEN_INVALIDO' || (code === 'NO_AUTENTICADO' && accessToken)) {
      const ok = await refrescar()
      if (ok) return request(path, { method, body, params, signal, headers, cacheTtl, raw, reintento: false })
      if (ultimoFallo?.code === 'USUARIO_DESACTIVADO') emitir({ tipo: 'cerrada', code: ultimoFallo.code, mensaje: ultimoFallo.message })
      else emitir({ tipo: 'expirada', mensaje: 'Su sesión expiró. Inicie sesión nuevamente.' })
    } else if (['SESION_INACTIVA', 'SESION_CERRADA', 'SESION_INVALIDA', 'USUARIO_DESACTIVADO'].includes(code)) {
      emitir({ tipo: 'cerrada', code, mensaje: b.error.message })
    }
  }
  if (raw) {
    if (!r.ok) {
      const b = await parse(r)
      throw new ApiError({ status: r.status, code: b?.error?.code || 'ERROR', message: b?.error?.message || 'No se pudo completar la solicitud.', details: b?.error?.details })
    }
    return r
  }
  const b = await parse(r)
  if (!r.ok || !b?.success) {
    throw new ApiError({
      status: r.status,
      code: b?.error?.code || 'ERROR',
      message: b?.error?.message || 'No se pudo completar la solicitud.',
      details: b?.error?.details || [],
    })
  }
  if (method === 'GET' && cacheTtl > 0) cacheSet(url, b.data, cacheTtl)
  return b.data
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  del: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
}

// Descarga de archivos (reportes, plantillas, errores) sin exponer el token en la URL
export async function descargar(path, { method = 'GET', body, nombre } = {}) {
  const r = await request(path, { method, body, raw: true })
  const blob = await r.blob()
  const disp = r.headers.get('content-disposition') || ''
  const sugerido = /filename="?([^"]+)"?/.exec(disp)?.[1]
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre || sugerido || 'descarga'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export const nuevoUUID = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
