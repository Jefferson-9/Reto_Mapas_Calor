import { expect, request as nuevoRequest, test } from '@playwright/test'
import { PASSWORD, login } from './helpers'

// Fase 8 — modo campo sin conexión, con la compilación real (service worker) servida por `vite preview`.
// Se ejecuta en el proyecto «sin-conexion» (ver playwright.config.js).

const BASE = 'http://localhost:4173'
let admin

async function apiAdmin() {
  const ctx = await nuevoRequest.newContext({ baseURL: BASE })
  const r = await ctx.post('/api/v1/auth/login/', { data: { username: 'admin', password: PASSWORD } })
  expect(r.ok()).toBe(true)
  const token = (await r.json()).data.access
  await ctx.dispose()
  return nuevoRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
}
const interruptor = (valor) => admin.patch('/api/v1/parametros/', { data: { habilitar_modo_offline: valor } })
async function contarEnServidor(nombre) {
  const r = await admin.get(`/api/v1/prospectos/?q=${encodeURIComponent(nombre)}`)
  return (await r.json()).data.items.filter((p) => p.nombre_negocio === nombre).length
}

/** Lee IndexedDB sin crear bases inexistentes (abrir sin versión crearía una vacía y rompería la aplicación). */
const leerIDB = (page, base, store, clave) =>
  page.evaluate(
    async ([base, store, clave]) => {
      const dbs = await indexedDB.databases()
      if (!dbs.some((d) => d.name === base)) return null
      return new Promise((res, rej) => {
        const r = indexedDB.open(base)
        r.onsuccess = () => {
          const db = r.result
          if (!db.objectStoreNames.contains(store)) return db.close(), res(null)
          const g = clave === '*' ? db.transaction(store).objectStore(store).getAll() : db.transaction(store).objectStore(store).get(clave)
          g.onsuccess = () => (db.close(), res(g.result ?? null))
        }
        r.onerror = () => rej(r.error)
      })
    },
    [base, store, clave],
  )

/** Espera a que el service worker controle la página y a que el paquete de consulta esté guardado. */
async function prepararSinConexion(page) {
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 45_000 })
  await expect.poll(() => leerIDB(page, 'coac-campo', 'meta', 'sesion'), { timeout: 20_000 }).not.toBeNull()
  const meta = await leerIDB(page, 'coac-campo', 'meta', 'sesion')
  await expect.poll(() => leerIDB(page, `coac-campo-u${meta.usuarioId}`, 'paquete', 'actual'), { timeout: 20_000 }).not.toBeNull()
  const paquete = await leerIDB(page, `coac-campo-u${meta.usuarioId}`, 'paquete', 'actual')
  const zona = paquete.mis_zonas.items.find((i) => i.zona.centroide)
  expect(zona, 'el oficial demo debe tener zonas asignadas con centroide').toBeTruthy()
  const [lng, lat] = zona.zona.centroide
  return { uid: meta.usuarioId, lat: lat.toFixed(6), lng: lng.toFixed(6), paquete }
}

async function registrarProspecto(page, nombre, { lat, lng }) {
  await page.getByRole('link', { name: 'Posibles socios' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Posibles socios' })).toBeVisible()
  await page.getByLabel('Nombre o referencia del negocio').fill(nombre)
  await page.getByLabel('Latitud', { exact: true }).fill(lat)
  await page.getByLabel('Longitud', { exact: true }).fill(lng)
  await page.getByRole('button', { name: 'Guardar posible socio' }).click()
  await expect(page.getByText(/quedó guardado en este dispositivo/)).toBeVisible()
}

test.describe.serial('modo campo sin conexión', () => {
  test.beforeAll(async () => {
    admin = await apiAdmin()
    expect((await interruptor(true)).ok()).toBe(true)
  })
  test.afterAll(async () => {
    await interruptor(false)
    await admin.dispose()
  })

  test('abre sin conexión, registra un prospecto y al reconectar se sincroniza una sola vez', async ({ page, context }) => {
    const nombre = `E2E sin conexión ${Date.now()}`
    await login(page, 'oficial')
    const { lat, lng } = await prepararSinConexion(page)

    await context.setOffline(true)
    await page.goto('/mis-zonas') // la servidor no responde: la página la entrega el service worker
    await expect(page.getByRole('heading', { level: 1, name: 'Mis zonas' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Estado de sincronización: Sin conexión/ })).toBeVisible()
    await expect(page.getByText('Lista priorizada')).toBeVisible()
    await expect(page.locator('main li').first()).toBeVisible() // zonas desde el paquete guardado
    await expect(page.getByText('Mapa base no disponible sin conexión')).toBeVisible()

    // Lo que no es de campo aparece deshabilitado con «Requiere conexión»
    await page.goto('/panel')
    await expect(page.getByText('Requiere conexión').first()).toBeVisible()

    await registrarProspecto(page, nombre, { lat, lng })
    await expect(page.getByRole('button', { name: /Sin conexión · 1/ })).toBeVisible()
    expect(await contarEnServidor(nombre)).toBe(0)

    await context.setOffline(false)
    await expect(page.getByText(/1 registro sincronizado/)).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => contarEnServidor(nombre)).toBe(1)

    // Reintentos posteriores no duplican
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForTimeout(2500)
    expect(await contarEnServidor(nombre)).toBe(1)
  })

  test('cerrar sesión avisa si hay pendientes y borra todo lo local', async ({ page, context }) => {
    const nombre = `E2E descartado ${Date.now()}`
    await login(page, 'oficial')
    const coords = await prepararSinConexion(page)
    await context.setOffline(true)
    await registrarProspecto(page, nombre, coords)

    await page.getByRole('button', { name: /Perfil de/ }).click()
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
    await expect(page.getByRole('dialog', { name: 'Hay registros sin sincronizar' })).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar sesión y borrar' }).click()
    await expect(page).toHaveURL(/\/login/)

    const bases = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))
    expect(bases.filter((n) => n?.startsWith('coac-campo-u'))).toEqual([])
    expect(await leerIDB(page, 'coac-campo', 'meta', 'sesion')).toBeNull()

    await context.setOffline(false)
    await page.waitForTimeout(1500)
    expect(await contarEnServidor(nombre)).toBe(0)
  })

  test('ventana vencida: oculta los datos al abrir sin conexión y conserva la cola hasta iniciar sesión', async ({ page, context }) => {
    const nombre = `E2E ventana ${Date.now()}`
    await login(page, 'oficial')
    const { uid, ...coords } = await prepararSinConexion(page)
    await context.setOffline(true)
    await registrarProspecto(page, nombre, coords)

    // Simula que la última autenticación en línea fue hace 25 h (ventana por defecto: 24 h)
    await page.evaluate(
      () =>
        new Promise((res, rej) => {
          const r = indexedDB.open('coac-campo')
          r.onsuccess = () => {
            const st = r.result.transaction('meta', 'readwrite').objectStore('meta')
            const g = st.get('sesion')
            g.onsuccess = () => {
              st.put({ ...g.result, autenticadoEn: Date.now() - 25 * 3600 * 1000 }, 'sesion').onsuccess = () => res()
            }
          }
          r.onerror = () => rej(r.error)
        }),
    )
    await page.reload()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText(/Venció la ventana de 24 h/)).toBeVisible()
    await expect(page.getByText(/1 registro pendiente/)).toBeVisible()
    expect(await leerIDB(page, `coac-campo-u${uid}`, 'paquete', 'actual')).toBeNull() // datos de consulta ocultos (borrados)
    expect((await leerIDB(page, `coac-campo-u${uid}`, 'cola', '*')).length).toBe(1) // la cola se conserva

    // En la realidad, tras 24 h el refresh (12 h) ya venció en el servidor: hay que iniciar sesión con contraseña.
    // Aquí el vencimiento se simuló solo en el dispositivo, así que se quita la cookie para reproducirlo.
    await context.clearCookies()
    // Al reconectar e iniciar sesión, la cola se envía
    await context.setOffline(false)
    await page.getByLabel('Usuario').fill('oficial')
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page).not.toHaveURL(/\/login/) // vuelve a la pantalla donde estaba
    await expect(page.getByText(/1 registro sincronizado/)).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => contarEnServidor(nombre), { timeout: 30_000 }).toBe(1)
  })
})
