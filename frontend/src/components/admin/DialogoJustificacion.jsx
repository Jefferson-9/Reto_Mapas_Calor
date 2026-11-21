import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { GlassButton } from '../glass/Glass'
import { GlassModal } from '../glass/Overlay'
import { ListaErrores } from './Bloques'
import { Campo } from './Campos'
import { aplicarErroresServidor, ariaCampo, claseControl } from './formulario'

const esquema = z.object({
  nota: z.string().trim().min(5, 'Escriba una justificación de al menos 5 caracteres.').max(300, 'Máximo 300 caracteres.'),
})

/**
 * Diálogo de acción irreversible con justificación obligatoria (descartar, conservar con observación…).
 * alEnviar(nota) puede lanzar ApiError: los errores del campo `nota` se muestran junto al campo.
 */
export function DialogoJustificacion({ abierto, alCerrar, titulo, descripcion, confirmar = 'Confirmar', peligro = false, etiqueta = 'Justificación', ayuda, alEnviar, children }) {
  const fid = useId()
  return (
    <GlassModal abierto={abierto} alCerrar={alCerrar} titulo={titulo} descripcion={descripcion}>
      {abierto && (
        <FormularioNota fid={fid} alCerrar={alCerrar} confirmar={confirmar} peligro={peligro} etiqueta={etiqueta} ayuda={ayuda} alEnviar={alEnviar}>
          {children}
        </FormularioNota>
      )}
    </GlassModal>
  )
}

function FormularioNota({ fid, alCerrar, confirmar, peligro, etiqueta, ayuda, alEnviar, children }) {
  const [sueltos, setSueltos] = useState([])
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(esquema), defaultValues: { nota: '' } })
  const id = `${fid}-nota`
  const largo = useWatch({ control, name: 'nota' })?.length || 0

  const enviar = async ({ nota }) => {
    setSueltos([])
    try {
      await alEnviar(nota.trim())
    } catch (e) {
      const resto = aplicarErroresServidor(e, setError, ['nota'])
      setSueltos(resto.length ? resto : e?.details?.length ? [] : [e.message])
    }
  }

  return (
    <form onSubmit={handleSubmit(enviar)} noValidate className="flex flex-col gap-4">
      {children}
      <Campo id={id} etiqueta={etiqueta} error={errors.nota?.message} ayuda={ayuda || `Obligatoria. Queda registrada en el historial (${largo}/300).`}>
        <textarea {...register('nota')} {...ariaCampo(id, errors.nota, true)} rows={3} maxLength={300} data-autofocus className={claseControl(errors.nota, 'min-h-24 py-2.5')} />
      </Campo>
      <ListaErrores mensajes={sueltos} />
      <div className="flex flex-wrap justify-end gap-2">
        <GlassButton onClick={alCerrar} disabled={isSubmitting}>
          Cancelar
        </GlassButton>
        <GlassButton type="submit" variante={peligro ? 'peligro' : 'primario'} cargando={isSubmitting}>
          {confirmar}
        </GlassButton>
      </div>
    </form>
  )
}
