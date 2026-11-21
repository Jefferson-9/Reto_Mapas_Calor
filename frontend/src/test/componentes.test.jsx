import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { KpiCard } from '../components/charts/Kpi'
import { MapLegend } from '../components/maps/MapLegend'
import { expresionColor } from '../components/maps/mapUtils'
import { DataTable, LoadMoreFooter } from '../components/tables/DataTable'
import { instalarBrillo } from '../hooks/useSpecularHover'
import { aLngLat, desdeLngLat, fmtEntero, fmtPct, fmtUSD } from '../utils/format'
import { simularMedia } from './setup'

const fakeAuth = { puede: vi.fn(() => true), parametros: { habilitar_registro_visitas: false }, usuario: { permisos: [] } }
vi.mock('../context/AuthContext', () => ({ useAuth: () => fakeAuth }))

describe('formato', () => {
  it('ausencia de datos no es cero', () => {
    expect(fmtPct(null)).toBe('Sin datos')
    expect(fmtEntero(undefined)).toBe('Sin datos')
    expect(fmtEntero(0)).toBe('0')
    expect(fmtUSD('1500.5')).toContain('1.500,50')
  })
  it('conversión latitud/longitud ↔ [lng, lat]', () => {
    expect(aLngLat('-3.9968', '-79.2018')).toEqual([-79.2018, -3.9968])
    expect(desdeLngLat([-79.2018, -3.9968])).toEqual({ latitud: '-3.996800', longitud: '-79.201800' })
  })
})

describe('brillo especular', () => {
  const nodo = () => {
    const el = document.createElement('div')
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 })
    document.body.appendChild(el)
    return el
  }
  const evento = (tipo, pointerType, x, y) => {
    const e = new Event(tipo)
    Object.assign(e, { pointerType, clientX: x, clientY: y })
    return e
  }

  it('sigue al dedo en táctil y se apaga al soltar', async () => {
    simularMedia('(prefers-reduced-motion: reduce)', false)
    const el = nodo()
    const limpiar = instalarBrillo(el, 1)
    el.dispatchEvent(evento('pointerdown', 'touch', 40, 20))
    expect(el.dataset.spec).toBe('on')
    el.dispatchEvent(evento('pointermove', 'touch', 120, 60))
    await act(() => new Promise((r) => setTimeout(r, 40)))
    expect(el.style.getPropertyValue('--mx')).toBe('120.0px')
    el.dispatchEvent(evento('pointerup', 'touch', 120, 60))
    expect(el.dataset.spec).toBeUndefined()
    limpiar()
  })

  it('con movimiento reducido no sigue al puntero (queda centrado)', async () => {
    simularMedia('(prefers-reduced-motion: reduce)', true)
    const el = nodo()
    const limpiar = instalarBrillo(el, 1)
    el.dispatchEvent(evento('pointerenter', 'mouse', 10, 10))
    el.dispatchEvent(evento('pointermove', 'mouse', 180, 90))
    await act(() => new Promise((r) => setTimeout(r, 40)))
    expect(el.style.getPropertyValue('--mx')).toBe('100.0px')
    expect(el.style.getPropertyValue('--my')).toBe('50.0px')
    el.dispatchEvent(evento('pointerleave', 'mouse', 180, 90))
    expect(el.dataset.spec).toBeUndefined()
    limpiar()
    simularMedia('(prefers-reduced-motion: reduce)', false)
  })
})

describe('tabla y paginación', () => {
  const columnas = [
    { clave: 'nombre', titulo: 'Zona', movil: 'titulo' },
    { clave: 'v', titulo: 'Valor', alinear: 'derecha' },
  ]
  it('estados de carga, vacío y error con reintento', () => {
    const { rerender } = render(<DataTable columnas={columnas} filas={[]} cargando />)
    expect(screen.getByLabelText('Cargando')).toBeInTheDocument()
    rerender(<DataTable columnas={columnas} filas={[]} />)
    expect(screen.getByText('No hay registros')).toBeInTheDocument()
    const reintentar = vi.fn()
    rerender(<DataTable columnas={columnas} filas={[]} error={{ message: 'Falló' }} alReintentar={reintentar} />)
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }))
    expect(reintentar).toHaveBeenCalled()
  })
  it('muestra filas y «Ver más» con conteo', () => {
    const verMas = vi.fn()
    render(
      <>
        <DataTable columnas={columnas} filas={[{ id: 1, nombre: 'Jipiro', v: 3 }]} etiqueta="Zonas" />
        <LoadMoreFooter mostrando={1} total={20} hayMas alVerMas={verMas} />
      </>,
    )
    expect(screen.getByRole('table', { name: 'Zonas' })).toHaveTextContent('Jipiro')
    fireEvent.click(screen.getByRole('button', { name: /ver más \(mostrando 1 de 20\)/i }))
    expect(verMas).toHaveBeenCalled()
  })
})

describe('KPI y leyenda del mapa', () => {
  it('KPI sin datos lo indica en vez de 0', () => {
    render(<KpiCard etiqueta="Tasa de morosidad" valor={null} formato={fmtPct} pie="x" pieValor="y" />)
    expect(screen.getAllByText('Sin datos').length).toBeGreaterThan(0)
  })
  it('la expresión del mapa usa los mismos cortes que la leyenda', () => {
    const leyenda = [
      { desde: 0, hasta: 10, color: '#a' },
      { desde: 10, hasta: 20, color: '#b' },
    ]
    const exp = expresionColor(leyenda)
    expect(exp[3]).toEqual(['step', ['to-number', ['get', 'valor']], '#a', 10, '#b'])
    render(<MapLegend titulo="Socios" leyenda={leyenda} formato={(v) => String(v)} />)
    expect(screen.getByText('0 – 10')).toBeInTheDocument()
    expect(screen.getByText('Sin datos')).toBeInTheDocument()
  })
})

describe('rutas protegidas y navegación', () => {
  it('niega el acceso sin permiso y bloquea funciones condicionadas', async () => {
    const { Protegida } = await import('../app/Protegida')
    fakeAuth.puede.mockReturnValueOnce(false)
    const { rerender } = render(
      <Protegida permisos={['usuarios.gestionar']}>
        <p>secreto</p>
      </Protegida>,
    )
    expect(screen.getByText('Acceso restringido')).toBeInTheDocument()
    expect(screen.queryByText('secreto')).not.toBeInTheDocument()
    rerender(
      <Protegida permisos={['visitas.registrar']} interruptor="habilitar_registro_visitas">
        <p>secreto</p>
      </Protegida>,
    )
    expect(screen.getByText('Función no habilitada')).toBeInTheDocument()
    rerender(
      <Protegida permisos={['panel.ver']}>
        <p>contenido</p>
      </Protegida>,
    )
    expect(screen.getByText('contenido')).toBeInTheDocument()
  })

  it('la barra lateral se expande y contrae de forma accesible', async () => {
    const { FloatingSidebar } = await import('../components/layout/Navegacion')
    render(
      <MemoryRouter initialEntries={['/panel']}>
        <FloatingSidebar />
      </MemoryRouter>,
    )
    const boton = screen.getByRole('button', { name: 'Expandir navegación' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(boton)
    expect(screen.getByRole('button', { name: 'Contraer navegación' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Registro de visitas.*no habilitado/)).toBeInTheDocument()
  })
})
