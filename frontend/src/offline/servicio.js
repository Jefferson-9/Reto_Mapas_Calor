// Estado del modo campo sin conexión a nivel de módulo (lo leen el cliente de campo y el contexto React).
import { api, nuevoUUID } from '../api/client'
import * as almacen from './almacen'
import { crearCola } from './cola'

let estado = { uid: null, cola: null, paquete: null, items: [] }
let cancelarSuscripcion = null
const oyentes = new Set()
const emitir = () => oyentes.forEach((fn) => fn())

export const suscribir = (fn) => {
  oyentes.add(fn)
  return () => oyentes.delete(fn)
}
export const obtenerEstado = () => estado
const fijar = (cambios) => {
  estado = { ...estado, ...cambios }
  emitir()
}

const enviarLote = (items) => api.post('/campo/sincronizar/', { items })

/** Activa la cola y el paquete del usuario (al iniciar sesión en línea o al abrir sin conexión dentro de la ventana). */
export async function activar(uid, { cargarPaquete = true } = {}) {
  if (estado.uid === uid && estado.cola) return estado.cola
  desactivar()
  const cola = crearCola({ almacen: almacen.almacenCola(uid), enviar: enviarLote, uuid: nuevoUUID })
  cancelarSuscripcion = cola.suscribir((items) => fijar({ items }))
  const paquete = cargarPaquete ? await almacen.leerPaquete(uid) : null
  fijar({ uid, cola, paquete: paquete || null, items: [] })
  await cola.recuperar().catch(() => 0)
  fijar({ items: await cola.listar().catch(() => []) })
  return cola
}

/** Deja de exponer datos locales en memoria (los datos en IndexedDB siguen según la política de cada caso). */
export function desactivar() {
  cancelarSuscripcion?.()
  cancelarSuscripcion = null
  fijar({ uid: null, cola: null, paquete: null, items: [] })
}

export async function guardarPaquete(uid, paquete) {
  await almacen.guardarPaquete(uid, paquete)
  if (estado.uid === uid) fijar({ paquete })
}

export const colaActiva = () => estado.cola
export const vigente = (p, ahora = Date.now()) => Boolean(p && Date.parse(p.vence_en) > ahora)
export const paqueteVigente = () => (vigente(estado.paquete) ? estado.paquete : null)

export const esSinConexion = (e) => e?.status === 0 && e?.code === 'SIN_CONEXION'

/** Intenta en línea; si no hay conexión y existe un paquete vigente, responde con el respaldo local. */
export async function conRespaldo(enLinea, sinConexion) {
  try {
    return await enLinea()
  } catch (e) {
    if (!esSinConexion(e)) throw e
    const p = paqueteVigente()
    const r = p ? sinConexion(p, estado.items) : undefined
    if (r === undefined) throw e
    return r
  }
}

/** Datos que solo existen en el dispositivo (p. ej. una ruta aún en la cola). */
export async function desdeLocal(fn) {
  const r = fn(estado.paquete || {}, estado.items)
  if (r === undefined) throw Object.assign(new Error('El registro ya no está en este dispositivo.'), { status: 404, code: 'NO_ENCONTRADO' })
  return r
}

/**
 * Envía en línea; si no hay conexión (y el modo está activo) lo guarda en la cola con el mismo client_uuid.
 * Devuelve la respuesta del servidor o `{ encolado: true, item }`.
 */
export async function enviarOEncolar(tipo, datos, enLinea) {
  const { client_uuid, client_created_at, ...carga } = datos
  try {
    const r = await enLinea()
    // Si era la corrección de un rechazado, ya no hace falta en la cola
    if (client_uuid && estado.cola && estado.items.some((i) => i.client_uuid === client_uuid)) await estado.cola.descartar(client_uuid)
    return r
  } catch (e) {
    if (!esSinConexion(e) || !estado.cola || !paqueteVigente()) throw e
    const item = await estado.cola.encolar(tipo, carga, { client_uuid, client_created_at })
    return { encolado: true, item }
  }
}
