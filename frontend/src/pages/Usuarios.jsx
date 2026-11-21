import { zodResolver } from '@hookform/resolvers/zod'
import { Ban, Check, CheckCircle2, Eye, EyeOff, KeyRound, Minus, PencilLine, Save, Search, ShieldCheck, UserPlus, Users as IconoUsuarios } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Aviso, EncabezadoSeccion, ListaErrores } from '../components/admin/Bloques'
import { Campo, Casilla, FiltroSelect } from '../components/admin/Campos'
import { aplicarErroresServidor, ariaCampo, claseControl } from '../components/admin/formulario'
import { ConfirmDialog, EmptyState, ErrorState, EtiquetaProvisional, LoadingState } from '../components/feedback/Estados'
import { Chip, GlassButton, GlassPanel } from '../components/glass/Glass'
import { GlassModal } from '../components/glass/Overlay'
import { Ensamblado, EncabezadoPagina } from '../components/layout/Ensamblado'
import { Segmentado } from '../components/layout/Pildora'
import { DataTable, LoadMoreFooter } from '../components/tables/DataTable'
import { useAuth } from '../context/AuthContext'
import { useBarraSuperior } from '../context/FiltrosContext'
import { useToast } from '../context/ToastContext'
import { adminApi, ROLES_CON_AGENCIA } from '../features/admin/api'
import { useApi, useCursorList, useDebounce } from '../hooks/useApi'
import { fmtEntero, fmtFechaHora } from '../utils/format'

const CAMPOS_USUARIO = ['username', 'nombre_completo', 'cargo', 'email', 'rol', 'agencia_id', 'password']
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Usuarios() {
  useBarraSuperior({}, [])
  const [pestana, setPestana] = useState('usuarios')
  const roles = useApi((s) => adminApi.roles(s), [])
  const agencias = useApi((s) => adminApi.agencias(s), [])
  return (
    <Ensamblado className="flex flex-col gap-[var(--gap)]">
      <EncabezadoPagina
        titulo="Usuarios y permisos"
        subtitulo="Cuentas del personal, su rol y su ámbito de datos (agencia o toda la cooperativa)"
        extra={<Segmentado etiqueta="Sección" valor={pestana} alCambiar={setPestana} opciones={[{ valor: 'usuarios', etiqueta: 'Usuarios' }, { valor: 'roles', etiqueta: 'Roles y permisos' }]} />}
      />
      <Aviso tono="info">Los cambios de rol, ámbito o estado rigen desde el siguiente acceso del usuario: sus sesiones activas se cierran al guardar.</Aviso>
      {pestana === 'usuarios' ? <TabUsuarios roles={roles.data?.roles || []} agencias={agencias.data?.items || []} /> : <TabRoles roles={roles} />}
    </Ensamblado>
  )
}

/* ======================= Usuarios ======================= */
function TabUsuarios({ roles, agencias }) {
  const toast = useToast()
  const { usuario: yo } = useAuth()
  const [q, setQ] = useState('')
  const qd = useDebounce(q.trim(), 250)
  const [rol, setRol] = useState(null)
  const [activo, setActivo] = useState(null)
  const [modal, setModal] = useState(null) // {tipo: 'crear'|'editar'|'contrasena'|'estado', u}
  const [ocupado, setOcupado] = useState(false)
  const lista = useCursorList(({ cursor, signal }) => adminApi.usuarios({ q: qd, rol, activo, cursor }, signal), [qd, rol, activo])
  const cerrar = () => setModal(null)

  const cambiarEstado = async () => {
    const { u } = modal
    setOcupado(true)
    try {
      const nuevo = await adminApi.estadoUsuario(u.id, !u.activo)
      lista.actualizarItem(u.id, () => nuevo)
      toast.exito(nuevo.activo ? `«${nuevo.nombre_completo}» puede volver a iniciar sesión.` : `«${nuevo.nombre_completo}» fue desactivado y sus sesiones se cerraron.`)
      cerrar()
    } catch (e) {
      toast.error(e.details?.[0]?.mensaje || e.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <GlassPanel className="min-w-0 p-2 md:p-3" aria-labelledby="titulo-usuarios">
      <div className="px-3 pt-3 md:px-4">
        <EncabezadoSeccion
          id="titulo-usuarios"
          titulo="Usuarios"
          subtitulo={lista.total != null ? `${fmtEntero(lista.total)} cuentas` : undefined}
          extra={
            <GlassButton variante="primario" icono={UserPlus} onClick={() => setModal({ tipo: 'crear' })}>
              Nuevo usuario
            </GlassButton>
          }
        />
        <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-1 sm:col-span-2 lg:col-span-1">
            <label htmlFor="u-buscar" className="px-1 text-xs font-semibold text-muted">
              Buscar
            </label>
            <span className="glass-control flex min-h-12 items-center gap-2 rounded-control px-3 focus-within:ring-2 focus-within:ring-brand-400">
              <Search className="size-4 shrink-0 text-muted" aria-hidden />
              <input id="u-buscar" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, usuario o correo" autoCapitalize="none" spellCheck={false} className="h-full min-h-11 w-full bg-transparent text-base outline-none" />
            </span>
          </div>
          <FiltroSelect id="u-rol" etiqueta="Rol" valor={rol} alCambiar={setRol} opciones={roles.map((r) => ({ valor: r.codigo, etiqueta: r.nombre }))} />
          <FiltroSelect
            id="u-activo"
            etiqueta="Estado"
            valor={activo}
            alCambiar={setActivo}
            opciones={[
              { valor: 'true', etiqueta: 'Activos' },
              { valor: 'false', etiqueta: 'Inactivos' },
            ]}
          />
        </div>
      </div>
      <DataTable
        etiqueta="Usuarios"
        filas={lista.items}
        cargando={lista.cargando}
        error={lista.error}
        alReintentar={lista.recargar}
        vacio={<EmptyState icono={IconoUsuarios} titulo="Sin usuarios" texto={qd || rol || activo ? 'No hay usuarios con estos filtros.' : 'Cree la primera cuenta con «Nuevo usuario».'} />}
        columnas={[
          {
            clave: 'nombre_completo',
            titulo: 'Usuario',
            movil: 'titulo',
            render: (u) => (
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold text-ink">{u.nombre_completo}</span>
                <span className="truncate text-xs text-muted">
                  @{u.username}
                  {u.cargo ? ` · ${u.cargo}` : ''}
                </span>
              </span>
            ),
          },
          { clave: 'rol', titulo: 'Rol', render: (u) => u.rol?.nombre },
          { clave: 'agencia', titulo: 'Ámbito', render: (u) => u.agencia?.nombre || 'Toda la cooperativa' },
          {
            clave: 'activo',
            titulo: 'Estado',
            render: (u) => (
              <Chip tono={u.activo ? 'verde' : 'neutro'} icono={u.activo ? CheckCircle2 : Ban}>
                {u.activo ? 'Activo' : 'Inactivo'}
              </Chip>
            ),
          },
          { clave: 'ultimo_acceso', titulo: 'Último acceso', render: (u) => (u.ultimo_acceso ? fmtFechaHora(u.ultimo_acceso) : 'Nunca') },
        ]}
        acciones={(u) => (
          <span className="inline-flex flex-wrap justify-end gap-1.5">
            <GlassButton tam="sm" icono={PencilLine} onClick={() => setModal({ tipo: 'editar', u })} aria-label={`Editar a ${u.nombre_completo}`}>
              Editar
            </GlassButton>
            <GlassButton tam="sm" icono={KeyRound} onClick={() => setModal({ tipo: 'contrasena', u })} aria-label={`Restablecer la contraseña de ${u.nombre_completo}`}>
              Contraseña
            </GlassButton>
            {u.id !== yo?.id && (
              <GlassButton tam="sm" variante={u.activo ? 'fantasma' : 'cristal'} icono={u.activo ? Ban : CheckCircle2} onClick={() => setModal({ tipo: 'estado', u })}>
                {u.activo ? 'Desactivar' : 'Activar'}
              </GlassButton>
            )}
          </span>
        )}
      />
      <LoadMoreFooter mostrando={lista.items.length} total={lista.total} hayMas={lista.hasMore} cargando={lista.cargandoMas} alVerMas={lista.verMas} />

      <GlassModal
        abierto={modal?.tipo === 'crear' || modal?.tipo === 'editar'}
        alCerrar={cerrar}
        titulo={modal?.tipo === 'editar' ? 'Editar usuario' : 'Nuevo usuario'}
        descripcion={modal?.tipo === 'editar' ? `@${modal.u.username}` : 'Los datos marcados son obligatorios.'}
        ancho="max-w-2xl"
      >
        {(modal?.tipo === 'crear' || modal?.tipo === 'editar') && (
          <FormUsuario
            key={modal.u?.id ?? 'nuevo'}
            u={modal.u}
            esPropio={modal.u?.id === yo?.id}
            roles={roles}
            agencias={agencias}
            alCancelar={cerrar}
            alGuardado={(nuevo, creado) => {
              cerrar()
              if (creado) lista.recargar()
              else lista.actualizarItem(nuevo.id, () => nuevo)
              toast.exito(creado ? `Usuario «${nuevo.username}» creado.` : 'Cambios guardados. Rigen desde el siguiente acceso del usuario.')
            }}
          />
        )}
      </GlassModal>
      <GlassModal abierto={modal?.tipo === 'contrasena'} alCerrar={cerrar} titulo="Restablecer contraseña" descripcion={modal?.u ? `${modal.u.nombre_completo} (@${modal.u.username})` : ''}>
        {modal?.tipo === 'contrasena' && (
          <FormContrasena
            u={modal.u}
            alCancelar={cerrar}
            alGuardado={() => {
              cerrar()
              toast.exito('Contraseña restablecida. Las sesiones del usuario se cerraron.')
            }}
          />
        )}
      </GlassModal>
      <ConfirmDialog
        abierto={modal?.tipo === 'estado'}
        alCerrar={() => !ocupado && cerrar()}
        alConfirmar={cambiarEstado}
        cargando={ocupado}
        peligro={modal?.u?.activo}
        titulo={modal?.u?.activo ? `¿Desactivar a ${modal?.u?.nombre_completo}?` : `¿Activar a ${modal?.u?.nombre_completo}?`}
        texto={modal?.u?.activo ? 'No podrá iniciar sesión y sus sesiones activas se cerrarán. Su historial se conserva.' : 'Podrá volver a iniciar sesión con su contraseña actual.'}
        confirmar={modal?.u?.activo ? 'Desactivar' : 'Activar'}
      />
    </GlassPanel>
  )
}

function FormUsuario({ u, esPropio, roles, agencias, alGuardado, alCancelar }) {
  const crear = !u
  const [sueltos, setSueltos] = useState([])
  const [ver, setVer] = useState(false)
  const esquema = useMemo(
    () =>
      z
        .object({
          username: z.string().trim().regex(/^[A-Za-z0-9._-]{3,60}$/, 'Use 3 a 60 caracteres: letras, números, punto, guion o guion bajo.'),
          nombre_completo: z.string().trim().min(1, 'Este dato es obligatorio.').max(120, 'Máximo 120 caracteres.'),
          cargo: z.string().trim().max(120, 'Máximo 120 caracteres.'),
          email: z.string().trim().refine((v) => !v || RE_EMAIL.test(v), 'Correo electrónico no válido.'),
          rol: z.string().min(1, 'Seleccione un rol.'),
          agencia_id: z.string(),
          password: crear ? z.string().min(10, 'Use al menos 10 caracteres.').max(128, 'Máximo 128 caracteres.') : z.string().optional(),
        })
        .superRefine((v, ctx) => {
          if (ROLES_CON_AGENCIA.includes(v.rol) && !v.agencia_id) ctx.addIssue({ code: 'custom', path: ['agencia_id'], message: 'Este rol requiere una agencia como ámbito.' })
        }),
    [crear],
  )
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(esquema),
    defaultValues: {
      username: u?.username || '',
      nombre_completo: u?.nombre_completo || '',
      cargo: u?.cargo || '',
      email: u?.email || '',
      rol: u?.rol?.codigo || '',
      agencia_id: u?.agencia?.id ? String(u.agencia.id) : '',
      password: '',
    },
  })

  const enviar = async (v) => {
    setSueltos([])
    const datos = { username: v.username.trim(), nombre_completo: v.nombre_completo.trim(), cargo: v.cargo.trim(), email: v.email.trim(), rol: v.rol, agencia_id: v.agencia_id ? Number(v.agencia_id) : null }
    if (esPropio) delete datos.rol
    try {
      const nuevo = crear ? await adminApi.crearUsuario({ ...datos, password: v.password }) : await adminApi.editarUsuario(u.id, datos)
      alGuardado(nuevo, crear)
    } catch (e) {
      const resto = aplicarErroresServidor(e, setError, CAMPOS_USUARIO)
      setSueltos(resto.length ? resto : e.details?.length ? [] : [e.message])
    }
  }

  const err = (k) => errors[k]?.message
  return (
    <form onSubmit={handleSubmit(enviar)} noValidate className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="fu-username" etiqueta="Identificador de usuario" error={err('username')} ayuda="Con él se inicia sesión. Debe ser único.">
          <input {...register('username')} autoComplete="off" autoCapitalize="none" spellCheck={false} data-autofocus {...ariaCampo('fu-username', errors.username, true)} className={claseControl(errors.username)} />
        </Campo>
        <Campo id="fu-nombre" etiqueta="Nombre completo" error={err('nombre_completo')}>
          <input {...register('nombre_completo')} autoComplete="off" {...ariaCampo('fu-nombre', errors.nombre_completo)} className={claseControl(errors.nombre_completo)} />
        </Campo>
        <Campo id="fu-cargo" etiqueta="Cargo" opcional error={err('cargo')}>
          <input {...register('cargo')} autoComplete="off" {...ariaCampo('fu-cargo', errors.cargo)} className={claseControl(errors.cargo)} />
        </Campo>
        <Campo id="fu-email" etiqueta="Correo electrónico" opcional error={err('email')}>
          <input type="email" inputMode="email" {...register('email')} autoComplete="off" autoCapitalize="none" {...ariaCampo('fu-email', errors.email)} className={claseControl(errors.email)} />
        </Campo>
        <Campo id="fu-rol" etiqueta="Rol" error={err('rol')} ayuda={esPropio ? 'No puede cambiar su propio rol.' : undefined}>
          <select {...register('rol')} disabled={esPropio} {...ariaCampo('fu-rol', errors.rol, esPropio)} className={claseControl(errors.rol)}>
            <option value="">— Seleccione —</option>
            {roles.map((r) => (
              <option key={r.codigo} value={r.codigo}>
                {r.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="fu-agencia" etiqueta="Ámbito (agencia)" error={err('agencia_id')} ayuda="Jefes de agencia y oficiales requieren una agencia.">
          <select {...register('agencia_id')} {...ariaCampo('fu-agencia', errors.agencia_id, true)} className={claseControl(errors.agencia_id)}>
            <option value="">Toda la cooperativa</option>
            {agencias.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.nombre}
                {a.activa === false ? ' (inactiva)' : ''}
              </option>
            ))}
          </select>
        </Campo>
        {crear && (
          <Campo id="fu-pass" etiqueta="Contraseña inicial" error={err('password')} ayuda="Mínimo 10 caracteres; no use datos personales, solo números ni contraseñas comunes." className="sm:col-span-2">
            <span className={`flex items-center gap-1 ${claseControl(errors.password, 'pr-1')}`}>
              <input type={ver ? 'text' : 'password'} {...register('password')} autoComplete="new-password" {...ariaCampo('fu-pass', errors.password, true)} className="h-full min-h-11 w-full bg-transparent text-base outline-none" />
              <button type="button" onClick={() => setVer((x) => !x)} className="press grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-white/70" aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </span>
          </Campo>
        )}
      </div>
      <ListaErrores mensajes={sueltos} />
      <div className="flex flex-wrap justify-end gap-2">
        <GlassButton onClick={alCancelar} disabled={isSubmitting}>
          Cancelar
        </GlassButton>
        <GlassButton type="submit" variante="primario" icono={crear ? UserPlus : Save} cargando={isSubmitting}>
          {crear ? 'Crear usuario' : 'Guardar cambios'}
        </GlassButton>
      </div>
    </form>
  )
}

const esquemaContrasena = z
  .object({
    password: z.string().min(10, 'Use al menos 10 caracteres.').max(128, 'Máximo 128 caracteres.'),
    confirmacion: z.string(),
  })
  .refine((v) => v.password === v.confirmacion, { path: ['confirmacion'], message: 'Las contraseñas no coinciden.' })

function FormContrasena({ u, alGuardado, alCancelar }) {
  const [sueltos, setSueltos] = useState([])
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(esquemaContrasena), defaultValues: { password: '', confirmacion: '' } })
  const enviar = async (v) => {
    setSueltos([])
    try {
      await adminApi.contrasena(u.id, v.password)
      alGuardado()
    } catch (e) {
      const resto = aplicarErroresServidor(e, setError, ['password'])
      setSueltos(resto.length ? resto : e.details?.length ? [] : [e.message])
    }
  }
  return (
    <form onSubmit={handleSubmit(enviar)} noValidate className="flex flex-col gap-4">
      <input type="text" name="username" autoComplete="username" value={u.username} readOnly hidden />
      <Campo id="fc-pass" etiqueta="Nueva contraseña" error={errors.password?.message} ayuda="Mínimo 10 caracteres. Comuníquela al usuario por un canal seguro.">
        <input type="password" {...register('password')} autoComplete="new-password" data-autofocus {...ariaCampo('fc-pass', errors.password, true)} className={claseControl(errors.password)} />
      </Campo>
      <Campo id="fc-conf" etiqueta="Repita la contraseña" error={errors.confirmacion?.message}>
        <input type="password" {...register('confirmacion')} autoComplete="new-password" {...ariaCampo('fc-conf', errors.confirmacion)} className={claseControl(errors.confirmacion)} />
      </Campo>
      <p className="text-xs text-muted">Al restablecerla se cierran todas las sesiones activas del usuario.</p>
      <ListaErrores mensajes={sueltos} />
      <div className="flex flex-wrap justify-end gap-2">
        <GlassButton onClick={alCancelar} disabled={isSubmitting}>
          Cancelar
        </GlassButton>
        <GlassButton type="submit" variante="primario" icono={KeyRound} cargando={isSubmitting}>
          Restablecer
        </GlassButton>
      </div>
    </form>
  )
}

/* ======================= Roles y permisos ======================= */
function TabRoles({ roles }) {
  const { data, error, cargando, recargar } = roles
  const [sel, setSel] = useState(null)
  if (error) {
    return (
      <GlassPanel>
        <ErrorState error={error} alReintentar={recargar} />
      </GlassPanel>
    )
  }
  if (cargando || !data) {
    return (
      <GlassPanel className="p-5">
        <LoadingState filas={6} />
      </GlassPanel>
    )
  }
  const rol = data.roles.find((r) => r.codigo === sel) || data.roles[0]
  return (
    <>
      <GlassPanel className="min-w-0 p-5 md:p-6" aria-labelledby="titulo-roles">
        <EncabezadoSeccion
          id="titulo-roles"
          titulo="Permisos por rol"
          subtitulo="Elija un rol para revisar o ajustar sus permisos."
          extra={<EtiquetaProvisional texto="Matriz por defecto, a validar con la cooperativa" detalle="La asignación inicial de permisos a roles es una propuesta del equipo y debe validarse con la cooperativa." />}
        />
        <div role="radiogroup" aria-label="Rol" className="mb-5 flex flex-wrap gap-2">
          {data.roles.map((r) => (
            <button
              key={r.codigo}
              type="button"
              role="radio"
              aria-checked={r.codigo === rol?.codigo}
              onClick={() => setSel(r.codigo)}
              className={`press flex min-h-11 items-center gap-2 rounded-full px-4 text-sm ${r.codigo === rol?.codigo ? 'bg-white font-semibold text-brand-700 shadow-[0_6px_16px_-8px_rgb(16_34_61/0.4)]' : 'glass-control text-ink-2 hover:bg-white/90'}`}
            >
              {r.nombre}
              <span className="tnum rounded-full bg-ink/5 px-2 text-xs text-muted">{fmtEntero(r.usuarios)}</span>
            </button>
          ))}
        </div>
        {rol && <EditorPermisos key={`${rol.codigo}-${rol.permisos.join(',')}`} rol={rol} permisos={data.permisos} alGuardado={recargar} />}
      </GlassPanel>

      <GlassPanel className="hidden min-w-0 p-5 md:p-6 lg:block" aria-labelledby="titulo-matriz">
        <EncabezadoSeccion id="titulo-matriz" titulo="Matriz completa" subtitulo="Vista general de los permisos de todos los roles (solo lectura)." />
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Permisos asignados a cada rol</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 bg-white/60 px-3 py-2 text-left text-xs font-semibold text-muted uppercase backdrop-blur">
                  Permiso
                </th>
                {data.roles.map((r) => (
                  <th key={r.codigo} scope="col" className="px-2 py-2 text-center text-xs font-semibold text-muted">
                    {r.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.permisos.map((p) => (
                <tr key={p.codigo} className="hover:bg-white/45">
                  <th scope="row" className="border-b border-white/60 px-3 py-2 text-left font-medium text-ink">
                    {p.descripcion}
                    <span className="block text-xs font-normal text-muted">{p.codigo}</span>
                  </th>
                  {data.roles.map((r) => {
                    const si = r.permisos.includes(p.codigo)
                    return (
                      <td key={r.codigo} className="border-b border-white/60 px-2 py-2 text-center">
                        {si ? <Check className="mx-auto size-4 text-ok-ink" aria-hidden /> : <Minus className="mx-auto size-4 text-ink/25" aria-hidden />}
                        <span className="sr-only">{si ? 'Sí' : 'No'}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </>
  )
}

function EditorPermisos({ rol, permisos, alGuardado }) {
  const toast = useToast()
  const [marcados, setMarcados] = useState(() => new Set(rol.permisos))
  const [confirmar, setConfirmar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [sueltos, setSueltos] = useState([])
  const grupos = useMemo(() => {
    const g = new Map()
    permisos.forEach((p) => g.set(p.grupo, [...(g.get(p.grupo) || []), p]))
    return [...g.entries()]
  }, [permisos])
  const fijo = (codigo) => rol.codigo === 'admin' && codigo === 'usuarios.gestionar'
  const cambiado = marcados.size !== rol.permisos.length || rol.permisos.some((p) => !marcados.has(p))
  const alternar = (codigo, si) =>
    setMarcados((m) => {
      const n = new Set(m)
      if (si) n.add(codigo)
      else n.delete(codigo)
      return n
    })

  const guardar = async () => {
    setGuardando(true)
    setSueltos([])
    try {
      await adminApi.permisosRol(rol.codigo, permisos.map((p) => p.codigo).filter((c) => marcados.has(c)))
      toast.exito(`Permisos de «${rol.nombre}» actualizados. Rigen desde el siguiente acceso de sus usuarios.`)
      setConfirmar(false)
      alGuardado()
    } catch (e) {
      setSueltos([e.message, ...(e.details || []).map((d) => d.mensaje)])
      setConfirmar(false)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {grupos.map(([grupo, ps]) => (
          <fieldset key={grupo} className="glass-inset rounded-card p-4">
            <legend className="sr-only">{grupo}</legend>
            <p aria-hidden className="mb-1 text-sm font-bold text-ink">
              {grupo}
            </p>
            {ps.map((p) => (
              <Casilla
                key={p.codigo}
                id={`perm-${rol.codigo}-${p.codigo}`}
                checked={marcados.has(p.codigo)}
                disabled={fijo(p.codigo)}
                onChange={(e) => alternar(p.codigo, e.target.checked)}
                etiqueta={p.descripcion}
                descripcion={fijo(p.codigo) ? `${p.codigo} · obligatorio para el administrador` : p.codigo}
              />
            ))}
          </fieldset>
        ))}
      </div>
      <ListaErrores mensajes={sueltos} />
      <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        <span className="text-sm text-muted sm:mr-auto">
          <ShieldCheck className="mr-1 inline size-4 text-ok" aria-hidden />
          {fmtEntero(marcados.size)} de {fmtEntero(permisos.length)} permisos · {fmtEntero(rol.usuarios)} usuarios con este rol
        </span>
        <GlassButton disabled={!cambiado || guardando} onClick={() => setMarcados(new Set(rol.permisos))}>
          Descartar
        </GlassButton>
        <GlassButton variante="primario" icono={Save} disabled={!cambiado} onClick={() => setConfirmar(true)}>
          Guardar permisos
        </GlassButton>
      </div>
      <ConfirmDialog
        abierto={confirmar}
        alCerrar={() => !guardando && setConfirmar(false)}
        alConfirmar={guardar}
        cargando={guardando}
        titulo={`¿Actualizar los permisos de «${rol.nombre}»?`}
        texto={`Afecta a ${fmtEntero(rol.usuarios)} usuarios. Los nuevos permisos rigen desde su siguiente acceso y el cambio queda en el historial.`}
        confirmar="Guardar permisos"
      />
    </div>
  )
}
