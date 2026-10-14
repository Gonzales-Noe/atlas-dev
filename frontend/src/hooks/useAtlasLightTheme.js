import { useEffect } from 'react'
import { applyStoredThemePreference } from '../utils/userPreferences'

/** Keep workspace MUI overrides synchronized with the saved theme preference. */
export default function useAtlasLightTheme() {
  useEffect(() => {
    applyStoredThemePreference()
    window.addEventListener('atlas-theme-change', applyStoredThemePreference)
    return () => window.removeEventListener('atlas-theme-change', applyStoredThemePreference)
  }, [])
}
