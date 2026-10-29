import { useCallback, useEffect, useState } from 'react'
import api from '../../config/api'
import { GlassCard, PrimaryBtn, StatusChip } from '../../components/ui'

const STATUS_LABELS = {
  healthy: 'Healthy',
  limited: 'Limit reached',
  blocked: 'Blocked',
  unreachable: 'Unreachable',
  unavailable: 'Unavailable',
  not_configured: 'Not configured',
}

const STATUS_TYPES = {
  healthy: 'success',
  limited: 'warning',
  blocked: 'warning',
  unreachable: 'inactive',
  unavailable: 'warning',
  not_configured: 'inactive',
}

function formatCount(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return Number(value).toLocaleString()
}

function unusedText(row) {
  if (row.quota_kind === 'tokens' && row.tokens_remaining != null) {
    const requests = row.requests_remaining != null
      ? `${formatCount(row.requests_remaining)} of ${formatCount(row.requests_limit)} requests left`
      : ''
    return {
      primary: `${formatCount(row.tokens_remaining)} of ${formatCount(row.tokens_limit)} tokens left`,
      secondary: requests,
    }
  }
  if (row.quota_kind === 'requests' && row.requests_remaining != null) {
    return {
      primary: `${formatCount(row.requests_remaining)} of ${formatCount(row.requests_limit)} requests left`,
      secondary: 'Token balance is not published',
    }
  }
  if (row.id === 'ollama' && row.status === 'healthy') {
    return { primary: 'No token limit', secondary: 'Runs on the server' }
  }
  return { primary: 'Not published', secondary: '' }
}

function accountText(row) {
  if (!row.instances || row.instances < 2) return ''
  return `Account ${row.instance} of ${row.instances}`
}

function returnText(row) {
  if (row.status === 'blocked') return 'No automatic return'
  if (row.status === 'not_configured' || row.status === 'unreachable') return '—'
  const atLimit = row.status === 'limited' || row.tokens_remaining === 0 || row.requests_remaining === 0
  if (!atLimit) return 'Not at the limit'
  if (row.resets_at) {
    const when = new Date(row.resets_at)
    if (!Number.isNaN(when.getTime())) return when.toLocaleString()
  }
  return 'Return time not published'
}

const EMPTY_TRAFFIC = { concurrent_users: 0, window_seconds: 120, by_role: [] }

export default function LlmHealthPanel() {
  const [providers, setProviders] = useState([])
  const [traffic, setTraffic] = useState(EMPTY_TRAFFIC)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadTraffic = useCallback(() => {
    api.get('/integrations/traffic/')
      .then(({ data }) => setTraffic({
        concurrent_users: data.concurrent_users || 0,
        window_seconds: data.window_seconds || 120,
        by_role: data.by_role || [],
      }))
      .catch(() => {})
  }, [])

  const load = useCallback((refresh) => {
    setLoading(true)
    setError('')
    loadTraffic()
    api.get(`/integrations/llm-health/${refresh ? '?refresh=1' : ''}`)
      .then(({ data }) => setProviders(data.providers || []))
      .catch(err => {
        const status = err?.response?.status
        setError(status === 403 ? 'Only a superadmin can view model health.' : 'Model health could not be loaded.')
        setProviders([])
      })
      .finally(() => setLoading(false))
  }, [loadTraffic])

  useEffect(() => {
    load(true)
    const timer = setInterval(loadTraffic, 15000)
    return () => clearInterval(timer)
  }, [load, loadTraffic])

  const minutes = Math.round((traffic.window_seconds || 120) / 60)

  return (
    <>
      <style>{`
        .llm-health-split {
          display: grid;
          grid-template-columns: minmax(200px, 250px) minmax(0, 1fr);
          gap: 16px;
          margin-bottom: 16px;
          align-items: start;
        }
        .llm-model-row {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) auto minmax(0, 1.4fr) minmax(108px, 0.9fr);
          gap: 12px;
          align-items: center;
          padding: 12px 0;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        @media (max-width: 980px) {
          .llm-health-split { grid-template-columns: 1fr; }
        }
        @media (max-width: 720px) {
          .llm-model-row { grid-template-columns: minmax(0, 1fr) auto; }
        }
      `}</style>
      <div className="llm-health-split">
        <GlassCard title="Concurrent users" style={{ marginBottom: 0 }}>
          <div style={{ color: '#F0F0F2', fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>
            {traffic.concurrent_users}
          </div>
          <div style={{ marginTop: 12, color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', lineHeight: 1.45 }}>
            {traffic.by_role.length
              ? traffic.by_role.map(item => `${item.label} ${item.count}`).join(' · ')
              : 'No one is active right now'}
          </div>
          <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', lineHeight: 1.4 }}>
            Counted from signed-in requests in the last {minutes} {minutes === 1 ? 'minute' : 'minutes'}.
          </div>
        </GlassCard>

        <GlassCard
          title="LLM model health"
          titleAction={(
            <PrimaryBtn small disabled={loading} onClick={() => load(true)}>
              {loading ? 'Checking' : 'Check again'}
            </PrimaryBtn>
          )}
          style={{ marginBottom: 0, minWidth: 0 }}
        >
          <p style={{ margin: '0 0 14px', color: 'rgba(255,255,255,0.55)', fontSize: '0.82rem' }}>
            Unused quota for each model account, and the time a reached limit comes back.
          </p>
          {error && (
            <p style={{ margin: 0, color: '#FFB74D', fontSize: '0.85rem' }}>{error}</p>
          )}
          {!error && !loading && providers.length === 0 && (
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.55)', fontSize: '0.85rem' }}>No models are configured.</p>
          )}
          <div>
            {providers.map(row => {
              const unused = unusedText(row)
              const account = accountText(row)
              return (
                <div key={row.id} className="llm-model-row">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#F0F0F2', fontWeight: 700, fontSize: '0.9rem' }}>{row.label}</div>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', marginTop: 2 }}>{row.model || '—'}</div>
                    {account && (
                      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.75rem', marginTop: 2 }}>{account}</div>
                    )}
                  </div>
                  <div>
                    <StatusChip label={STATUS_LABELS[row.status] || row.status} type={STATUS_TYPES[row.status] || 'default'} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#F0F0F2', fontSize: '0.85rem' }}>{unused.primary}</div>
                    {unused.secondary && (
                      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', marginTop: 2 }}>{unused.secondary}</div>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem' }}>Returns</div>
                    <div style={{ color: '#F0F0F2', fontSize: '0.85rem' }}>{returnText(row)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </GlassCard>
      </div>
    </>
  )
}
