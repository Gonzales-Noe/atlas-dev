import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './store/authStore.jsx'
import { applyStoredThemePreference } from './utils/userPreferences.js'
import { loadBrandTheme } from './utils/brandTheme.js'
import { registerServiceWorker } from './utils/pwaInstall.js'

applyStoredThemePreference()
loadBrandTheme()
if (typeof window.requestIdleCallback === 'function') {
  window.requestIdleCallback(() => registerServiceWorker(), { timeout: 3000 })
} else {
  window.addEventListener('load', () => registerServiceWorker(), { once: true })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
