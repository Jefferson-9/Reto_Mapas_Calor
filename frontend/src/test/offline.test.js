import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { almacenCola, borrarTodo, guardarMeta, guardarPaquete, leerMeta, leerPaquete } from '../offline/almacen'
import { crearCola, ESTADOS, retroceso, RETENCION_SINCRONIZADOS_MS } from '../offline/cola'
import { contiene, rutas, sugerirOrden, zonaPorPunto } from '../offline/respaldo'

/** Almacén en memoria con la misma interfaz que el de IndexedDB. */
function memoria() {
  const m = new Map()
  return {
    m,
    listar: async () => [...m.values()].map((i) => structuredClone(i)),
    poner: async (i) => void m.set(i.client_uuid, structuredClone(i)),
    borrar: async (u) => void m.delete(u),
  }
}

function montar({ enviar = vi.fn(), t0 = 1_000_000 } = {}) {
  let ahora = t0
  let n = 0
  const almacen = memoria()
  const cola = crearCola({ almacen, enviar, uuid: () => `u-${++n}`, ahora: () => ahora, azar: () => 0.5 })
  return { cola, almacen, enviar, avanzar: (ms) => (ahora += ms), reloj: () => ahora }
}
const sinConexion = () => Object.assign(new Error('Sin conexión'), { status: 0, code: 'SIN_CONEXION' })
const okPara = (items) => ({ resultados: items.map((i) => ({ client_uuid: i.client_uuid, tipo: i.tipo, estado: 'sincronizado', id: 1, duplicado: false })) })

describe('cola de salida (outbox)', () => {
  it('encola en orden FIFO con estado pendiente, hora del cliente y sin intentos', async () => {
    const { cola } = montar()
    await cola.encolar('prospecto', { nombre_negocio: 'A' })
    await cola.encolar('ruta', { nombre: 'R' })
    await cola.encolar('prospecto', { nombre_negocio: 'B' }, { client_uuid: 'fijo', client_created_at: '2026-11-18T10:00:00-05:00' })
    const items = await cola.listar()
    expect(items.map((i) => i.seq)).toEqual([1, 2, 3])
    expect(items.map((i) => i.tipo)).toEqual(['prospecto', 'ruta', 'prospecto'])
    expect(items.every((i) => i.estado === ESTADOS.PENDIENTE && i.intentos === 0 && i.error === null)).toBe(true)
    expect(items[2]).toMatchObject({ client_uuid: 'fijo', client_created_at: '2026-11-18T10:00:00-05:00' })
    await expect(cola.encolar('socio', {})).rejects.toThrow(/no admitido/)
  })

  it('guardar dos veces el mismo formulario (mismo client_uuid) no duplica', async () => {
    const { cola } = montar()
    await cola.encolar('prospecto', { nombre_negocio: 'A' }, { client_uuid: 'x' })
    await cola.encolar('prospecto', { nombre_negocio: 'A' }, { client_uuid: 'x' })
    expect(await cola.listar()).toHaveLength(1)
  })

  it('envía en orden y marca cada elemento según la respuesta del servidor (rechazo parcial no bloquea)', async () => {
    const enviar = vi.fn(async (items) => ({
      resultados: items.map((i, k) =>
        k === 1 ? { client_uuid: i.client_uuid, estado: 'rechazado', codigo: 'FUERA_DE_ZONA', mensaje: 'Fuera de zona', detalles: [{ campo: 'ubicacion', mensaje: 'x' }] } : { client_uuid: i.client_uuid, estado: 'sincronizado', id: 10 + k },
      ),
    }))
    const { cola } = montar({ enviar })
    for (const n of ['A', 'B', 'C']) await cola.encolar('prospecto', { nombre_negocio: n })
    const r = await cola.sincronizar()
    expect(r).toMatchObject({ resultado: 'ok', enviados: 3, sincronizados: 2, rechazados: 1 })
    expect(enviar.mock.calls[0][0].map((i) => i.datos.nombre_negocio)).toEqual(['A', 'B', 'C'])
    expect(Object.keys(enviar.mock.calls[0][0][0]).sort()).toEqual(['client_created_at', 'client_uuid', 'datos', 'tipo'])
    const items = await cola.listar()
    expect(items.map((i) => i.estado)).toEqual(['sincronizado', 'rechazado', 'sincronizado'])
    expect(items[1].error).toEqual({ codigo: 'FUERA_DE_ZONA', mensaje: 'Fuera de zona', detalles: [{ campo: 'ubicacion', mensaje: 'x' }] })
    expect(items[2].servidor_id).toBe(12)
  })

  it('sin conexión: vuelve a pendiente, cuenta el intento y aplica retroceso exponencial', async () => {
    const enviar = vi.fn().mockRejectedValue(sinConexion())
    const { cola, avanzar, reloj } = montar({ enviar })
    await cola.encolar('prospecto', { nombre_negocio: 'A' })
    expect((await cola.sincronizar()).resultado).toBe('sin_conexion')
    let [i] = await cola.listar()
    expect(i).toMatchObject({ estado: 'pendiente', intentos: 1 })
    expect(i.proximo_intento - reloj()).toBe(retroceso(1, { azar: () => 0.5 }))
    // antes del plazo no se reintenta (salvo «Sincronizar ahora»)
    expect((await cola.sincronizar()).resultado).toBe('nada')
    expect(enviar).toHaveBeenCalledTimes(1)
    avanzar(2000)
    await cola.sincronizar()
    ;[i] = await cola.listar()
    expect(i.intentos).toBe(2)
    expect(i.proximo_intento - reloj()).toBe(retroceso(2, { azar: () => 0.5 }))
    await cola.sincronizar({ forzar: true })
    expect(enviar).toHaveBeenCalledTimes(3)
  })

  it('retroceso: 2 s, 4 s, 8 s… con tope de 5 minutos y variación acotada', () => {
    const fijo = { azar: () => 0.5 }
    expect([1, 2, 3, 4].map((n) => retroceso(n, fijo))).toEqual([2000, 4000, 8000, 16000])
    expect(retroceso(30, fijo)).toBe(300000)
    expect(retroceso(1, { azar: () => 0 })).toBe(1600)
    expect(retroceso(1, { azar: () => 1 })).toBe(2400)
  })

  it('sesión vencida (401): conserva todo sin contar el intento; cuenta desactivada o sin permisos: pide borrar', async () => {
    const enviar = vi.fn().mockRejectedValueOnce(Object.assign(new Error('x'), { status: 401, code: 'TOKEN_INVALIDO' }))
    const { cola } = montar({ enviar })
    await cola.encolar('prospecto', { nombre_negocio: 'A' })
    expect((await cola.sincronizar()).resultado).toBe('requiere_sesion')
    expect((await cola.listar())[0]).toMatchObject({ estado: 'pendiente', intentos: 0 })
    enviar.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 401, code: 'USUARIO_DESACTIVADO' }))
    expect((await cola.sincronizar({ forzar: true })).resultado).toBe('borrar')
    enviar.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 403, code: 'SIN_PERMISO' }))
    expect((await cola.sincronizar({ forzar: true })).resultado).toBe('borrar')
  })

  it('error temporal por elemento: se reintenta con retroceso; respuesta incompleta no pierde elementos', async () => {
    const enviar = vi.fn(async (items) => ({ resultados: [{ client_uuid: items[0].client_uuid, estado: 'error', mensaje: 'No se pudo procesar' }] }))
    const { cola } = montar({ enviar })
    await cola.encolar('prospecto', { nombre_negocio: 'A' })
    await cola.encolar('prospecto', { nombre_negocio: 'B' })
    await cola.sincronizar()
    const items = await cola.listar()
    expect(items.map((i) => [i.estado, i.intentos])).toEqual([
      ['pendiente', 1],
      ['pendiente', 1],
    ])
  })

  it('un solo envío a la vez: llamadas simultáneas comparten el ciclo (no duplica)', async () => {
    let soltar
    const enviar = vi.fn(
      (items) =>
        new Promise((res) => {
          soltar = () => res(okPara(items))
        }),
    )
    const { cola } = montar({ enviar })
    await cola.encolar('prospecto', { nombre_negocio: 'A' })
    const a = cola.sincronizar()
    const b = cola.sincronizar({ forzar: true })
    await vi.waitFor(() => expect(soltar).toBeTypeOf('function'))
    expect((await cola.listar())[0].estado).toBe('enviando')
    soltar()
    expect(await a).toBe(await b)
    expect(enviar).toHaveBeenCalledTimes(1)
  })

  it('recupera los que quedaron «enviando» tras cerrar la aplicación y envía en lotes', async () => {
    const enviar = vi.fn(async (items) => okPara(items))
    const almacen = memoria()
    const cola = crearCola({ almacen, enviar, uuid: (() => { let n = 0; return () => `u${++n}` })(), tamLote: 2 })
    for (const n of ['A', 'B', 'C']) await cola.encolar('prospecto', { nombre_negocio: n })
    const primero = (await cola.listar())[0]
    await almacen.poner({ ...primero, estado: 'enviando' })
    expect(await cola.recuperar()).toBe(1)
    await cola.sincronizar()
    expect(enviar.mock.calls.map((c) => c[0].length)).toEqual([2, 1])
  })

  it('corregir un rechazado lo devuelve a pendiente con el mismo client_uuid; descartar lo elimina', async () => {
    const enviar = vi.fn(async (items) => ({ resultados: items.map((i) => ({ client_uuid: i.client_uuid, estado: 'rechazado', codigo: 'VALIDACION', mensaje: 'x' })) }))
    const { cola } = montar({ enviar })
    const it1 = await cola.encolar('prospecto', { nombre_negocio: 'A', latitud: '1' })
    await cola.sincronizar()
    // guardar de nuevo el formulario corregido (mismo uuid) corrige el rechazado
    await cola.encolar('prospecto', { nombre_negocio: 'A', latitud: '2' }, { client_uuid: it1.client_uuid })
    let [i] = await cola.listar()
    expect(i).toMatchObject({ client_uuid: it1.client_uuid, estado: 'pendiente', intentos: 0, error: null, datos: { latitud: '2' } })
    await cola.descartar(it1.client_uuid)
    ;[i] = await cola.listar()
    expect(i).toBeUndefined()
  })

  it('borra del dispositivo los sincronizados tras el tiempo de retención', async () => {
    const enviar = vi.fn(async (items) => okPara(items))
    const { cola, avanzar } = montar({ enviar })
    await cola.encolar('prospecto', { nombre_negocio: 'A' })
    await cola.sincronizar()
    expect(await cola.limpiarSincronizados()).toBe(0)
    avanzar(RETENCION_SINCRONIZADOS_MS)
    expect(await cola.limpiarSincronizados()).toBe(1)
    expect(await cola.listar()).toHaveLength(0)
  })

  it('notifica a los suscriptores cada cambio de estado', async () => {
    const { cola } = montar({ enviar: vi.fn(async (items) => okPara(items)) })
    const visto = []
    cola.suscribir((items) => visto.push(items.map((i) => i.estado).join()))
    await cola.encolar('prospecto', { nombre_negocio: 'A' })
    await cola.sincronizar()
    expect(visto).toEqual(['pendiente', 'enviando', 'sincronizado'])
  })
})

describe('almacenamiento local (IndexedDB) por usuario', () => {
  it('guarda paquete, cola y meta por usuario y los borra todos al cerrar sesión', async () => {
    await guardarPaquete(7, { periodo: '2026-10', vence_en: '2099-01-01T00:00:00Z' })
    await guardarPaquete(8, { periodo: '2026-09' })
    await almacenCola(7).poner({ client_uuid: 'a', seq: 2 })
    await almacenCola(7).poner({ client_uuid: 'b', seq: 1 })
    await guardarMeta({ usuarioId: 7, autenticadoEn: 1 })
    expect((await almacenCola(7).listar()).map((i) => i.client_uuid)).toEqual(['b', 'a']) // FIFO por seq
    expect((await leerPaquete(7)).periodo).toBe('2026-10')
    await borrarTodo(7)
    expect(await leerPaquete(7)).toBeUndefined()
    expect(await almacenCola(7).listar()).toEqual([])
    expect(await leerMeta()).toBeUndefined()
    expect((await leerPaquete(8)).periodo).toBe('2026-09') // los datos de otro usuario no se tocan
  })
})

describe('respaldo sin conexión', () => {
  const cuadro = (x, y, d = 0.01) => ({ type: 'Polygon', coordinates: [[[x - d, y - d], [x + d, y - d], [x + d, y + d], [x - d, y + d], [x - d, y - d]]] })
  const paquete = {
    periodo: '2026-10',
    mis_zonas: {
      items: [
        { zona: { id: 1, codigo: 'B1', nombre: 'Barrio 1', centroide: [-79.21, -3.99] }, categoria: { prioridad: 2 }, indicadores: { tasa_morosidad: '5' } },
        { zona: { id: 2, codigo: 'B2', nombre: 'Barrio 2', centroide: [-79.19, -3.99] }, categoria: { prioridad: 1 }, indicadores: { tasa_morosidad: '1' } },
        { zona: { id: 3, codigo: 'B3', nombre: 'Barrio 3', centroide: null }, categoria: { prioridad: 2 }, indicadores: { tasa_morosidad: '9' } },
      ],
    },
    poligonos: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: cuadro(-79.21, -3.99), properties: { id: 1, codigo: 'B1', nombre: 'Barrio 1' } }] },
    rutas: [{ id: 5, nombre: 'Servidor', detalles: [] }],
  }

  it('valida el punto contra los polígonos de mis zonas (aproximado) y respeta los huecos', () => {
    expect(zonaPorPunto(paquete, '-3.9905', '-79.2105')).toMatchObject({ en_ambito: true, aproximado: true, zona: { codigo: 'B1' } })
    expect(zonaPorPunto(paquete, '-3.7', '-79.7')).toMatchObject({ en_ambito: false, aproximado: true })
    expect(zonaPorPunto({ ...paquete, poligonos: { features: [] } }, '-3.7', '-79.7')).toMatchObject({ sin_verificar: true })
    const conHueco = { type: 'Polygon', coordinates: [...cuadro(0, 0, 2).coordinates, ...cuadro(0, 0, 1).coordinates] }
    expect(contiene(conHueco, [1.5, 1.5])).toBe(true)
    expect(contiene(conHueco, [0, 0])).toBe(false)
  })

  it('orden sugerido local igual al del servidor y rutas de la cola antes que las del servidor', () => {
    expect(sugerirOrden(paquete, [1, 2, 3]).zona_ids).toEqual([2, 3, 1])
    const cola = [{ tipo: 'ruta', estado: 'pendiente', client_uuid: 'q', client_created_at: 'x', datos: { nombre: 'Local', fecha_prevista: '2026-11-25', zona_ids: [2, 1] } }, { tipo: 'ruta', estado: 'sincronizado', client_uuid: 'z', datos: {} }]
    const r = rutas(paquete, cola).items
    expect(r.map((x) => x.id)).toEqual(['local-q', 5])
    expect(r[0].detalles.map((d) => [d.orden, d.zona])).toEqual([
      [1, 'Barrio 2'],
      [2, 'Barrio 1'],
    ])
  })
})
