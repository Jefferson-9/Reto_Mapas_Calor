import { expect, test } from '@playwright/test'
import { login } from './helpers'

test.describe('acceso', () => {
  test('mensaje genérico ante credenciales inválidas o cuenta desactivada', async ({ page }) => {
    for (const [u, p] of [
      ['usuario-e2e-inexistente', 'contraseña-incorrecta'], // no consume intentos de una cuenta real (bloqueo tras 5 fallos)
      ['pvalarezo', process.env.SEED_DEMO_PASSWORD],
    ]) {
      await page.goto('/login')
      await page.getByLabel('Usuario').fill(u)
      await page.getByLabel('Contraseña', { exact: true }).fill(p)
      await page.getByRole('button', { name: 'Iniciar sesión' }).click()
      await expect(page.getByRole('alert')).toHaveText('No fue posible iniciar sesión. Verifique sus datos e intente nuevamente.')
    }
  })

  test('oficial: menú por rol, acceso denegado y función condicionada bloqueada; cierre de sesión', async ({ page }) => {
    await login(page, 'oficial')
    await page.goto('/usuarios')
    await expect(page.getByText('Acceso restringido')).toBeVisible()
    await page.goto('/visitas')
    await expect(page.getByText('Función no habilitada')).toBeVisible()
    await expect(page.getByRole('link', { name: /Usuarios y roles/ })).toHaveCount(0)
    await page.getByRole('button', { name: /Perfil de/ }).click()
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/panel')
    await expect(page).toHaveURL(/\/login/) // sin sesión tras el cierre (RF-001.03)
  })
})

test.describe.serial('panel y mapa (admin)', () => {
  let page
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
    await login(page, 'admin')
  })
  test.afterAll(() => page.close())

  test('panel con KPI reales y fecha de última carga', async () => {
    await expect(page.getByText('Cartera vigente', { exact: true })).toBeVisible()
    await expect(page.getByText(/Última carga:/).first()).toBeVisible()
    await expect(page.locator('main').getByText('Sin datos')).toHaveCount(0)
    await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible()
  })

  test('mapa: MapLibre dibuja las zonas y la tabla alternativa muestra los mismos datos', async () => {
    await page.goto('/mapa')
    const mapa = page.locator('[data-renderizadas]')
    await expect.poll(async () => Number((await mapa.getAttribute('data-renderizadas')) || 0), { timeout: 30_000 }).toBeGreaterThan(0)
    await expect(page.getByText('Concentración de socios').first()).toBeVisible()
    await page.getByRole('button', { name: 'Ver tabla' }).click()
    await expect(page.getByRole('table', { name: 'Zonas del mapa' }).getByRole('row')).toHaveCount(25) // encabezado + 24 barrios
  })

  test('navegar rápido entre pantallas no deja pantallas en blanco ni contenido duplicado', async () => {
    for (const nombre of ['Panel', 'Mapa y calor', 'Indicadores', 'Panel', 'Mapa y calor']) {
      await page.getByRole('link', { name: nombre, exact: true }).first().click()
    }
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mapa y mapa de calor')
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  })
})
