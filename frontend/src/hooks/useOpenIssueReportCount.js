import { useCallback, useEffect, useState } from 'react'
import api from '../config/api'

export default function useOpenIssueReportCount(enabled = true) {
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!enabled) {
      setCount(0)
      return
    }
    try {
      const { data } = await api.get('/auth/support-reports/summary/', {
        atlasCache: false,
        skipAtlasErrorCard: true,
      })
      setCount(Number(data?.open_count) || 0)
    } catch {
      // Keep the last known count if the summary cannot be reached.
    }
  }, [enabled])

  useEffect(() => {
    refresh()
    if (!enabled) return undefined
    const timer = window.setInterval(refresh, 30000)
    const onFocus = () => refresh()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const onRefresh = () => refresh()
    const onMessage = (event) => {
      const type = event?.data?.type
      if (type === 'atlas-notification' || type === 'atlas-notification-open') refresh()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('atlas-issue-reports-refresh', onRefresh)
    navigator.serviceWorker?.addEventListener?.('message', onMessage)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('atlas-issue-reports-refresh', onRefresh)
      navigator.serviceWorker?.removeEventListener?.('message', onMessage)
    }
  }, [enabled, refresh])

  return count
}
