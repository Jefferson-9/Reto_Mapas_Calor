// Modelo del formulario de criterios (CU-11): esquema zod, valores iniciales y conversión al contrato del backend.
// La validación de consistencia (contradicciones, solapamientos) es del servidor: POST /criterios/validar/.
import { z } from 'zod'

const NUM = /^-?\d+([.,]\d+)?$/
export const esNumero = (s) => NUM.test(String(s ?? '').trim())
const aNumero = (s) => Number(String(s).trim().replace(',', '.'))

export const reglaVacia = () => ({ variable: 'tasa_morosidad', operador: '>=', umbral: '', umbral_min: '', umbral_max: '' })
export const categoriaVacia = (prioridad = 1) => ({ nombre: '', color_hex: '#1F70C4', prioridad: String(prioridad), frecuencia_visita_dias: '', descripcion: '', reglas: [reglaVacia()] })
export const versionVacia = () => ({ nota: '', categorias: [categoriaVacia(1)] })

/** Copia una versión existente como punto de partida (plantilla). */
export const desdeVersion = (v) => ({
  nota: `Basada en la versión ${v.version}`,
  categorias: v.categorias.map((c) => ({
    nombre: c.nombre,
    color_hex: (c.color_hex || '#1F70C4').toUpperCase(),
    prioridad: String(c.prioridad),
    frecuencia_visita_dias: c.frecuencia_visita_dias == null ? '' : String(c.frecuencia_visita_dias),
    descripcion: c.descripcion || '',
    reglas: (c.reglas || []).map((r) =>
      r.operador === 'entre' && Array.isArray(r.umbral)
        ? { variable: r.variable, operador: r.operador, umbral: '', umbral_min: String(r.umbral[0]), umbral_max: String(r.umbral[1]) }
        : { variable: r.variable, operador: r.operador, umbral: String(r.umbral), umbral_min: '', umbral_max: '' },
    ),
  })),
})

const regla = z
  .object({ variable: z.string().min(1, 'Elija una variable.'), operador: z.string().min(1, 'Elija un operador.'), umbral: z.string(), umbral_min: z.string(), umbral_max: z.string() })
  .superRefine((r, ctx) => {
    if (r.operador === 'entre') {
      if (!esNumero(r.umbral_min)) ctx.addIssue({ code: 'custom', path: ['umbral_min'], message: r.umbral_min.trim() ? 'Ingrese un número válido.' : 'Indique el mínimo.' })
      if (!esNumero(r.umbral_max)) ctx.addIssue({ code: 'custom', path: ['umbral_max'], message: r.umbral_max.trim() ? 'Ingrese un número válido.' : 'Indique el máximo.' })
      if (esNumero(r.umbral_min) && esNumero(r.umbral_max) && !(aNumero(r.umbral_min) < aNumero(r.umbral_max)))
        ctx.addIssue({ code: 'custom', path: ['umbral_max'], message: 'El máximo debe ser mayor que el mínimo.' })
    } else if (!esNumero(r.umbral)) {
      ctx.addIssue({ code: 'custom', path: ['umbral'], message: r.umbral.trim() ? 'Ingrese un número válido.' : 'Indique el umbral.' })
    }
  })

const categoria = z.object({
  nombre: z.string().trim().min(1, 'Escriba el nombre de la categoría.').max(80, 'Máximo 80 caracteres.'),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use un color con el formato #RRGGBB.'),
  prioridad: z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= 1, 'La prioridad debe ser un entero mayor o igual a 1.'),
  frecuencia_visita_dias: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1), 'Use un número entero de días (1 o más) o déjelo vacío.'),
  descripcion: z.string().max(300, 'Máximo 300 caracteres.'),
  reglas: z.array(regla).min(1, 'Agregue al menos una regla.'),
})

export const esquemaCriterios = z
  .object({ nota: z.string().max(300, 'Máximo 300 caracteres.'), categorias: z.array(categoria).min(1, 'Defina al menos una categoría.') })
  .superRefine((v, ctx) => {
    const nombres = new Map()
    const prioridades = new Map()
    v.categorias.forEach((c, i) => {
      const n = c.nombre.trim().toLowerCase()
      if (n && nombres.has(n)) ctx.addIssue({ code: 'custom', path: ['categorias', i, 'nombre'], message: `Nombre repetido con la categoría ${nombres.get(n) + 1}.` })
      else if (n) nombres.set(n, i)
      const p = c.prioridad.trim()
      if (p && prioridades.has(p)) ctx.addIssue({ code: 'custom', path: ['categorias', i, 'prioridad'], message: `Prioridad repetida con la categoría ${prioridades.get(p) + 1}.` })
      else if (p) prioridades.set(p, i)
    })
  })

/** Valores del formulario → cuerpo de POST /criterios/ y /criterios/validar/. */
export const aPayload = (v) => ({
  nota: v.nota.trim(),
  categorias: v.categorias.map((c) => ({
    nombre: c.nombre.trim(),
    color_hex: c.color_hex.toUpperCase(),
    prioridad: Number(c.prioridad),
    frecuencia_visita_dias: c.frecuencia_visita_dias.trim() === '' ? null : Number(c.frecuencia_visita_dias),
    descripcion: c.descripcion.trim(),
    reglas: c.reglas.map((r) => ({ variable: r.variable, operador: r.operador, umbral: r.operador === 'entre' ? [aNumero(r.umbral_min), aNumero(r.umbral_max)] : aNumero(r.umbral) })),
  })),
})

/** «categorias[0].reglas[1].umbral» (servidor) → «categorias.0.reglas.1.umbral» (formulario). */
export const rutaFormulario = (campo) => String(campo || '').replace(/\[(\d+)\]/g, '.$1')

/** Errores del servidor [{campo, mensaje}] → {ruta: mensaje} (el primero por ruta). */
export const mapaErrores = (errores = []) => {
  const m = {}
  errores.forEach((e) => {
    const k = rutaFormulario(e.campo) || '_general'
    if (!m[k]) m[k] = e.mensaje
  })
  return m
}

/** Texto legible de la ubicación de un error del servidor. */
export const lugarError = (campo) => {
  const r = rutaFormulario(campo)
  const m = /^categorias\.(\d+)(?:\.reglas(?:\.(\d+))?)?(?:\.(\w+))?$/.exec(r)
  if (!m) return r === 'categorias' ? 'Categorías' : ''
  const NOMBRES = { nombre: 'nombre', color_hex: 'color', prioridad: 'prioridad', frecuencia_visita_dias: 'frecuencia de visita', descripcion: 'descripción', variable: 'variable', operador: 'operador', umbral: 'umbral' }
  return [`Categoría ${Number(m[1]) + 1}`, m[2] != null ? `regla ${Number(m[2]) + 1}` : r.includes('.reglas') ? 'reglas' : null, m[3] ? NOMBRES[m[3]] || m[3] : null].filter(Boolean).join(' · ')
}
