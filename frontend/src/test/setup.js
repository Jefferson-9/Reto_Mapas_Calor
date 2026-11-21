import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => cleanup())

// jsdom no implementa matchMedia, ResizeObserver ni WebGL: se simulan
const consultas = { '(prefers-reduced-motion: reduce)': false }
export function simularMedia(query, valor) {
  consultas[query] = valor
}
window.matchMedia = vi.fn((q) => ({
  matches: Boolean(consultas[q]),
  media: q,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
}))
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.scrollTo = vi.fn()
if (!globalThis.requestAnimationFrame) globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
