import { useCallback, useEffect, useState } from 'react'
import { Switch, FormControlLabel, TextField, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material'
import { StatusNotice, showStatusNotice } from '../../components/StatusNotice'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import atlasMaintenance from '../../assets/atlas-maintenance.png'
import { Cpu, HardDrive, MemoryStick, Activity } from 'lucide-react'
import SuperAdminLayout from './SuperAdminLayout'
import { StatCard, GlassCard, PageHeader, StatusChip, ProgressBar, PrimaryBtn, OutlineBtn } from '../../components/ui'
import api, { ensureFreshAccessToken } from '../../config/api'
import { extractApiError } from '../../utils'
import { cssColor, loadBrandTheme } from '../../utils/brandTheme'
import LlmHealthPanel from './LlmHealthPanel'

function publishApkErrorMessage(err) {
  const status = err?.response?.status
  if (status === 401) {
    return 'Your session expired during the upload. Choose the APK again and publish — it was not saved.'
  }
  if (status === 403) {
    return 'Only the IT superadmin can publish ATLAS Mobile.'
  }
  if (status === 413) {
    return 'The APK was rejected as too large by the server. Use a split build under ~55 MB (arm64-v8a).'
  }
  if (status === 502 || status === 504) {
    return 'The server timed out while receiving the APK. Keep this tab open and try again on a stronger connection.'
  }
  if (err?.code === 'ECONNABORTED') {
    return 'The upload timed out. Try a smaller APK (split-per-abi) or a stronger connection.'
  }
  if (!err?.response) {
    return 'The upload was interrupted. Use a smaller APK (flutter build apk --release --split-per-abi) and try again.'
  }
  const extracted = extractApiError(err)
  if (extracted && !/<html|<!doctype/i.test(extracted) && extracted.length < 280) {
    return extracted
  }
  if (status === 500) {
    return 'The server could not save the APK. Check VPS disk space, then try again.'
  }
  return status
    ? `The APK could not be published (error ${status}).`
    : 'The APK could not be published.'
}

const scheduleFieldSx = {
  '& .MuiInputBase-root.Mui-disabled': { background: '#F3F4F6' },
  '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: '#9CA3AF' },
}

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

function tomorrowStartValue() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(0, 0, 0, 0)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00`
}

function fromDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function oneMinuteAfter(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return tomorrowStartValue()
  date.setMinutes(date.getMinutes() + 1)
  const next = fromDate(date)
  const floor = tomorrowStartValue()
  return next > floor ? next : floor
}

function formatWhen(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
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
  const [scheduling, setScheduling] = useState(false)
  const [starts, setStarts] = useState('')
  const [until, setUntil] = useState('')
  const [schedules, setSchedules] = useState([])
  const [pendingDelete, setPendingDelete] = useState(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [mobileRelease, setMobileRelease] = useState(null)
  const [mobileVersion, setMobileVersion] = useState('1.0.0')
  const [mobileCode, setMobileCode] = useState('1')
  const [mobileNotes, setMobileNotes] = useState('')
  const [mobileFile, setMobileFile] = useState(null)
  const [mobilePublishing, setMobilePublishing] = useState(false)
  const [mobileUploadPct, setMobileUploadPct] = useState(null)
  const [mobileSavingNotes, setMobileSavingNotes] = useState(false)

  const load = useCallback(() => {
    api.get('/auth/system-health/')
      .then(({ data }) => {
        setHealth(data)
        setError('')
        setMaintenance(Boolean(data.maintenance_enabled))
        setMessage(data.maintenance_message || '')
        setSchedules(Array.isArray(data.maintenance_schedules) ? data.maintenance_schedules : [])
      })
      .catch(err => {
        setError(err.response?.data?.detail || 'System health could not be loaded.')
      })
      .finally(() => setLoading(false))
  }, [])

  const loadMobileRelease = useCallback(() => {
    api.get('/auth/mobile-app/', { atlasCache: false, skipAtlasErrorCard: true })
      .then(({ data }) => {
        setMobileRelease(data || null)
        if (data?.version_name) setMobileVersion(data.version_name)
        if (data?.version_code) setMobileCode(String(data.version_code))
        if (data?.release_notes) setMobileNotes(data.release_notes)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
    loadMobileRelease()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [load, loadMobileRelease])

  async function saveMobileNotes() {
    if (!mobileRelease?.available) {
      showStatusNotice('Publish an APK first. What’s New can be edited after a build is live.', 'error')
      return
    }
    setMobileSavingNotes(true)
    setNotice('')
    setError('')
    try {
      const { data } = await api.patch('/auth/mobile-app/', {
        release_notes: mobileNotes.trim(),
      }, { skipAtlasErrorCard: true })
      setMobileRelease(data || null)
      showStatusNotice('What’s New text was updated. Faculty see the new bullets — no APK reupload needed.', 'success')
      loadMobileRelease()
    } catch (err) {
      const detail = err.response?.data?.detail
      showStatusNotice(
        typeof detail === 'string' && detail.trim() ? detail : 'What’s New could not be saved.',
        'error',
      )
    } finally {
      setMobileSavingNotes(false)
    }
  }

  async function publishMobileApp() {
    if (!mobileFile) {
      showStatusNotice(
        'Choose an APK file to publish. To fix a wrong APK, pick the correct file and publish again.',
        'error',
      )
      return
    }
    const sizeMb = mobileFile.size / (1024 * 1024)
    if (sizeMb > 55) {
      showStatusNotice(
        `This APK is ${sizeMb.toFixed(0)} MB. Uploads over ~55 MB get cut off by the host. Build a smaller install with: flutter build apk --release --split-per-abi (use the arm64-v8a file), then try again.`,
        'error',
      )
      return
    }
    setMobilePublishing(true)
    setMobileUploadPct(0)
    setNotice('')
    setError('')
    try {
      // Access tokens last 15 minutes; Django checks auth after the full APK arrives.
      // Refresh first so a slow upload does not 401 and restart (or fail) at ~90%.
      await ensureFreshAccessToken()
      const form = new FormData()
      form.append('apk', mobileFile)
      form.append('version_name', mobileVersion.trim())
      form.append('version_code', String(mobileCode).trim())
      form.append('release_notes', mobileNotes.trim())
      // Let the browser set multipart Content-Type + boundary (do not force Content-Type).
      const { data } = await api.post('/auth/mobile-app/', form, {
        timeout: 600000,
        skipAtlasErrorCard: true,
        // Do not re-POST the APK after a mid-upload 401 — that restarts progress at 0%.
        atlasNoRetry: true,
        onUploadProgress: (event) => {
          const total = event.total || mobileFile.size || 0
          if (!total) return
          // Cap at 99 until the server finishes saving the APK.
          // Never move backwards (auth retries / odd XHR totals caused 89% → 2%).
          const next = Math.min(99, Math.round((event.loaded / total) * 100))
          setMobileUploadPct((prev) => Math.max(prev ?? 0, next))
        },
      })
      setMobileUploadPct(100)
      setMobileRelease(data || null)
      setMobileFile(null)
      const version = data?.version_name || mobileVersion.trim() || ''
      showStatusNotice(
        version
          ? `ATLAS Mobile ${version} is live. Faculty were notified.`
          : 'ATLAS Mobile is live. Faculty were notified.',
        'success',
      )
      loadMobileRelease()
    } catch (err) {
      console.error('[publishMobileApp]', err?.response?.status, err?.response?.data || err)
      showStatusNotice(publishApkErrorMessage(err), 'error')
    } finally {
      setMobilePublishing(false)
      setMobileUploadPct(null)
    }
  }

  async function saveMaintenance(patch = {}) {
    const nextEnabled = patch.maintenance_enabled ?? maintenance
    const announce = Object.prototype.hasOwnProperty.call(patch, 'maintenance_enabled')
    setSaving(true)
    setNotice('')
    setError('')
    try {
      await api.patch('/auth/platform-theme/', {
        maintenance_enabled: nextEnabled,
        maintenance_message: message,
      })
      setMaintenance(nextEnabled)
      await loadBrandTheme()
      if (announce) {
        setNotice(nextEnabled
          ? 'Maintenance mode is on. Other roles are paused.'
          : 'Maintenance mode is off.')
      }
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Maintenance mode could not be updated.')
    } finally {
      setSaving(false)
    }
  }

  function acceptStart(value) {
    if (value && value < tomorrowStartValue()) return
    setStarts(value)
    if (until && value && until <= value) setUntil('')
  }

  function acceptUntil(value) {
    const floor = starts ? oneMinuteAfter(starts) : tomorrowStartValue()
    if (value && value < floor) return
    setUntil(value)
  }

  async function saveSchedule() {
    const floor = tomorrowStartValue()
    if (!scheduling || !starts || !until || starts < floor || until <= starts) return
    setSaving(true)
    setNotice('')
    setError('')
    try {
      const { data } = await api.post('/auth/maintenance-schedules/', {
        starts_at: new Date(starts).toISOString(),
        ends_at: new Date(until).toISOString(),
      })
      setSchedules(Array.isArray(data.schedules) ? data.schedules : [])
      setStarts('')
      setUntil('')
      setScheduling(false)
      await loadBrandTheme()
      setNotice('The maintenance window was saved.')
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'The schedule could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteSchedule() {
    if (!pendingDelete?.id) return
    setSaving(true)
    setNotice('')
    setError('')
    try {
      const { data } = await api.delete(`/auth/maintenance-schedules/${pendingDelete.id}/`)
      setSchedules(Array.isArray(data.schedules) ? data.schedules : [])
      setPendingDelete(null)
      await loadBrandTheme()
      setNotice('The maintenance schedule was deleted.')
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'The schedule could not be deleted.')
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

      <GlassCard title="ATLAS Mobile release" style={{ marginBottom: 16 }}>
        <p style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          Upload a new APK to replace the faculty install. Every publish notifies all faculty with the version notes.
          Prefer a split build under ~55 MB (`flutter build apk --release --split-per-abi`, usually the arm64-v8a file).
          After a build is live, you can edit What’s New text alone — reupload an APK only when the file itself is wrong.
        </p>
        <div style={{ display: 'grid', gap: 10, fontSize: '0.9rem', marginBottom: 14 }}>
          {[
            ['Current version', mobileRelease?.available ? mobileRelease.version_name : 'Not published yet'],
            ['Build code', mobileRelease?.available ? mobileRelease.version_code : '—'],
            ['File size', mobileRelease?.file_size_label || '—'],
            ['Published', mobileRelease?.published_at ? formatWhen(mobileRelease.published_at) : '—'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
              <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
              <strong>{value ?? '—'}</strong>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="atlas-health-split">
          <TextField
            label="Version name"
            value={mobileVersion}
            onChange={event => setMobileVersion(event.target.value)}
            fullWidth
            size="small"
            placeholder="1.0.0"
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Version code"
            value={mobileCode}
            onChange={event => setMobileCode(event.target.value)}
            fullWidth
            size="small"
            placeholder="1"
            InputLabelProps={{ shrink: true }}
          />
        </div>
        <TextField
          label="What’s new"
          value={mobileNotes}
          onChange={event => setMobileNotes(event.target.value)}
          fullWidth
          multiline
          minRows={4}
          inputProps={{ maxLength: 2000 }}
          InputLabelProps={{ shrink: true }}
          sx={{ mt: 1.5 }}
          placeholder={'One change per line — each line becomes a bullet for faculty.\nClearer scan results\nFaster home screen'}
          helperText="Write one item per line. Faculty see each line as a bullet."
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 14 }}>
          <label style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            border: '1px solid var(--border-color)',
            borderRadius: 10,
            padding: '8px 14px',
            cursor: mobilePublishing ? 'not-allowed' : 'pointer',
            fontWeight: 700,
            fontSize: '0.86rem',
            opacity: mobilePublishing ? 0.6 : 1,
          }}
          >
            Choose APK
            <input
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              hidden
              disabled={mobilePublishing}
              onChange={event => setMobileFile(event.target.files?.[0] || null)}
            />
          </label>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', flex: 1, minWidth: 160 }}>
            {mobileFile ? `${mobileFile.name} · ${(mobileFile.size / (1024 * 1024)).toFixed(0)} MB` : 'No file selected — required only to replace the APK'}
          </span>
          <OutlineBtn
            disabled={mobileSavingNotes || mobilePublishing || !mobileRelease?.available}
            onClick={saveMobileNotes}
          >
            {mobileSavingNotes ? 'Saving…' : 'Save What’s New'}
          </OutlineBtn>
          <PrimaryBtn disabled={mobilePublishing || mobileSavingNotes || !mobileFile} onClick={publishMobileApp}>
            {mobilePublishing
              ? (mobileUploadPct != null && mobileUploadPct < 100
                  ? `Uploading… ${mobileUploadPct}%`
                  : 'Saving on server…')
              : 'Publish & notify faculty'}
          </PrimaryBtn>
        </div>
        {mobilePublishing && mobileUploadPct != null && (
          <div style={{ marginTop: 12 }}>
            <ProgressBar
              label={mobileUploadPct < 100 ? 'Uploading APK' : 'Finishing publish'}
              value={mobileUploadPct}
            />
            <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              {mobileFile
                ? `This ${(mobileFile.size / (1024 * 1024)).toFixed(0)} MB APK can take a few minutes on a typical connection — keep this tab open until it finishes.`
                : 'Large APK uploads can take a few minutes — keep this tab open until it finishes.'}
            </p>
          </div>
        )}
      </GlassCard>

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

        <GlassCard title="Maintenance Mode">
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <img
              src={atlasMaintenance}
              alt="ATLAS with a wrench and toolbox"
              style={{ width: 120, height: 160, objectFit: 'contain', imageRendering: 'pixelated', flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: 0 }}>
                When maintenance is on, faculty and admins see this screen and their API calls pause.
                Superadmin access stays open.
              </p>
              <TextField
                label="Message shown during maintenance"
                value={message}
                onChange={event => setMessage(event.target.value)}
                onBlur={() => {
                  if ((health?.maintenance_message || '') !== message) saveMaintenance()
                }}
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Schedule Maintenance</span>
                  <Switch
                    checked={scheduling}
                    disabled={saving}
                    onChange={event => {
                      const on = event.target.checked
                      setScheduling(on)
                      if (!on) {
                        setStarts('')
                        setUntil('')
                      }
                    }}
                    inputProps={{ 'aria-label': 'Schedule maintenance' }}
                  />
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '4px 0 12px' }}>
                  Faculty and admins see a banner for each saved window.
                </p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 200px', minWidth: 0, opacity: scheduling ? 1 : 0.55 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: scheduling ? 'var(--text-secondary)' : '#9CA3AF', marginBottom: 6 }}>Starts</div>
                    <TextField
                      type="datetime-local"
                      value={starts}
                      onChange={event => acceptStart(event.target.value)}
                      disabled={!scheduling}
                      fullWidth
                      size="small"
                      hiddenLabel
                      inputProps={{ min: tomorrowStartValue(), step: 60, 'aria-label': 'Maintenance starts' }}
                      sx={scheduleFieldSx}
                    />
                  </div>
                  <div style={{ flex: '1 1 200px', minWidth: 0, opacity: scheduling ? 1 : 0.55 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: scheduling ? 'var(--text-secondary)' : '#9CA3AF', marginBottom: 6 }}>Until</div>
                    <TextField
                      type="datetime-local"
                      value={until}
                      onChange={event => acceptUntil(event.target.value)}
                      disabled={!scheduling}
                      fullWidth
                      size="small"
                      hiddenLabel
                      inputProps={{
                        min: starts ? oneMinuteAfter(starts) : tomorrowStartValue(),
                        step: 60,
                        'aria-label': 'Maintenance ends',
                      }}
                      sx={scheduleFieldSx}
                    />
                  </div>
                  <PrimaryBtn
                    disabled={!scheduling || saving || !starts || !until || until <= starts}
                    onClick={saveSchedule}
                    style={{ marginLeft: 'auto', height: 40 }}
                  >
                    {saving ? 'Saving' : 'Save'}
                  </PrimaryBtn>
                </div>
                {schedules.length > 0 && (
                  <div style={{ marginTop: 16, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                          <th style={{ fontWeight: 700, padding: '8px 10px', borderBottom: '1px solid var(--border-color)' }}>Starts</th>
                          <th style={{ fontWeight: 700, padding: '8px 10px', borderBottom: '1px solid var(--border-color)' }}>Until</th>
                          <th style={{ fontWeight: 700, padding: '8px 10px', borderBottom: '1px solid var(--border-color)', width: 90 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {schedules.map(row => (
                          <tr key={row.id}>
                            <td style={{ padding: '10px', borderBottom: '1px solid var(--border-color)' }}>{formatWhen(row.starts_at)}</td>
                            <td style={{ padding: '10px', borderBottom: '1px solid var(--border-color)' }}>{formatWhen(row.ends_at)}</td>
                            <td style={{ padding: '10px', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>
                              <button
                                type="button"
                                onClick={() => setPendingDelete(row)}
                                disabled={saving}
                                style={{
                                  border: 0,
                                  background: 'transparent',
                                  color: '#AA2423',
                                  fontWeight: 700,
                                  cursor: saving ? 'not-allowed' : 'pointer',
                                  fontFamily: 'inherit',
                                }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
      <Dialog
        open={Boolean(pendingDelete)}
        onClose={() => { if (!saving) setPendingDelete(null) }}
        PaperProps={{ sx: { borderRadius: 3, p: 0.5, maxWidth: 420 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Delete this schedule?</DialogTitle>
        <DialogContent>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            This removes the window from {formatWhen(pendingDelete?.starts_at)} until {formatWhen(pendingDelete?.ends_at)}.
          </p>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <OutlineBtn disabled={saving} onClick={() => setPendingDelete(null)}>Cancel</OutlineBtn>
          <PrimaryBtn disabled={saving} onClick={deleteSchedule}>{saving ? 'Deleting' : 'Delete'}</PrimaryBtn>
        </DialogActions>
      </Dialog>
      <style>{`
        @media (max-width: 900px) {
          .atlas-health-split { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </SuperAdminLayout>
  )
}
