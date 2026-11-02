import { useCallback, useEffect, useState } from 'react'
import AdminLayout from '../roles/Admin/AdminLayout'
import SuperAdminLayout from '../Superadmin/SuperAdminLayout'
import api from '../../config/api'
import { PageHeader, GlassCard, PrimaryBtn } from '../../components/ui'

function when(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function IssueReports({ audience = 'admin' }) {
  const isAdmin = audience === 'admin'
  const Layout = isAdmin ? AdminLayout : SuperAdminLayout
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sendingId, setSendingId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/auth/support-reports/')
      setReports(Array.isArray(data?.reports) ? data.reports : [])
    } catch (err) {
      setError(err?.response?.data?.detail || 'These reports could not be loaded. Try again in a moment.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function sendUp(id) {
    setSendingId(id)
    setError('')
    try {
      const { data } = await api.post(`/auth/support-reports/${id}/forward/`)
      setReports((rows) => rows.map((row) => (row.id === id ? { ...row, ...data } : row)))
    } catch (err) {
      setError(err?.response?.data?.detail || 'This report could not be sent. Try again in a moment.')
    } finally {
      setSendingId('')
    }
  }

  return (
    <Layout>
      <PageHeader
        title="Issue reports"
        subtitle={isAdmin
          ? 'Messages faculty sent from the ATLAS app. Send one to the ATLAS team when the campus needs more help.'
          : 'Messages a campus admin has passed on from faculty in the ATLAS app.'}
      />
      {error && (
        <p style={{ color: 'var(--brand-primary)', margin: '0 0 16px', fontSize: '0.9rem' }}>{error}</p>
      )}
      {loading ? (
        <GlassCard>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading reports…</p>
        </GlassCard>
      ) : reports.length === 0 ? (
        <GlassCard>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {isAdmin
              ? 'No messages yet. When a faculty member reports a problem in the app, it will show up here.'
              : 'Nothing has been sent up yet. A campus admin sends a report here when they want the ATLAS team to look at it.'}
          </p>
        </GlassCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {reports.map((row) => {
            const sent = row.status === 'with_superadmin'
            return (
              <GlassCard key={row.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: '1 1 280px' }}>
                    <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                      {row.faculty_name || 'A faculty member'}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: 2 }}>
                      {[row.faculty_email, row.campus, when(row.created_at)].filter(Boolean).join(' · ')}
                    </div>
                    <p style={{ margin: '12px 0 0', color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {row.message}
                    </p>
                    {row.phone_note ? (
                      <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        Phone details: {row.phone_note}
                      </p>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                    {isAdmin ? (
                      sent ? (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 700 }}>
                          Sent to the ATLAS team{row.forwarded_at ? ` · ${when(row.forwarded_at)}` : ''}
                        </span>
                      ) : (
                        <PrimaryBtn
                          small
                          disabled={sendingId === row.id}
                          onClick={() => sendUp(row.id)}
                        >
                          {sendingId === row.id ? 'Sending…' : 'Send to the ATLAS team'}
                        </PrimaryBtn>
                      )
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 700 }}>
                        From a campus admin{row.forwarded_at ? ` · ${when(row.forwarded_at)}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
