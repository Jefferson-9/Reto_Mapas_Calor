import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useApi } from '../hooks/useApi'

// jsdom no tiene WebGL: MapLibre se simula; el renderizado real se verifica en E2E
vi.mock('maplibre-gl', () => ({ setWorkerUrl: vi.fn(), Map: vi.fn(), NavigationControl: vi.fn() }))
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({ default: 'worker.js' }))

describe('useApi', () => {
  it('cancela la solicitud obsoleta y solo muestra el último resultado', async () => {
    const señales = []
    const fetcher = vi.fn((valor) => (signal) => {
      señales.push(signal)
      return new Promise((r) => setTimeout(() => r(valor), valor === 'lento' ? 60 : 5))
    })
    const { result, rerender } = renderHook(({ v }) => useApi(fetcher(v), [v]), { initialProps: { v: 'lento' } })
    rerender({ v: 'rapido' })
    await waitFor(() => expect(result.current.data).toBe('rapido'))
    expect(señales[0].aborted).toBe(true)
    await new Promise((r) => setTimeout(r, 80))
    expect(result.current.data).toBe('rapido')
  })

  it('expone error y permite reintentar', async () => {
    let falla = true
    const { result } = renderHook(() => useApi(() => (falla ? Promise.reject(new Error('x')) : Promise.resolve(7)), []))
    await waitFor(() => expect(result.current.error).toBeTruthy())
    falla = false
    act(() => result.current.recargar())
    await waitFor(() => expect(result.current.data).toBe(7))
  })
})

describe('GeoMap', () => {
  it('sin WebGL muestra la alternativa tabular', async () => {
    const { GeoMap } = await import('../components/maps/GeoMap')
    HTMLCanvasElement.prototype.getContext = () => null
    render(<GeoMap fallback={<p>Use la tabla</p>} />)
    expect(screen.getByText('Use la tabla')).toBeInTheDocument()
  })
})
