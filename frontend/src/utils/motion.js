// Tokens de movimiento (sección 11.1). Springs críticamente amortiguados (bounce 0).
export const spring = { type: 'spring', duration: 0.35, bounce: 0 }
export const springPieza = { type: 'spring', duration: 0.45, bounce: 0 }
export const duracion = { rapida: 0.14, base: 0.24, lenta: 0.35 }
export const ease = [0.2, 0.8, 0.2, 1]
export const stagger = { kpi: 0.06, lista: 0.04, panel: 0.08 }

// Coreografía de ensamblado de pantallas (11.5)
export const contenedorEnsamblado = (escalon = stagger.panel, retardo = 0.04) => ({
  oculto: {},
  visible: { transition: { staggerChildren: escalon, delayChildren: retardo } },
})

export const piezaEnsamblado = (reducido = false, desplazamiento = 20) =>
  reducido
    ? { oculto: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.18 } } }
    : {
        oculto: { opacity: 0, y: desplazamiento, scale: 0.98 },
        visible: { opacity: 1, y: 0, scale: 1, transition: springPieza },
      }

export const salidaPagina = { opacity: 0, transition: { duration: duracion.rapida, ease: 'easeOut' } }
