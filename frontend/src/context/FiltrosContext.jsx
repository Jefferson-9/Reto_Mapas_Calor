import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router'
import { api } from '../api/client'
import { periodos as periodosLocales } from '../offline/respaldo'
import { conRespaldo } from '../offline/servicio'
import { useAuth } from './AuthContext'

/**
 * Filtros compartidos que viven en la barra superior (geografía encadenada y período),
 * y la configuración que cada pantalla declara para la barra (qué filtros mostrar y su acción principal).
 */
const FiltrosContext = createContext(null)
const NIVELES = ['provincia', 'canton', 'parroquia', 'barrio']

export function FiltrosProvider({ children }) {
  const { usuario } = useAuth()
  const [periodos, setPeriodos] = useState({ items: [], ultimo: null, ultima_carga_at: null })
  const [periodo, setPeriodo] = useState(null)
  const [geo, setGeo] = useState({ provincia: null, canton: null, parroquia: null, barrio: null })
  const [opciones, setOpciones] = useState({ provincia: [], canton: [], parroquia: [], barrio: [] })
  const [barra, setBarra] = useState({ geo: false, periodo: false, extra: null, accion: null })

  const { pathname } = useLocation()
  // Los períodos se refrescan al cambiar de pantalla: un período nuevo de una carga confirmada aparece sin recargar
  useEffect(() => {
    if (!usuario) return undefined
    const ctrl = new AbortController()
    // Sin conexión: el período del paquete guardado en el dispositivo
    conRespaldo(() => api.get('/periodos/', { signal: ctrl.signal }), periodosLocales)
      .then((p) => {
        setPeriodos(p)
        setPeriodo((actual) => actual || p.ultimo)
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [usuario, pathname])

  useEffect(() => {
    if (!usuario) return undefined
    const ctrl = new AbortController()
    api
      .get('/zonas/', { signal: ctrl.signal, cacheTtl: 120000 })
      .then((d) => {
        const por = { provincia: [], canton: [], parroquia: [], barrio: [] }
        d.items.forEach((z) => por[z.tipo_zona]?.push(z))
        setOpciones(por)
        // Si el ámbito tiene una sola provincia/cantón, se preselecciona
        setGeo((g) => ({ ...g, provincia: g.provincia ?? (por.provincia.length === 1 ? por.provincia[0].id : null) }))
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [usuario])

  const elegir = useCallback((nivel, id) => {
    setGeo((g) => {
      const i = NIVELES.indexOf(nivel)
      const nuevo = { ...g, [nivel]: id }
      NIVELES.slice(i + 1).forEach((n) => (nuevo[n] = null)) // filtros encadenados
      return nuevo
    })
  }, [])

  // Zona más específica elegida y nivel inmediato inferior para agregaciones
  const seleccion = useMemo(() => {
    const ultimo = [...NIVELES].reverse().find((n) => geo[n])
    const id = ultimo ? geo[ultimo] : null
    const siguiente = ultimo ? NIVELES[Math.min(NIVELES.indexOf(ultimo) + 1, 3)] : 'canton'
    return { zonaId: id, nivelZona: ultimo || null, nivelHijo: ultimo === 'barrio' ? 'barrio' : siguiente }
  }, [geo])

  const hijosDe = useCallback(
    (nivel) => {
      const i = NIVELES.indexOf(nivel)
      if (i === 0) return opciones.provincia
      const padre = geo[NIVELES[i - 1]]
      return padre ? opciones[nivel].filter((z) => z.zona_superior_id === padre) : opciones[nivel]
    },
    [opciones, geo],
  )

  const valor = useMemo(
    () => ({ periodos, periodo, setPeriodo, geo, elegir, opciones, hijosDe, seleccion, barra, setBarra }),
    [periodos, periodo, geo, elegir, opciones, hijosDe, seleccion, barra],
  )
  return <FiltrosContext.Provider value={valor}>{children}</FiltrosContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- el hook acompaña a su proveedor
export const useFiltros = () => useContext(FiltrosContext)

/**
 * Cada pantalla declara qué muestra la barra superior: filtros geográficos, período, controles extra y acción primaria.
 * Los filtros viven en la barra y no se repiten dentro de la página (sección 10.3).
 */
// eslint-disable-next-line react-refresh/only-export-components -- el hook acompaña a su proveedor
export function useBarraSuperior({ geo = false, periodo = false, extra = null, accion = null } = {}, deps = []) {
  const { setBarra } = useContext(FiltrosContext)
  useEffect(() => {
    setBarra({ geo, periodo, extra, accion })
    return () => setBarra({ geo: false, periodo: false, extra: null, accion: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la pantalla controla cuándo cambia su configuración
  }, deps)
}
