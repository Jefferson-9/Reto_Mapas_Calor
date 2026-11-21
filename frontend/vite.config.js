import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const proxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Modo campo sin conexión (Fase 8). vite-plugin-pwa 2.x declara compatibilidad con Vite 8 (peerDependencies).
    // El service worker se registra desde la aplicación SOLO si `habilitar_modo_offline` está encendido.
    VitePWA({
      injectRegister: false,
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      devOptions: { enabled: false },
      includeAssets: ['logo-icono.png'],
      manifest: {
        name: 'Mapas de calor · COAC Padre Julián Lorente',
        short_name: 'COAC Campo',
        description: 'Plataforma de análisis geoespacial y trabajo de campo de la COAC Padre Julián Lorente',
        lang: 'es-EC',
        start_url: '/mis-zonas',
        scope: '/',
        display: 'standalone',
        background_color: '#f6f1e6',
        theme_color: '#f6f1e6',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        cacheId: 'coac',
        // Solo archivos estáticos de la compilación. NUNCA respuestas de la API (no hay runtimeCaching).
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // MapLibre y su worker
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  // MapLibre carga su worker como módulo con imports relativos: no se pre-empaqueta
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
  server: {
    host: true,
    port: 5173,
    // 'frontend' es el nombre del servicio en Compose (pruebas E2E dentro de la red de Docker)
    allowedHosts: ['localhost', '127.0.0.1', 'frontend'],
    // Montaje de carpeta de Windows en contenedor Linux: el sondeo garantiza el hot reload
    watch: process.env.VITE_USE_POLLING === '1' ? { usePolling: true, interval: 300 } : undefined,
    proxy: {
      // Mismo origen para frontend y API en desarrollo (cookie del refresh con SameSite=Strict)
      '/api': { target: proxyTarget, changeOrigin: false, xfwd: true },
    },
  },
  // `vite preview` (pruebas E2E del modo sin conexión con la compilación real) usa el mismo proxy a /api
  preview: {
    host: true,
    port: 4173,
    allowedHosts: ['localhost', '127.0.0.1', 'frontend', 'e2e'],
    proxy: { '/api': { target: proxyTarget, changeOrigin: false, xfwd: true } },
  },
  build: {
    sourcemap: false,
    // MapLibre es grande por naturaleza; se carga solo en las rutas con mapa (división por ruta)
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
    include: ['src/**/*.test.{js,jsx}'],
  },
})
