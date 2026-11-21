import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'

/**
 * Obtiene datos con cancelación (AbortController) para evitar condiciones de carrera.
 * fetcher(signal) => Promise. `deps` define cuándo se vuelve a pedir; mientras llega la respuesta
 * se conservan los datos anteriores (permite un fundido cruzado sin pantallas en blanco).
 */
export function useApi(fetcher, deps = [], { enabled = true } = {}) {
  const [version, setVersion] = useState(0)
  const clave = JSON.stringify([deps, version])
  const [res, setRes] = useState({ clave: null, data: undefined, error: null })
  const ejecutar = useEffectEvent((signal) => fetcher(signal))

  useEffect(() => {
    if (!enabled) return undefined
    const ctrl = new AbortController()
    ejecutar(ctrl.signal)
      .then((data) => {
        if (!ctrl.signal.aborted) setRes({ clave, data, error: null })
      })
      .catch((error) => {
        if (error?.name !== 'AbortError' && !ctrl.signal.aborted) setRes((r) => ({ clave, data: r.data, error }))
      })
    return () => ctrl.abort()
  }, [clave, enabled])

  const recargar = useCallback(() => setVersion((v) => v + 1), [])
  const mutar = useCallback((fn) => setRes((r) => ({ ...r, data: typeof fn === 'function' ? fn(r.data) : fn })), [])
  const vigente = res.clave === clave
  return { data: res.data, error: vigente ? res.error : null, cargando: enabled && !vigente, recargar, mutar }
}

export function useDebounce(valor, ms = 250) {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return v
}

/**
 * Lista paginada por cursor con «Ver más»: agrega páginas sin duplicar filas ni perder el scroll.
 * fetchPage({cursor, signal}) => {items, next_cursor, has_more, total_count}
 */
export function useCursorList(fetchPage, deps = [], { idKey = 'id' } = {}) {
  const idDe = useMemo(() => (typeof idKey === 'function' ? idKey : (i) => i[idKey]), [idKey])
  const [version, setVersion] = useState(0)
  const clave = JSON.stringify([deps, version])
  const [res, setRes] = useState({ clave: null, items: [], cursor: null, hasMore: false, total: null, error: null })
  const [cargandoMas, setCargandoMas] = useState(false)
  const pedir = useEffectEvent((args) => fetchPage(args))
  const ultimoFetch = useRef(fetchPage)
  useEffect(() => {
    ultimoFetch.current = fetchPage
  })

  useEffect(() => {
    const ctrl = new AbortController()
    pedir({ cursor: null, signal: ctrl.signal })
      .then((p) => {
        if (!ctrl.signal.aborted) setRes({ clave, items: p.items, cursor: p.next_cursor, hasMore: p.has_more, total: p.total_count ?? p.items.length, error: null })
      })
      .catch((error) => {
        if (error?.name !== 'AbortError' && !ctrl.signal.aborted) setRes({ clave, items: [], cursor: null, hasMore: false, total: null, error })
      })
    return () => ctrl.abort()
  }, [clave])

  const vigente = res.clave === clave
  const verMas = useCallback(async () => {
    if (!res.cursor || cargandoMas) return
    setCargandoMas(true)
    try {
      const p = await ultimoFetch.current({ cursor: res.cursor, signal: undefined })
      setRes((r) => {
        const vistos = new Set(r.items.map(idDe))
        return { ...r, items: [...r.items, ...p.items.filter((i) => !vistos.has(idDe(i)))], cursor: p.next_cursor, hasMore: p.has_more }
      })
    } catch (error) {
      setRes((r) => ({ ...r, error }))
    } finally {
      setCargandoMas(false)
    }
  }, [res.cursor, cargandoMas, idDe])

  const recargar = useCallback(() => setVersion((v) => v + 1), [])
  const actualizarItem = useCallback((id, fn) => setRes((r) => ({ ...r, items: r.items.map((i) => (idDe(i) === id ? fn(i) : i)) })), [idDe])
  return {
    items: vigente ? res.items : [],
    total: vigente ? res.total : null,
    hasMore: vigente && res.hasMore,
    cargando: !vigente,
    cargandoMas,
    error: vigente ? res.error : null,
    verMas,
    recargar,
    actualizarItem,
  }
}

export function useMediaQuery(query) {
  const [m, setM] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false))
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return undefined
    const h = () => setM(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [query])
  return m
}
