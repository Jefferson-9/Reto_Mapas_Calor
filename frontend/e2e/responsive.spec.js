import { expect, test } from '@playwright/test'
import { controlesPequenos, login, sinScrollHorizontal } from './helpers'

const PANTALLAS = ['/panel', '/mapa', '/indicadores', '/clasificacion', '/datos/cargas', '/historial', '/usuarios']

test.describe.serial('responsive (móvil, tablet y escritorio)', () => {
  let page
  test.beforeAll(async ({ browser }, info) => {
    page = await browser.newPage(info.project.use)
    await login(page, 'admin')
  })
  test.afterAll(() => page.close())

  for (const ruta of PANTALLAS) {
    test(`${ruta}: sin scroll horizontal de página`, async ({ browserName: _navegador }, info) => {
      await page.goto(ruta)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.waitForTimeout(1200) // fin de la coreografía de ensamblado
      expect(await sinScrollHorizontal(page)).toBe(true)
      if (info.project.name !== 'escritorio') {
        const pequenos = await controlesPequenos(page)
        expect(pequenos, `Controles táctiles < 44 px en ${ruta}:\n${pequenos.join('\n')}`).toEqual([])
      }
    })
  }

  test('navegación adaptada al tamaño', async ({ browserName: _navegador }, info) => {
    await page.goto('/panel')
    if (info.project.name === 'movil') {
      await expect(page.getByRole('button', { name: 'Más' })).toBeVisible()
      await page.getByRole('button', { name: 'Abrir filtros' }).click()
      await expect(page.getByRole('dialog', { name: 'Filtros' })).toBeVisible()
    } else {
      await expect(page.getByRole('button', { name: /Expandir navegación|Contraer navegación/ })).toBeVisible()
    }
  })
})
