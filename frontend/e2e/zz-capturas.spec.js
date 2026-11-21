import { test } from '@playwright/test'
import { login } from './helpers'
test('capturas', async ({ browser }) => {
  const sets = [['admin', { width: 1440, height: 900 }, false, ['/panel', '/clasificacion', '/datos/cargas', '/usuarios']], ['oficial', { width: 390, height: 844 }, true, ['/mis-zonas', '/rutas']]]
  for (const [u, vp, movil, rutas] of sets) {
    const page = await browser.newPage({ viewport: vp, isMobile: movil, hasTouch: movil })
    await login(page, u)
    for (const r of rutas) {
      await page.goto(r)
      await page.waitForTimeout(3500)
      await page.screenshot({ path: `test-results/capturas/${u}${r.replaceAll('/', '_')}.png` })
    }
    await page.close()
  }
})
