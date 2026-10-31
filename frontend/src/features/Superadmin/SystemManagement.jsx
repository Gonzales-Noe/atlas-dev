import { useCallback, useEffect, useState } from 'react'
import { Switch, FormControlLabel, TextField } from '@mui/material'
import { StatusNotice } from '../../components/StatusNotice'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import atlasMaintenance from '../../assets/atlas-maintenance.png'
import { Cpu, HardDrive, MemoryStick, Activity } from 'lucide-react'
import SuperAdminLayout from './SuperAdminLayout'
import { StatCard, GlassCard, PageHeader, StatusChip, ProgressBar, PrimaryBtn } from '../../components/ui'
import api from '../../config/api'
import { cssColor, loadBrandTheme } from '../../utils/brandTheme'
import LlmHealthPanel from './LlmHealthPanel'

const tooltipStyle = {
  background: 'var(--shell-menu-bg, #16161E)',
  border: '1px solid var(--border-color)',
  borderRadius: 12,
  color: 'var(--text-primary)',
  fontSize: '0.82rem',
}
const axisStyle = { fill: 'var(--text-tertiary)', fontSize: 11, fontFamily: 'var(--font-sans)' }

const STATUS_TYPE = {
  healthy: 'success',
  warning: 'warning',
  critical: 'error',
  limited: 'warning',
  unknown: 'inactive',
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function toLocalInput(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function tomorrowStartValue() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(0, 0, 0, 0)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00`
}

function isLaterDay(value) {
  if (!value) return false
  const chosen = new Date(value)
  if (Number.isNaN(chosen.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const day = new Date(chosen)
  day.setHours(0, 0, 0, 0)
  return day.getTime() > today.getTime()
}

function clockLabel(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function SystemManagement() {
  const [health, setHealth] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [maintenance, setMaintenance] = useState(false)
  const [message, setMessage] = useState('')
  const [noticeEnabled, setNoticeEnabled] = useState(false)
  const [scheduledFor, setScheduledFor] = useState('')
  const [scheduledUntil, setScheduledUntil] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(() => {
    api.get('/auth/system-health/')
      .then(({ data }) => {
        setHealth(data)
        setError('')
        setMaintenance(Boolean(data.maintenance_enabled))
        setMessage(data.maintenance_message || '')
        setNoticeEnabled(Boolean(data.maintenance_notice_enabled))
        setScheduledFor(toLocalInput(data.maintenance_scheduled_for))
        setScheduledUntil(toLocalInput(data.maintenance_scheduled_until))
      })
      .catch(err => {
        setError(err.response?.data?.detail || 'System health could not be loaded.')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [load])

  async function saveMaintenance(patch = {}) {
    const nextEnabled = patch.maintenance_enabled ?? maintenance
    const nextNotice = patch.maintenance_notice_enabled ?? noticeEnabled
    const nextWhen = patch.scheduledFor ?? scheduledFor
    const nextUntil = patch.scheduledUntil ?? scheduledUntil
    if (nextNotice && !isLaterDay(nextWhen)) {
      setError('Choose a start on a later day, and include the time. It cannot be today.')
      return
    }
    if (nextNotice && !nextUntil) {
      setError('Choose the time maintenance ends.')
      return
    }
    if (nextNotice && new Date(nextUntil) <= new Date(nextWhen)) {
      setError('The end time has to be after the start.')
      return
    }
    setSaving(true)
    setNotice('')
    setError('')
    try {
      await api.patch('/auth/platform-theme/', {
        maintenance_enabled: nextEnabled,
        maintenance_message: message,
        maintenance_notice_enabled: nextNotice,
        maintenance_scheduled_for: nextWhen ? new Date(nextWhen).toISOString() : null,
        maintenance_scheduled_until: nextUntil ? new Date(nextUntil).toISOString() : null,
      })
      setMaintenance(nextEnabled)
      setNoticeEnabled(nextNotice)
      await loadBrandTheme()
      const windowLabel = nextWhen && nextUntil
        ? `from ${new Date(nextWhen).toLocaleString()} until ${new Date(nextUntil).toLocaleString()}`
        : ''
      setNotice(nextEnabled
        ? 'Maintenance mode is on. Other roles are paused.'
        : nextNotice
          ? `The banner is on. Maintenance runs ${windowLabel}.`
          : 'Maintenance settings saved.')
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Maintenance mode could not be updated.')
    } finally {
      setSaving(false)
    }
  }

  const cpu = health?.cpu?.percent
  const memory = health?.memory?.percent
  const disk = health?.disk?.percent
  const primary = cssColor('--brand-primary', '#AA2423')
  const accent = cssColor('--brand-accent', '#E24B4A')
  const history = (health?.history || []).map(point => ({
    ...point,
    label: clockLabel(point.time),
  }))
  const loadAverage = health?.load
  const lagRows = health?.lag?.components || []
  const slowestLag = Math.max(0, ...lagRows.map(row => row.latency_ms || 0))
  const slowest = health?.lag?.slowest
  const down = health?.lag?.down || []

  return (
    <SuperAdminLayout>
      <PageHeader
        title="System Health"
        subtitle="Database storage, server disk, and which part of the stack is slow"
      />

      <StatusNotice message={error} severity="error" />
      <StatusNotice message={notice} severity="success" />

      <LlmHealthPanel />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 16 }}>
        <StatCard
          title="Overall"
          value={loading ? '…' : (health?.overall ? health.overall.charAt(0).toUpperCase() + health.overall.slice(1) : '—')}
          icon={<Activity size={18} color={accent} />}
          accent={accent}
        />
        <StatCard title="CPU" value={cpu == null ? '—' : `${cpu}%`} icon={<Cpu size={18} color={primary} />} accent={primary} sub={health?.host?.cpu_count ? `${health.host.cpu_count} cores` : ''} />
        <StatCard title="Memory" value={memory == null ? '—' : `${memory}%`} icon={<MemoryStick size={18} color="#60AAFF" />} accent="#60AAFF" sub={health?.memory?.used_label ? `${health.memory.used_label} of ${health.memory.total_label}` : 'Not reported'} />
        <StatCard title="Disk" value={disk == null ? '—' : `${disk}%`} icon={<HardDrive size={18} color="#FFB74D" />} accent="#FFB74D" sub={health?.disk?.free_label ? `${health.disk.free_label} free` : ''} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <GlassCard>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>LOAD AVERAGE</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: 6 }}>
            {loadAverage ? `${loadAverage['1']} · ${loadAverage['5']} · ${loadAverage['15']}` : 'Not reported'}
          </div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: 4 }}>1, 5, and 15 minutes</div>
        </GlassCard>
        <GlassCard>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>UPTIME</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: 6 }}>{health?.uptime?.label || '—'}</div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: 4 }}>{health?.host?.hostname || ''}</div>
        </GlassCard>
        <GlassCard>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>DATABASE</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: 6 }}>{health?.database?.size_label || (health?.database?.ok ? 'Connected' : 'Down')}</div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: 4 }}>
            {health?.database?.vendor || '—'}{health?.database?.latency_ms != null ? ` · ${health.database.latency_ms} ms` : ''}
          </div>
        </GlassCard>
      </div>

      {(slowest || down.length > 0) && (
        <GlassCard style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>WHERE TIME IS GOING</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: 6 }}>
            {slowest ? `${slowest.name} is the slowest · ${slowest.latency_ms} ms` : 'A service is not answering'}
          </div>
          {down.length > 0 && (
            <div style={{ color: 'var(--status-warning)', fontSize: '0.85rem', marginTop: 6 }}>
              Not answering: {down.join(', ')}
            </div>
          )}
        </GlassCard>
      )}

      <div className="atlas-health-split" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <GlassCard title="Database storage">
          <div style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 }}>{health?.database?.size_label || '—'}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '6px 0 14px' }}>
            {health?.database?.ok
              ? `Read in ${health.database.latency_ms} ms${health.database.name ? ` · ${health.database.name}` : ''}`
              : 'Database did not respond'}
          </div>
          {(health?.database?.tables || []).length === 0 && (
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Table sizes appear when the database is PostgreSQL.</p>
          )}
          {(health?.database?.tables || []).map(table => (
            <div key={table.name} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.82rem' }}>
                <span>{table.name}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{table.size_label} · {table.share}%</span>
              </div>
              <div style={{ marginTop: 4, height: 6, background: 'var(--track-bg)', borderRadius: 99 }}>
                <div style={{ width: `${Math.min(table.share, 100)}%`, height: '100%', background: primary, borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </GlassCard>

        <GlassCard title="Server storage">
          <div style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 }}>
            {disk == null ? '—' : `${disk}% used`}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '6px 0 14px' }}>
            {health?.disk?.used_label && health?.disk?.total_label
              ? `${health.disk.used_label} of ${health.disk.total_label} · ${health.disk.free_label} free`
              : 'Disk could not be read'}
            {health?.disk?.path ? ` · ${health.disk.path}` : ''}
          </div>
          <ProgressBar label="Server disk" value={disk || 0} color="#FFB74D" />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 14, fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Uploaded files</span>
            <strong>{health?.disk?.media?.size_label || '—'}</strong>
          </div>
          {(health?.disk?.mounts || []).filter(mount => mount.mount !== health?.disk?.path).map(mount => (
            <div key={mount.mount} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8, fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{mount.mount}</span>
              <span>{mount.used_label} · {mount.percent}%</span>
            </div>
          ))}
        </GlassCard>
      </div>

      <GlassCard title="Response time" style={{ marginBottom: 16 }}>
        <p style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
          Each bar is how long that part took to answer. The longest bar is what is lagging.
        </p>
        {lagRows.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>{loading ? 'Timing the stack…' : 'No timing yet.'}</p>}
        {lagRows.map(row => {
          const width = row.latency_ms == null || !slowestLag ? 0 : Math.max(4, Math.min(100, (row.latency_ms / slowestLag) * 100))
          const bar = row.status === 'critical' ? '#FF453A' : row.status === 'warning' ? '#FFB74D' : primary
          return (
            <div key={row.name} style={{ padding: '10px 0', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <strong>{row.name}</strong>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{row.latency_ms == null ? '—' : `${row.latency_ms} ms`}</span>
                  <StatusChip label={row.status} type={STATUS_TYPE[row.status] || 'default'} />
                </span>
              </div>
              <div style={{ marginTop: 6, height: 6, background: 'var(--track-bg)', borderRadius: 99 }}>
                {row.latency_ms != null && <div style={{ width: `${width}%`, height: '100%', background: bar, borderRadius: 99 }} />}
              </div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: 4 }}>{row.detail}</div>
            </div>
          )
        })}
      </GlassCard>

      <GlassCard title="Host load" style={{ marginBottom: 16 }}>
        {history.length < 2 ? (
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            The chart fills from this server about once a minute and keeps 24 hours of samples.
            {history.length === 1 ? ' One sample is stored so far.' : ' The first sample is stored the next time someone uses ATLAS.'}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={history} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis domain={[0, 100]} tick={axisStyle} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Area type="monotone" dataKey="cpu" name="CPU %" stroke={primary} fill={primary} fillOpacity={0.2} strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="memory" name="Memory %" stroke="#60AAFF" fill="#60AAFF" fillOpacity={0.15} strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="disk" name="Disk %" stroke="#FFB74D" fill="#FFB74D" fillOpacity={0.12} strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
        <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: 8 }}>
          {health?.collected_at ? `Checked ${new Date(health.collected_at).toLocaleTimeString()}` : ''}
          {health?.host?.platform ? ` · ${health.host.platform}` : ''}
          {health?.host?.python ? ` · Python ${health.host.python}` : ''}
        </div>
      </GlassCard>

      <div style={{ marginBottom: 16 }}>
        <GlassCard title="Services" style={{ padding: 0 }}>
          <div style={{ padding: '4px 8px 8px' }}>
            {(health?.services || []).map(service => (
              <div key={service.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '12px 14px', borderTop: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{service.name}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 2 }}>{service.detail}</div>
                </div>
                <StatusChip label={service.status} type={STATUS_TYPE[service.status] || 'default'} />
              </div>
            ))}
            {!health?.services?.length && (
              <p style={{ color: 'var(--text-secondary)', padding: '8px 14px' }}>{loading ? 'Checking services…' : 'No service report yet.'}</p>
            )}
          </div>
        </GlassCard>
      </div>

      <div className="atlas-health-split" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <GlassCard title="This deployment">
          <div style={{ display: 'grid', gap: 10, fontSize: '0.9rem' }}>
            {[
              ['Active users', health?.application?.active_users],
              ['Faculty', health?.application?.faculty],
              ['Admins', health?.application?.admins],
              ['Task broker', health?.worker?.detail],
              ['Cache', health?.cache?.detail],
              ['Mode', health?.application?.debug ? 'Development' : 'Production'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <strong>{value ?? '—'}</strong>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard title="Maintenance mode">
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <img
              src={atlasMaintenance}
              alt="ATLAS with a wrench and toolbox"
              style={{ width: 120, height: 160, objectFit: 'contain', imageRendering: 'pixelated', flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: 0 }}>
                When maintenance is on, faculty and institution admins see this screen and their API calls pause.
                Superadmin access stays open.
              </p>
              <TextField
                label="Message shown during maintenance"
                value={message}
                onChange={event => setMessage(event.target.value)}
                fullWidth
                multiline
                minRows={3}
                inputProps={{ maxLength: 500 }}
                InputLabelProps={{ shrink: true }}
                sx={{ mt: 1, mb: 1.5 }}
              />
              <FormControlLabel
                control={<Switch checked={maintenance} disabled={saving} onChange={event => saveMaintenance({ maintenance_enabled: event.target.checked })} />}
                label={maintenance ? 'Maintenance is on' : 'Maintenance is off'}
              />
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-color)' }}>
                <FormControlLabel
                  control={<Switch checked={noticeEnabled} disabled={saving} onChange={event => setNoticeEnabled(event.target.checked)} />}
                  label="Show a banner that maintenance is coming"
                />
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '4px 0 12px' }}>
                  Faculty and admins see the banner before the pause. Set the day and time it starts, and the time it ends. The start cannot be today.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>Starts</div>
                    <TextField
                      type="datetime-local"
                      value={scheduledFor}
                      onChange={event => {
                        const next = event.target.value
                        if (next && !isLaterDay(next)) {
                          setError('Choose a later day. Today and earlier dates are not available.')
                          return
                        }
                        setScheduledFor(next)
                      }}
                      fullWidth
                      size="small"
                      hiddenLabel
                      inputProps={{ min: tomorrowStartValue(), 'aria-label': 'Maintenance starts' }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>Until</div>
                    <TextField
                      type="datetime-local"
                      value={scheduledUntil}
                      onChange={event => {
                        const next = event.target.value
                        if (next && !isLaterDay(next)) {
                          setError('Choose a later day. Today and earlier dates are not available.')
                          return
                        }
                        setScheduledUntil(next)
                      }}
                      fullWidth
                      size="small"
                      hiddenLabel
                      inputProps={{ min: (scheduledFor && isLaterDay(scheduledFor) ? scheduledFor : tomorrowStartValue()), 'aria-label': 'Maintenance ends' }}
                    />
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <PrimaryBtn disabled={saving} onClick={() => saveMaintenance()}>
                  {saving ? 'Saving' : 'Save maintenance'}
                </PrimaryBtn>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .atlas-health-split { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </SuperAdminLayout>
  )
}
