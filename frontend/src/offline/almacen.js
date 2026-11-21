// Almacenamiento local del modo campo sin conexión (IndexedDB).
// - Una base por usuario (`coac-campo-u<id>`): paquete de consulta con vencimiento y cola de salida.
// - Una base común (`coac-campo`) con la «meta» de la última sesión en línea (perfil y hora de autenticación).
// Nada de datos individuales de socios. Sin cifrado local: ver SECURITY.md (protegería poco con la clave en el mismo navegador).

const META_DB = 'coac-campo'
const VERSION = 1
export const nombreBaseUsuario = (uid) => `coac-campo-u${uid}`

export class ErrorAlmacen extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
    this.status = -1
  }
}

const traducir = (e) => {
  if (e instanceof ErrorAlmacen) return e
  if (e?.name === 'QuotaExceededError')
    return new ErrorAlmacen('SIN_ESPACIO', 'El dispositivo no tiene espacio suficiente para guardar datos sin conexión. Libere espacio o sincronice sus pendientes.')
  return new ErrorAlmacen('ALMACEN_NO_DISPONIBLE', 'El navegador no permite guardar datos sin conexión (modo privado o almacenamiento bloqueado).')
}

const disponible = () => typeof indexedDB !== 'undefined'

function abrir(nombre, crear) {
  return new Promise((resolve, reject) => {
    if (!disponible()) return reject(traducir(null))
    let req
    try {
      req = indexedDB.open(nombre, VERSION)
    } catch (e) {
      return reject(traducir(e))
    }
    req.onupgradeneeded = () => crear(req.result)
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => db.close() // permite borrar la base desde otra pestaña
      resolve(db)
    }
    req.onerror = () => reject(traducir(req.error))
    req.onblocked = () => reject(new ErrorAlmacen('ALMACEN_BLOQUEADO', 'Cierre las otras pestañas de la aplicación e intente de nuevo.'))
  })
}

const conexiones = new Map()
function base(nombre, crear) {
  if (!conexiones.has(nombre)) {
    const p = abrir(nombre, crear).catch((e) => {
      conexiones.delete(nombre)
      throw e
    })
    conexiones.set(nombre, p)
  }
  return conexiones.get(nombre)
}
const crearMeta = (db) => db.createObjectStore('meta')
const crearUsuario = (db) => {
  db.createObjectStore('paquete')
  const cola = db.createObjectStore('cola', { keyPath: 'client_uuid' })
  cola.createIndex('seq', 'seq', { unique: true })
}

async function tx(nombre, crear, store, modo, fn) {
  const db = await base(nombre, crear)
  return new Promise((resolve, reject) => {
    let resultado
    let t
    try {
      t = db.transaction(store, modo)
      const r = fn(t.objectStore(store))
      if (r) r.onsuccess = () => (resultado = r.result)
    } catch (e) {
      return reject(traducir(e))
    }
    t.oncomplete = () => resolve(resultado)
    t.onerror = () => reject(traducir(t.error))
    t.onabort = () => reject(traducir(t.error))
  })
}

// ---- Meta de la sesión (una sola: el último usuario que se autenticó en línea en este navegador) ----
export const leerMeta = () => tx(META_DB, crearMeta, 'meta', 'readonly', (s) => s.get('sesion')).catch(() => null)
export const guardarMeta = (meta) => tx(META_DB, crearMeta, 'meta', 'readwrite', (s) => s.put(meta, 'sesion'))
export const borrarMeta = () => tx(META_DB, crearMeta, 'meta', 'readwrite', (s) => s.delete('sesion')).catch(() => undefined)

// ---- Paquete de consulta (zonas, rutas, indicadores agregados y polígonos simplificados) ----
export const leerPaquete = (uid) => tx(nombreBaseUsuario(uid), crearUsuario, 'paquete', 'readonly', (s) => s.get('actual')).catch(() => null)
export const guardarPaquete = (uid, paquete) => tx(nombreBaseUsuario(uid), crearUsuario, 'paquete', 'readwrite', (s) => s.put(paquete, 'actual'))
export const borrarPaquete = (uid) => tx(nombreBaseUsuario(uid), crearUsuario, 'paquete', 'readwrite', (s) => s.delete('actual')).catch(() => undefined)

// ---- Cola de salida (FIFO por `seq`) ----
export function almacenCola(uid) {
  const n = nombreBaseUsuario(uid)
  return {
    listar: () => tx(n, crearUsuario, 'cola', 'readonly', (s) => s.index('seq').getAll()),
    poner: (item) => tx(n, crearUsuario, 'cola', 'readwrite', (s) => s.put(item)),
    borrar: (uuid) => tx(n, crearUsuario, 'cola', 'readwrite', (s) => s.delete(uuid)),
  }
}

/** Borra TODO lo local del usuario (paquete y cola) y la meta si le pertenece. */
export async function borrarTodo(uid) {
  if (!disponible() || uid == null) return
  const n = nombreBaseUsuario(uid)
  const p = conexiones.get(n)
  conexiones.delete(n)
  if (p) await p.then((db) => db.close()).catch(() => undefined)
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(n)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  const meta = await leerMeta()
  if (meta?.usuarioId === uid) await borrarMeta()
}

/** Pide almacenamiento persistente (el navegador puede negarlo; Safari puede borrar datos tras días sin uso). */
export async function pedirPersistencia() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true
    return Boolean(await navigator.storage?.persist?.())
  } catch {
    return false
  }
}
