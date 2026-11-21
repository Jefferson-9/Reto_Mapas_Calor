import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "motion/react";
import {
  Eye,
  EyeOff,
  Flame,
  LockKeyhole,
  LogIn,
  MapPinned,
  Route,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router";
import { z } from "zod";
import logo from "../assets/logo.png";
import { GlassButton, GlassPanel } from "../components/glass/Glass";
import { useAuth } from "../context/AuthContext";
import { spring } from "../utils/motion";

const esquema = z.object({
  username: z.string().trim().min(1, "Ingrese su usuario."),
  password: z.string().min(1, "Ingrese su contraseña."),
});

export default function Login() {
  const { usuario, iniciando, login, aviso } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reducido = useReducedMotion();
  const [error, setError] = useState(null);
  const [ver, setVer] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(esquema),
    defaultValues: { username: "", password: "" },
  });

  if (!iniciando && usuario)
    return <Navigate to={location.state?.desde || "/panel"} replace />;

  const enviar = async (datos) => {
    setError(null);
    try {
      await login(datos.username, datos.password);
      navigate(location.state?.desde || "/panel", { replace: true });
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-hidden px-4 py-6 sm:px-6 lg:px-10">
      <div className="backdrop" aria-hidden />

      <div className="relative mx-auto grid w-full max-w-[1360px] items-center gap-7 lg:min-h-dvh lg:grid-cols-[minmax(0,1.16fr)_minmax(0,0.84fr)] lg:gap-10 lg:py-8 lg:-translate-y-6">
        <motion.section
          aria-label="Conozca nuestra plataforma de análisis territorial"
          initial={
            reducido ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }
          }
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            transition: spring,
          }}
          className="relative isolate order-2 flex min-h-[410px] flex-col justify-between gap-12 overflow-hidden rounded-panel bg-gradient-to-br from-brand-400 via-brand-700 to-brand-900 p-5 shadow-[0_28px_64px_-30px_rgb(8_42_82/0.45)] sm:min-h-[580px] sm:p-8 lg:order-1 lg:min-h-[min(820px,calc(100dvh-4rem))]"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "linear-gradient(180deg, rgb(8 42 82 / 0.08) 10%, rgb(8 42 82 / 0.15) 45%, rgb(8 42 82 / 0.68) 100%), url('/login-territorio.jpg')",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-white/25 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-16 -left-24 size-72 rounded-full bg-sun-300/25 blur-3xl"
          />

          <GlassPanel
            as="div"
            pieza={false}
            specular
            className="relative z-10 flex w-fit max-w-full items-center gap-3 px-4 py-2.5 shadow-lg sm:px-5"
            style={{ borderRadius: "9999px" }}
          >
            <img
              src="/logo-icono.png"
              alt=""
              className="size-10 shrink-0 object-contain sm:size-11"
            />
            <div className="min-w-0 text-brand-900">
              <p className="text-sm font-extrabold leading-tight sm:text-base">
                Padre Julián Lorente
              </p>
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.1em] sm:text-[10px]">
                Cooperativa de Ahorro y Crédito
              </p>
            </div>
          </GlassPanel>

          <GlassPanel
            as="div"
            pieza={false}
            specular
            className="relative z-10 w-full max-w-[610px] p-5 shadow-xl sm:p-7 lg:p-8"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">
              Inteligencia territorial
            </p>
            <h2 className="display mt-3 text-3xl font-extrabold leading-tight text-brand-900 sm:text-4xl xl:text-[40px]">
              Decida dónde actuar,
              <span className="block text-brand-700">
                <span className="border-b-4 border-sun-400">
                  barrio por barrio.
                </span>
              </span>
            </h2>
            <p className="mt-5 text-sm leading-relaxed text-ink-2 sm:text-base">
              Mapas de calor de socios, cartera y morosidad; zonas priorizadas
              con criterios aprobados y rutas de visita para el equipo de
              crédito.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-3">
              {[
                { titulo: "Mapas de calor", Icono: Flame },
                { titulo: "Zonas priorizadas", Icono: MapPinned },
                { titulo: "Rutas de visita", Icono: Route },
              ].map(({ titulo, Icono }) => (
                <div
                  key={titulo}
                  className="glass-inset flex min-h-[90px] flex-col items-start justify-center gap-2 rounded-card p-3"
                >
                  <span className="grid size-9 place-items-center rounded-control bg-gradient-to-b from-brand-500 to-brand-700 text-white shadow-sm">
                    <Icono className="size-[18px]" aria-hidden />
                  </span>
                  <span className="text-xs font-semibold text-brand-900 sm:text-[13px]">
                    {titulo}
                  </span>
                </div>
              ))}
            </div>
          </GlassPanel>
        </motion.section>

        <div className="order-1 grid min-w-0 place-items-center lg:order-2">
          <motion.main
            initial={
              reducido ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }
            }
            animate={{ opacity: 1, y: 0, scale: 1, transition: spring }}
            className="glass-strong w-full max-w-[420px] rounded-panel p-6 sm:p-8"
          >
            <div className="flex flex-col items-center gap-4 text-center">
              <img
                src={logo}
                alt="Padre Julián Lorente — Cooperativa de Ahorro y Crédito"
                className="h-14 w-auto"
              />
              <div>
                <h1 className="display text-2xl font-bold">
                  Análisis geoespacial
                </h1>
                <p className="mt-1 text-sm text-muted">
                  Mapas de calor, indicadores y priorización de zonas
                </p>
              </div>
            </div>

            {aviso && (
              <p
                role="status"
                className="mt-6 rounded-card bg-sun-100 px-4 py-3 text-sm font-medium text-sun-700"
              >
                {aviso}
              </p>
            )}

            <form
              onSubmit={handleSubmit(enviar)}
              noValidate
              className="mt-6 flex flex-col gap-4"
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-ink-2">
                  Usuario
                </span>
                <span className="glass-control flex h-12 items-center gap-2 rounded-control px-3 focus-within:ring-2 focus-within:ring-brand-400">
                  <UserRound className="size-4 text-muted" aria-hidden />
                  <input
                    {...register("username")}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-invalid={Boolean(errors.username)}
                    aria-describedby={errors.username ? "err-user" : undefined}
                    className="h-full w-full bg-transparent outline-none"
                  />
                </span>
                {errors.username && (
                  <span
                    id="err-user"
                    className="text-xs font-medium text-danger-ink"
                  >
                    {errors.username.message}
                  </span>
                )}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-ink-2">
                  Contraseña
                </span>
                <span className="glass-control flex h-12 items-center gap-2 rounded-control px-3 focus-within:ring-2 focus-within:ring-brand-400">
                  <LockKeyhole className="size-4 text-muted" aria-hidden />
                  <input
                    {...register("password")}
                    type={ver ? "text" : "password"}
                    autoComplete="current-password"
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? "err-pass" : undefined}
                    className="h-full w-full bg-transparent outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setVer((v) => !v)}
                    className="press -mr-2 grid size-10 place-items-center rounded-full text-muted"
                    aria-label={
                      ver ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                  >
                    {ver ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </span>
                {errors.password && (
                  <span
                    id="err-pass"
                    className="text-xs font-medium text-danger-ink"
                  >
                    {errors.password.message}
                  </span>
                )}
              </label>
              {error && (
                <p
                  role="alert"
                  className="rounded-card bg-[#fbe9e5] px-4 py-3 text-sm font-medium text-danger-ink"
                >
                  {error}
                </p>
              )}
              <GlassButton
                type="submit"
                variante="primario"
                tam="lg"
                icono={LogIn}
                cargando={isSubmitting}
                className="mt-1 w-full"
              >
                Iniciar sesión
              </GlassButton>
            </form>
            <p className="mt-6 text-center text-xs text-muted">
              Acceso exclusivo para personal autorizado. Los intentos de acceso
              quedan registrados.
            </p>
          </motion.main>
        </div>
      </div>
    </div>
  );
}
