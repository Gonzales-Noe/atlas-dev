import { useEffect } from 'react'

/** Apply light-theme MUI overrides for faculty dashboard/workspace pages. */
export default function useAtlasLightTheme() {
  useEffect(() => {
    document.body.classList.add('atlas-light')
    return () => document.body.classList.remove('atlas-light')
  }, [])
}
