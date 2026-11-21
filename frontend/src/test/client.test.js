import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, cacheClear, onSesion, qs, setAccessToken } from '../api/client'

const respuesta = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => body,
  clone() {
    return respuesta(status, body)
  },
})

describe('cliente HTTP', () => {
  beforeEach(() => {
    cacheClear()
    setAccessToken('tok-1')
  })
  afterEach(() => vi.restoreAllMocks())

  it('desenvuelve el sobre y envía el token solo en la cabecera', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta(200, { success: true, data: { a: 1 }, meta: {}, error: null }))
    await expect(api.get('/x/', { params: { periodo: '2026-10', vacio: '' } })).resolves.toEqual({ a: 1 })
    const [url, opts] = f.mock.calls[0]
    expect(url).toBe('/api/v1/x/?periodo=2026-10')
    expect(opts.headers.Authorization).toBe('Bearer tok-1')
    expect(url).not.toContain('tok-1')
  })

  it('convierte errores en ApiError con campos', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      respuesta(400, { success: false, data: null, error: { code: 'VALIDACION', message: 'Revise', details: [{ campo: 'username', mensaje: 'Repetido' }] } }),
    )
    const e = await api.post('/usuarios/', {}).catch((x) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e.code).toBe('VALIDACION')
    expect(e.campos).toEqual({ username: 'Repetido' })
  })

  it('renueva el token una sola vez cuando expira y reintenta', async () => {
    const f = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(respuesta(401, { success: false, error: { code: 'TOKEN_INVALIDO', message: 'x' } }))
      .mockResolvedValueOnce(respuesta(200, { success: true, data: { access: 'tok-2', usuario: {} } }))
      .mockResolvedValueOnce(respuesta(200, { success: true, data: 'ok' }))
    await expect(api.get('/y/')).resolves.toBe('ok')
    expect(f.mock.calls[1][0]).toBe('/api/v1/auth/refresh/')
    expect(f.mock.calls[1][1].headers['X-COAC-Refresh']).toBe('1')
    expect(f.mock.calls[2][1].headers.Authorization).toBe('Bearer tok-2')
  })

  it('emite cierre de sesión por inactividad', async () => {
    const oyente = vi.fn()
    const quitar = onSesion(oyente)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta(401, { success: false, error: { code: 'SESION_INACTIVA', message: 'Inactiva' } }))
    await api.get('/z/').catch(() => {})
    expect(oyente).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'cerrada', code: 'SESION_INACTIVA' }))
    quitar()
  })

  it('usa caché por endpoint y filtros, que se borra al cerrar sesión', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta(200, { success: true, data: 1 }))
    await api.get('/c/', { cacheTtl: 10000, params: { a: 1 } })
    await api.get('/c/', { cacheTtl: 10000, params: { a: 1 } })
    await api.get('/c/', { cacheTtl: 10000, params: { a: 2 } })
    expect(f).toHaveBeenCalledTimes(2)
    cacheClear()
    await api.get('/c/', { cacheTtl: 10000, params: { a: 1 } })
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('serializa parámetros omitiendo vacíos', () => {
    expect(qs({ a: 1, b: null, c: '', d: ['x', 'y'] })).toBe('?a=1&d=x%2Cy')
  })
})
