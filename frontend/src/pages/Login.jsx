import { zodResolver } from '@hookform/resolvers/zod'
import { motion, useReducedMotion } from 'motion/react'
import { Eye, EyeOff, LockKeyhole, LogIn, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import logo from '../assets/logo.png'
import { GlassButton } from '../components/glass/Glass'
import { useAuth } from '../context/AuthContext'
import { spring } from '../utils/motion'

const esquema = z.object({
  username: z.string().trim().min(1, 'Ingrese su usuario.'),
  password: z.string().min(1, 'Ingrese su contraseña.'),
})

export default function Login() {
  const { usuario, iniciando, login, aviso } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const reducido = useReducedMotion()
  const [error, setError] = useState(null)
  const [ver, setVer] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(esquema), defaultValues: { username: '', password: '' } })

  if (!iniciando && usuario) return <Navigate to={location.state?.desde || '/panel'} replace />

  const enviar = async (datos) => {
    setError(null)
    try {
      await login(datos.username, datos.password)
      navigate(location.state?.desde || '/panel', { replace: true })
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="backdrop" aria-hidden />
      <motion.main
        initial={reducido ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: spring }}
        className="glass-strong w-full max-w-[420px] rounded-panel p-6 sm:p-8"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <img src={logo} alt="Padre Julián Lorente — Cooperativa de Ahorro y Crédito" className="h-14 w-auto" />
          <div>
            <h1 className="display text-2xl font-bold">Análisis geoespacial</h1>
            <p className="mt-1 text-sm text-muted">Mapas de calor, indicadores y priorización de zonas</p>
          </div>
        </div>

        {aviso && (
          <p role="status" className="mt-6 rounded-card bg-sun-100 px-4 py-3 text-sm font-medium text-sun-700">
            {aviso}
          </p>
        )}

        <form onSubmit={handleSubmit(enviar)} noValidate className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink-2">Usuario</span>
            <span className="glass-control flex h-12 items-center gap-2 rounded-control px-3 focus-within:ring-2 focus-within:ring-brand-400">
              <UserRound className="size-4 text-muted" aria-hidden />
              <input
                {...register('username')}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={Boolean(errors.username)}
                aria-describedby={errors.username ? 'err-user' : undefined}
                className="h-full w-full bg-transparent outline-none"
              />
            </span>
            {errors.username && <span id="err-user" className="text-xs font-medium text-danger-ink">{errors.username.message}</span>}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink-2">Contraseña</span>
            <span className="glass-control flex h-12 items-center gap-2 rounded-control px-3 focus-within:ring-2 focus-within:ring-brand-400">
              <LockKeyhole className="size-4 text-muted" aria-hidden />
              <input
                {...register('password')}
                type={ver ? 'text' : 'password'}
                autoComplete="current-password"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'err-pass' : undefined}
                className="h-full w-full bg-transparent outline-none"
              />
              <button type="button" onClick={() => setVer((v) => !v)} className="press -mr-2 grid size-10 place-items-center rounded-full text-muted" aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </span>
            {errors.password && <span id="err-pass" className="text-xs font-medium text-danger-ink">{errors.password.message}</span>}
          </label>
          {error && (
            <p role="alert" className="rounded-card bg-[#fbe9e5] px-4 py-3 text-sm font-medium text-danger-ink">
              {error}
            </p>
          )}
          <GlassButton type="submit" variante="primario" tam="lg" icono={LogIn} cargando={isSubmitting} className="mt-1 w-full">
            Iniciar sesión
          </GlassButton>
        </form>
        <p className="mt-6 text-center text-xs text-muted">Acceso exclusivo para personal autorizado. Los intentos de acceso quedan registrados.</p>
      </motion.main>
    </div>
  )
}
