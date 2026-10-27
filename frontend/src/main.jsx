import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './store/authStore.jsx'
import { applyStoredThemePreference } from './utils/userPreferences.js'
import { registerServiceWorker } from './utils/pwaInstall.js'

applyStoredThemePreference()
registerServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
