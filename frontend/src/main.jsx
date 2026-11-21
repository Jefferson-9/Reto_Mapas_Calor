import '@fontsource-variable/inter'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { crearRouter } from './app/router'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { OfflineProvider } from './offline/OfflineContext'
import './styles/index.css'

const router = crearRouter()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <AuthProvider>
        <OfflineProvider>
          <RouterProvider router={router} />
        </OfflineProvider>
      </AuthProvider>
    </ToastProvider>
  </StrictMode>,
)
