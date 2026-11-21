import { defineConfig, devices } from '@playwright/test'

// Se ejecuta con: docker compose --profile e2e run --rm e2e
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // el login tiene límite de tasa: ejecución en serie
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://frontend:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-EC',
    timezoneId: 'America/Guayaquil',
  },
  // Modo campo sin conexión (Fase 8): el service worker solo existe en la compilación de producción,
  // así que esas pruebas usan `vite preview` (mismo proxy a /api) levantado dentro del contenedor e2e.
  webServer: {
    command: 'npx vite build --outDir /tmp/dist-pwa --emptyOutDir --logLevel warn && npx vite preview --outDir /tmp/dist-pwa --port 4173 --strictPort',
    url: 'http://localhost:4173',
    env: { VITE_API_PROXY_TARGET: process.env.E2E_API_TARGET || 'http://backend:8000' },
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } }, testIgnore: /sin-conexion/ },
    { name: 'sin-conexion', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 }, baseURL: 'http://localhost:4173', serviceWorkers: 'allow' }, testMatch: /sin-conexion/ },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: false }, testMatch: /responsive/ },
    { name: 'movil', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }, testMatch: /responsive/ },
  ],
})
