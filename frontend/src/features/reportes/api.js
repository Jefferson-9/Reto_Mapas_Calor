import { descargar } from '../../api/client'

/** CU-19: el reporte se genera con POST (los filtros no viajan en la URL) y se descarga sin exponer el token. */
export const reportesApi = {
  generar: ({ tipo, nivel, periodo, formato, padre }) => descargar('/reportes/', { method: 'POST', body: { tipo, nivel, periodo, formato, padre: padre ?? null } }),
}
