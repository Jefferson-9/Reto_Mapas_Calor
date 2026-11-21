import { expect } from '@playwright/test'

// Contraseña de las cuentas demo locales (variable SEED_DEMO_PASSWORD del .env; nunca versionada)
export const PASSWORD = process.env.SEED_DEMO_PASSWORD

export async function login(page, usuario, password = PASSWORD) {
  if (!password) throw new Error('Defina SEED_DEMO_PASSWORD en .env para las pruebas E2E')
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(usuario)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/panel/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

export async function sinScrollHorizontal(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
}

/** Controles interactivos visibles con área menor a 44×44 px (criterio táctil). */
export async function controlesPequenos(page) {
  return page.evaluate(() => {
    const sel = 'button, [role="button"], [role="radio"], nav a, header a, input:not([type="hidden"]), select'
    return [...document.querySelectorAll(sel)]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        const st = getComputedStyle(el)
        return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && r.bottom > 0 && r.top < window.innerHeight && !el.closest('[aria-hidden="true"]')
      })
      .filter((el) => {
        // casillas y radios: el objetivo táctil es su etiqueta
        const objetivo = el.matches('input[type="checkbox"], input[type="radio"]') ? el.closest('label') || el : el
        const r = objetivo.getBoundingClientRect()
        return r.height < 43.5 || r.width < 43.5
      })
      .map((el) => `${el.tagName.toLowerCase()} «${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}» ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`)
  })
}
