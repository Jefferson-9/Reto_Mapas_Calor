// Cola de salida (outbox) del modo campo sin conexión: lógica pura, sin React ni IndexedDB (se inyectan).
//
// Cada elemento: client_uuid, tipo, datos (carga útil), client_created_at, estado, intentos, error, seq, proximo_intento.
// Estados: 'pendiente' → 'enviando' → 'sincronizado' | 'rechazado' (o vuelve a 'pendiente' con retroceso exponencial).
// Orden FIFO por `seq`. Reintentar nunca duplica: el servidor es idempotente por client_uuid.

export const ESTADOS = Object.freeze({ PENDIENTE: 'pendiente', ENVIANDO: 'enviando', SINCRONIZADO: 'sincronizado', RECHAZADO: 'rechazado' })
export const TIPOS = Object.freeze(['prospecto', 'ruta', 'visita'])
export const TAM_LOTE = 50
// Los sincronizados se muestran un rato («Sincronizado») y luego se borran del dispositivo (minimización)
export const RETENCION_SINCRONIZADOS_MS = 15 * 60 * 1000

/** Espera antes del intento n (1, 2, 3…): 2 s, 4 s, 8 s… hasta 5 min, con ±20 % de variación para no sincronizar en ráfaga. */
export function retroceso(intentos, { base = 2000, max = 5 * 60 * 1000, azar = Math.random } = {}) {
  const n = Math.max(1, intentos)
  const ms = Math.min(max, base * 2 ** (n - 1))
  return Math.round(ms * (0.8 + 0.4 * azar()))
}

const SIN_CONEXION = 'Sin conexión: se reintentará automáticamente.'

/**
 * @param {object} deps
 * @param {{listar: () => Promise<object[]>, poner: (i: object) => Promise<any>, borrar: (uuid: string) => Promise<any>}} deps.almacen
 * @param {(items: object[]) => Promise<{resultados: object[]}>} deps.enviar  POST del lote; lanza ApiError (status 0 = sin conexión)
 * @param {() => string} deps.uuid
 */
export function crearCola({ almacen, enviar, uuid, ahora = () => Date.now(), azar = Math.random, tamLote = TAM_LOTE }) {
  let enCurso = null
  const oyentes = new Set()
  const avisar = async () => {
    const items = await listar()
    oyentes.forEach((fn) => fn(items))
  }

  async function listar() {
    const items = await almacen.listar()
    return items.sort((a, b) => a.seq - b.seq)
  }

  async function encolar(tipo, datos, { client_uuid, client_created_at } = {}) {
    if (!TIPOS.includes(tipo)) throw new Error(`Tipo de registro no admitido sin conexión: ${tipo}`)
    const items = await almacen.listar()
    const existente = client_uuid && items.find((i) => i.client_uuid === client_uuid)
    if (existente?.estado === ESTADOS.RECHAZADO) return corregir(client_uuid, datos) // corrección de un rechazado
    if (existente) return existente // el mismo formulario guardado dos veces no duplica
    const seq = items.reduce((m, i) => Math.max(m, i.seq), 0) + 1
    const item = {
      client_uuid: client_uuid || uuid(),
      tipo,
      datos,
      client_created_at: client_created_at || new Date(ahora()).toISOString(),
      estado: ESTADOS.PENDIENTE,
      intentos: 0,
      error: null,
      seq,
      proximo_intento: 0,
      actualizado_en: ahora(),
    }
    await almacen.poner(item)
    await avisar()
    return item
  }

  /** Recupera elementos que quedaron «enviando» si la aplicación se cerró a mitad de un envío. */
  async function recuperar() {
    const items = await almacen.listar()
    const colgados = items.filter((i) => i.estado === ESTADOS.ENVIANDO)
    for (const i of colgados) await almacen.poner({ ...i, estado: ESTADOS.PENDIENTE })
    if (colgados.length) await avisar()
    return colgados.length
  }

  async function limpiarSincronizados(edadMax = RETENCION_SINCRONIZADOS_MS) {
    const items = await almacen.listar()
    const viejos = items.filter((i) => i.estado === ESTADOS.SINCRONIZADO && ahora() - (i.sincronizado_en || 0) >= edadMax)
    for (const i of viejos) await almacen.borrar(i.client_uuid)
    if (viejos.length) await avisar()
    return viejos.length
  }

  const devolverAPendiente = (lote, { contar, error }) =>
    Promise.all(
      lote.map((i) => {
        const intentos = i.intentos + (contar ? 1 : 0)
        return almacen.poner({ ...i, estado: ESTADOS.PENDIENTE, intentos, error, proximo_intento: contar ? ahora() + retroceso(intentos, { azar }) : 0, actualizado_en: ahora() })
      }),
    )

  async function ciclo({ forzar }) {
    await limpiarSincronizados()
    const todos = await listar()
    const listos = todos.filter((i) => i.estado === ESTADOS.PENDIENTE && (forzar || (i.proximo_intento || 0) <= ahora()))
    const resumen = { resultado: 'nada', enviados: 0, sincronizados: 0, rechazados: 0 }
    if (!listos.length) return resumen
    for (let k = 0; k < listos.length; k += tamLote) {
      const lote = listos.slice(k, k + tamLote)
      await Promise.all(lote.map((i) => almacen.poner({ ...i, estado: ESTADOS.ENVIANDO, actualizado_en: ahora() })))
      await avisar()
      let respuesta
      try {
        respuesta = await enviar(lote.map(({ client_uuid, tipo, client_created_at, datos }) => ({ client_uuid, tipo, client_created_at, datos })))
      } catch (e) {
        const status = e?.status ?? 0
        if (status === 401 || (status === 403 && e?.code === 'SIN_PERMISO')) {
          // Sesión vencida: se conserva todo sin contar el intento. Cuenta desactivada o sin permisos: borrar datos locales.
          await devolverAPendiente(lote, { contar: false, error: null })
          await avisar()
          const borrar = e?.code === 'USUARIO_DESACTIVADO' || status === 403
          return { ...resumen, resultado: borrar ? 'borrar' : 'requiere_sesion', code: e?.code, mensaje: e?.message }
        }
        await devolverAPendiente(lote, { contar: true, error: status === 0 ? SIN_CONEXION : e?.message || 'No se pudo sincronizar; se reintentará.' })
        await avisar()
        return { ...resumen, resultado: status === 0 ? 'sin_conexion' : 'error', mensaje: e?.message }
      }
      const porUuid = new Map((respuesta?.resultados || []).map((r) => [r.client_uuid, r]))
      for (const i of lote) {
        const r = porUuid.get(i.client_uuid)
        resumen.enviados += 1
        if (r?.estado === ESTADOS.SINCRONIZADO) {
          resumen.sincronizados += 1
          await almacen.poner({ ...i, estado: ESTADOS.SINCRONIZADO, error: null, servidor_id: r.id, duplicado: Boolean(r.duplicado), sincronizado_en: ahora(), actualizado_en: ahora() })
        } else if (r?.estado === ESTADOS.RECHAZADO) {
          resumen.rechazados += 1
          await almacen.poner({ ...i, estado: ESTADOS.RECHAZADO, error: { codigo: r.codigo, mensaje: r.mensaje, detalles: r.detalles || [] }, actualizado_en: ahora() })
        } else {
          // error temporal del servidor o respuesta incompleta: se reintenta con retroceso
          const intentos = i.intentos + 1
          await almacen.poner({ ...i, estado: ESTADOS.PENDIENTE, intentos, error: r?.mensaje || 'No se pudo procesar; se reintentará.', proximo_intento: ahora() + retroceso(intentos, { azar }), actualizado_en: ahora() })
        }
      }
      await avisar()
    }
    return { ...resumen, resultado: 'ok' }
  }

  /** Un solo envío a la vez: las llamadas simultáneas comparten el mismo ciclo. */
  function sincronizar({ forzar = false } = {}) {
    if (!enCurso) enCurso = ciclo({ forzar }).finally(() => (enCurso = null))
    return enCurso
  }

  /** Corregir un rechazado: vuelve a pendiente con los datos nuevos (mismo client_uuid). */
  async function corregir(client_uuid, datos) {
    const i = (await almacen.listar()).find((x) => x.client_uuid === client_uuid)
    if (!i) return null
    const nuevo = { ...i, datos: datos ?? i.datos, estado: ESTADOS.PENDIENTE, error: null, intentos: 0, proximo_intento: 0, actualizado_en: ahora() }
    await almacen.poner(nuevo)
    await avisar()
    return nuevo
  }

  async function descartar(client_uuid) {
    await almacen.borrar(client_uuid)
    await avisar()
  }

  /** Momento del próximo reintento automático (o null si no hay pendientes). */
  async function proximoIntento() {
    const p = (await almacen.listar()).filter((i) => i.estado === ESTADOS.PENDIENTE)
    return p.length ? Math.min(...p.map((i) => i.proximo_intento || 0)) : null
  }

  const suscribir = (fn) => {
    oyentes.add(fn)
    return () => oyentes.delete(fn)
  }

  return { encolar, listar, recuperar, limpiarSincronizados, sincronizar, corregir, descartar, proximoIntento, suscribir }
}
