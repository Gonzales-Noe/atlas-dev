import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import api from '../../config/api'
import { GlassCard, PrimaryBtn, StatusChip } from '../../components/ui'
import { StatusNotice } from '../../components/StatusNotice'

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

const MONITOR_ORDER = ['groq', 'openrouter', 'cloudflare', 'ollama']

const ACCOUNT_TITLES = {
  groq: 'Groq API key',
  openrouter: 'OpenRouter key',
  cloudflare: 'Cloudflare',
  ollama: 'Ollama',
}

function providerId(row) {
  return String(row.id || '').replace(/-\d+$/, '')
}

function monitoredAccounts(rows) {
  return rows
    .filter(row => MONITOR_ORDER.includes(providerId(row)))
    .sort((a, b) => {
      const order = MONITOR_ORDER.indexOf(providerId(a)) - MONITOR_ORDER.indexOf(providerId(b))
      if (order !== 0) return order
      return (Number(a.instance) || 0) - (Number(b.instance) || 0)
    })
}

function accountName(row) {
  const id = providerId(row)
  const base = ACCOUNT_TITLES[id] || row.label
  if (id !== 'groq' && id !== 'openrouter') return base
  const index = Number(row.instance) || 1
  if (index <= 1) return `${base} (original)`
  return `${base} ${index - 1}`
}

function accountMeta(row) {
  return row.model || ''
}

function noteText(row) {
  const detail = String(row.detail || '').trim()
  if (!detail) return ''
  if (row.status === 'healthy' && /does not publish/i.test(detail)) return ''
  return detail
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
const VISIBLE_ACCOUNT_ROWS = 4

function visibleAccountListHeight(list) {
  const rows = list.querySelectorAll(':scope > .llm-account-row')
  const visible = Math.min(VISIBLE_ACCOUNT_ROWS, rows.length)
  if (!visible) return null
  let height = 0
  for (let i = 0; i < visible; i += 1) height += rows[i].getBoundingClientRect().height
  return Math.ceil(height)
}

export default function LlmHealthPanel() {
  const [providers, setProviders] = useState([])
  const [traffic, setTraffic] = useState(EMPTY_TRAFFIC)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const accountListRef = useRef(null)
  const [accountListHeight, setAccountListHeight] = useState(null)
  const [accountScrollGutter, setAccountScrollGutter] = useState(0)

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
  const accounts = monitoredAccounts(providers)
  const accountsScroll = accounts.length > VISIBLE_ACCOUNT_ROWS
  const accountLayoutKey = accounts.map(row => (
    `${row.id}:${row.status}:${row.detail || ''}:${row.tokens_remaining}:${row.requests_remaining}`
  )).join('|')

  useLayoutEffect(() => {
    const list = accountListRef.current
    if (!list || !accountsScroll) {
      setAccountListHeight(null)
      setAccountScrollGutter(0)
      return undefined
    }
    const measure = () => {
      const next = visibleAccountListHeight(list)
      setAccountListHeight(prev => (prev === next ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    list.querySelectorAll(':scope > .llm-account-row').forEach(row => observer.observe(row))
    return () => observer.disconnect()
  }, [accountLayoutKey, accountsScroll])

  useLayoutEffect(() => {
    const list = accountListRef.current
    if (!list || !accountsScroll || !accountListHeight) {
      setAccountScrollGutter(0)
      return undefined
    }
    const measureGutter = () => {
      const gutter = list.offsetWidth - list.clientWidth
      setAccountScrollGutter(prev => (prev === gutter ? prev : gutter))
    }
    measureGutter()
    const observer = new ResizeObserver(measureGutter)
    observer.observe(list)
    return () => observer.disconnect()
  }, [accountLayoutKey, accountsScroll, accountListHeight])

  return (
    <>
      <style>{`
        .llm-health-split {
          display: grid;
          grid-template-columns: minmax(200px, 250px) minmax(0, 1fr);
          gap: 16px;
          margin-bottom: 16px;
          align-items: stretch;
        }
        .llm-account-scroll {
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-width: thin;
          scrollbar-color: var(--text-tertiary) transparent;
        }
        .llm-account-scroll::-webkit-scrollbar { width: 6px; }
        .llm-account-scroll::-webkit-scrollbar-thumb {
          background: var(--text-tertiary);
          border-radius: 99px;
        }
        .llm-account-row {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) auto minmax(0, 1.25fr) minmax(120px, 0.9fr);
          gap: 12px;
          align-items: start;
          padding: 12px 0;
          border-top: 1px solid var(--border-color);
        }
        .llm-account-head {
          color: var(--text-secondary);
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          padding-top: 0;
          border-top: none;
        }
        .llm-account-note {
          grid-column: 1 / -1;
          color: var(--text-secondary);
          font-size: 0.75rem;
          line-height: 1.4;
          margin-top: -4px;
        }
        @media (max-width: 980px) {
          .llm-health-split { grid-template-columns: 1fr; }
        }
        @media (max-width: 720px) {
          .llm-account-row { grid-template-columns: minmax(0, 1fr); align-items: start; }
          .llm-account-head { display: none; }
        }
      `}</style>
      <div className="llm-health-split">
        <GlassCard title="Concurrent users" style={{ marginBottom: 0, height: '100%' }}>
          <div style={{ color: 'var(--text-primary)', fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>
            {traffic.concurrent_users}
          </div>
          <div style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.45 }}>
            {traffic.by_role.length
              ? traffic.by_role.map(item => `${item.label} ${item.count}`).join(' · ')
              : 'No one is active right now'}
          </div>
          <div style={{ marginTop: 8, color: 'var(--text-tertiary)', fontSize: '0.75rem', lineHeight: 1.4 }}>
            Counted from signed-in requests in the last {minutes} {minutes === 1 ? 'minute' : 'minutes'}.
          </div>
        </GlassCard>

        <GlassCard
          title="LLM accounts"
          titleAction={(
            <PrimaryBtn small disabled={loading} onClick={() => load(true)}>
              {loading ? 'Checking' : 'Check again'}
            </PrimaryBtn>
          )}
          style={{ marginBottom: 0, minWidth: 0, height: '100%' }}
        >
          <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
            Groq and OpenRouter list the original key, then key 1 and key 2. Cloudflare and Ollama follow.
          </p>
          <StatusNotice message={error} severity="error" />
          {!error && !loading && accounts.length === 0 && (
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No accounts are configured.</p>
          )}
          {accounts.length > 0 && (
            <div>
              <div
                className="llm-account-row llm-account-head"
                style={accountScrollGutter ? { paddingRight: accountScrollGutter } : undefined}
              >
                <div>Account</div>
                <div>Status</div>
                <div>Unused</div>
                <div>Returns</div>
              </div>
              <div
                ref={accountListRef}
                className={accountsScroll ? 'llm-account-scroll' : undefined}
                style={accountsScroll && accountListHeight ? { maxHeight: accountListHeight } : undefined}
              >
                {accounts.map(row => {
                  const unused = unusedText(row)
                  const note = noteText(row)
                  return (
                    <div key={row.id} className="llm-account-row">
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.9rem' }}>{accountName(row)}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: 2 }}>{accountMeta(row) || '—'}</div>
                      </div>
                      <div>
                        <StatusChip label={STATUS_LABELS[row.status] || row.status} type={STATUS_TYPES[row.status] || 'default'} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>{unused.primary}</div>
                        {unused.secondary && (
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: 2 }}>{unused.secondary}</div>
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Returns</div>
                        <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>{returnText(row)}</div>
                      </div>
                      {note && <div className="llm-account-note">{note}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </>
  )
}
