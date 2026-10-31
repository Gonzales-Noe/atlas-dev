import { useEffect, useState } from 'react'
import { StatusNotice } from '../../../components/StatusNotice'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BookOpen, ClipboardCheck, Files, Layers } from 'lucide-react'
import { GlassCard, StatCard } from '../../../components/ui'
import { fetchFacultyProductivity } from './academicApi'

const SERIES = [
  { key: 'syllabi', name: 'Syllabi', color: 'var(--brand-primary)' },
  { key: 'modules', name: 'Modules', color: 'var(--brand-accent)' },
  { key: 'assessments', name: 'Assessments', color: '#60AAFF' },
  { key: 'source_files', name: 'Source files', color: '#C4A000' },
]

const tooltipStyle = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-color)',
  borderRadius: 12,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-sans)',
  fontSize: '0.82rem',
  boxShadow: 'var(--shadow-card)',
}

const axisStyle = { fill: 'var(--text-tertiary)', fontSize: 11, fontFamily: 'var(--font-sans)' }

const PACE_SERIES = [
  { key: 'syllabus', name: 'Syllabus', color: 'var(--brand-primary)' },
  { key: 'module', name: 'Modules', color: 'var(--brand-accent)' },
  { key: 'assessment', name: 'Assessments', color: '#60AAFF' },
  { key: 'grading', name: 'Grading', color: '#C4A000' },
  { key: 'analytics', name: 'Analytics', color: '#5EDA7E' },
]

const EMPTY = {
  totals: { syllabi: 0, modules: 0, assessments: 0, source_files: 0 },
  mix: SERIES.map(series => ({ name: series.name, key: series.key, value: 0 })),
  weekly: [],
  pace: { weekly: [], monthly: [], average: { weekly: {}, monthly: {} } },
}

function ChartLegend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', justifyContent: 'center', paddingTop: 8 }}>
      {SERIES.map(series => (
        <span key={series.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: series.color, flexShrink: 0 }} />
          {series.name}
        </span>
      ))}
    </div>
  )
}

export default function FacultyProductivity() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [pacePeriod, setPacePeriod] = useState('weekly')

  useEffect(() => {
    let cancelled = false
    fetchFacultyProductivity()
      .then(payload => {
        if (!cancelled) setData(payload)
      })
      .catch(err => {
        if (!cancelled) {
          setError(err?.response?.data?.detail || 'Could not load faculty productivity.')
          setData(EMPTY)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const totals = data?.totals || EMPTY.totals
  const mix = Array.isArray(data?.mix) ? data.mix : EMPTY.mix
  const weekly = Array.isArray(data?.weekly) ? data.weekly : []
  const pace = data?.pace && typeof data.pace === 'object' ? data.pace : EMPTY.pace
  const paceRows = Array.isArray(pace[pacePeriod]) ? pace[pacePeriod] : []
  const paceAverages = pace.average?.[pacePeriod] || {}
  const produced = SERIES.reduce((sum, series) => sum + (Number(totals[series.key]) || 0), 0)
  const pieData = produced > 0 ? mix : [{ name: 'No output yet', key: 'empty', value: 1 }]
  const paceMax = paceRows.reduce((max, row) => Math.max(
    max,
    ...PACE_SERIES.map(series => Number(row[series.key]) || 0),
  ), 0)
  const slowest = PACE_SERIES.reduce((best, series) => {
    const value = Number(paceAverages[series.key])
    if (!Number.isFinite(value) || value <= 0) return best
    if (!best || value > best.value) return { name: series.name, value }
    return best
  }, null)
  const weekMax = weekly.reduce(
    (max, row) => Math.max(max, SERIES.reduce((sum, series) => sum + (Number(row[series.key]) || 0), 0)),
    0,
  )

  return (
    <section style={{ marginTop: 8 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: '#60AAFF', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Faculty productivity
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4, lineHeight: 1.5 }}>
          Institution totals for syllabi, modules, assessments, and source files.
        </div>
      </div>

      <StatusNotice message={error} severity="error" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 16 }}>
        <StatCard title="Syllabi" value={data ? totals.syllabi : '—'} icon={<BookOpen size={18} color="var(--brand-primary)" />} accent="var(--brand-primary)" />
        <StatCard title="Modules" value={data ? totals.modules : '—'} icon={<Layers size={18} color="var(--brand-accent)" />} accent="var(--brand-accent)" />
        <StatCard title="Assessments" value={data ? totals.assessments : '—'} icon={<ClipboardCheck size={18} color="#60AAFF" />} accent="#60AAFF" />
        <StatCard title="Source files" value={data ? totals.source_files : '—'} icon={<Files size={18} color="#C4A000" />} accent="#C4A000" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
        <GlassCard title="Output over the last 12 weeks">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={weekly} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="week" tick={axisStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis
                tick={axisStyle}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                domain={[0, weekMax === 0 ? 4 : 'auto']}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend content={<ChartLegend />} />
              {SERIES.map(series => (
                <Area
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  name={series.name}
                  stackId="output"
                  stroke={series.color}
                  fill={series.color}
                  fillOpacity={0.28}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </GlassCard>

        <GlassCard title="What faculty produced">
          <div style={{ position: 'relative' }}>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={90}
                  paddingAngle={produced > 0 ? 3 : 0}
                  stroke="none"
                >
                  {pieData.map(entry => {
                    const series = SERIES.find(item => item.key === entry.key)
                    return <Cell key={entry.key || entry.name} fill={series ? series.color : 'var(--border-color)'} />
                  })}
                </Pie>
                {produced > 0 && <Tooltip contentStyle={tooltipStyle} />}
                {produced > 0 && <Legend content={<ChartLegend />} />}
              </PieChart>
            </ResponsiveContainer>
            {produced === 0 && data && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.82rem',
                fontWeight: 700,
                pointerEvents: 'none',
              }}>
                No output yet
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      <GlassCard
        title={pacePeriod === 'weekly' ? 'Average time per week' : 'Average time per month'}
        titleAction={(
          <div style={{ display: 'flex', gap: 8 }}>
            {[['weekly', 'Week'], ['monthly', 'Month']].map(([value, label]) => {
              const active = pacePeriod === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPacePeriod(value)}
                  style={{
                    color: active ? '#fff' : 'var(--text-primary)',
                    background: active ? 'var(--brand-primary)' : 'var(--shell-btn-bg)',
                    border: '1px solid var(--shell-btn-border)',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}
      >
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5, marginBottom: 8 }}>
          {slowest
            ? `${slowest.name} has the highest average, ${slowest.value} days before it is finished.`
            : 'Average days from the previous workspace step until this one is finished.'}
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={paceRows} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
            <XAxis dataKey="period" tick={axisStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis
              tick={axisStyle}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              domain={[0, paceMax === 0 ? 4 : 'auto']}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => [value == null ? '—' : `${value} days`, name]}
            />
            <Legend content={() => (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', justifyContent: 'center', paddingTop: 8 }}>
                {PACE_SERIES.map(series => (
                  <span key={series.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: series.color, flexShrink: 0 }} />
                    {series.name}
                  </span>
                ))}
              </div>
            )} />
            {PACE_SERIES.map(series => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                name={series.name}
                stroke={series.color}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </GlassCard>
    </section>
  )
}
