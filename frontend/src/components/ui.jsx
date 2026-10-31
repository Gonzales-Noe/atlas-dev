// src/components/ui.jsx
// Shared dark glassmorphism UI primitives for all ATLAS dashboards

import React from 'react'

// ── Page header ───────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 480px', minWidth: 0 }}>
        <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
            {subtitle}
          </p>
        )}
      </div>
      {action && <div style={{ flexShrink: 0, marginLeft: 'auto' }}>{action}</div>}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
export function StatCard({ title, value, sub, icon, trend, trendUp, accent = '#E24B4A' }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 20,
      padding: '20px 22px',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'var(--shadow-card)',
      transition: 'transform 250ms var(--ease), box-shadow 250ms var(--ease), border-color 250ms var(--ease)',
      cursor: 'default',
      position: 'relative',
      overflow: 'hidden',
    }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'var(--shadow-card)'
        e.currentTarget.style.borderColor = 'var(--border-color)'
      }}
    >
      {/* Glow accent */}
      <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: accent, opacity: 0.08, filter: 'blur(20px)', pointerEvents: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: '0.77rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          {title}
        </span>
        {icon && (
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: `color-mix(in srgb, ${accent} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${accent} 28%, transparent)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem', flexShrink: 0,
          }}>
            {icon}
          </div>
        )}
      </div>

      <div style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1, marginBottom: 8, letterSpacing: '-0.02em' }}>
        {value}
      </div>

      {(trend || sub) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {trend && (
            <span style={{
              fontSize: '0.72rem', fontWeight: 700,
              color: trendUp ? 'var(--green)' : (trendUp === false ? 'var(--red-status)' : 'var(--text-secondary)'),
              background: trendUp ? 'rgba(52,199,89,0.12)' : (trendUp === false ? 'rgba(255,69,58,0.12)' : 'rgba(255,255,255,0.07)'),
              border: `1px solid ${trendUp ? 'rgba(52,199,89,0.25)' : trendUp === false ? 'rgba(255,69,58,0.25)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 6, padding: '2px 7px',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              {trendUp === true ? '↑' : trendUp === false ? '↓' : ''} {trend}
            </span>
          )}
          {sub && <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{sub}</span>}
        </div>
      )}
    </div>
  )
}

// ── Glass card ────────────────────────────────────────────────────────────────
export function GlassCard({ children, style = {}, title, titleAction }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 20,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'var(--shadow-card)',
      overflow: 'hidden',
      ...style,
    }}>
      {title && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px 0',
          marginBottom: 16,
        }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
          {titleAction}
        </div>
      )}
      <div style={{ padding: title ? '0 22px 20px' : 22 }}>
        {children}
      </div>
    </div>
  )
}

// ── Status chip ───────────────────────────────────────────────────────────────
export function StatusChip({ label, type = 'default' }) {
  const colors = {
    active:   { bg: 'rgba(52,199,89,0.12)',  border: 'rgba(52,199,89,0.3)',  color: 'var(--status-success)' },
    inactive: { bg: 'var(--chip-muted-bg)', border: 'var(--chip-muted-border)', color: 'var(--status-muted)' },
    success:  { bg: 'rgba(52,199,89,0.12)',  border: 'rgba(52,199,89,0.3)',  color: 'var(--status-success)' },
    error:    { bg: 'rgba(255,69,58,0.12)',  border: 'rgba(255,69,58,0.3)',  color: '#E24B4A' },
    warning:  { bg: 'rgba(255,159,10,0.12)', border: 'rgba(255,159,10,0.3)', color: 'var(--status-warning)' },
    info:     { bg: 'rgba(10,132,255,0.12)', border: 'rgba(10,132,255,0.3)', color: 'var(--status-info)' },
    premium:  { bg: 'rgba(255,214,10,0.12)', border: 'rgba(255,214,10,0.3)', color: 'var(--status-premium)' },
    default:  { bg: 'var(--chip-muted-bg)', border: 'var(--chip-muted-border)', color: 'var(--text-secondary)' },
  }
  const c = colors[type] || colors.default
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 7, padding: '3px 9px',
      fontSize: '0.7rem', fontWeight: 700,
      color: c.color, letterSpacing: '0.05em',
      fontFamily: 'var(--font-sans)',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
      {label?.toUpperCase()}
    </span>
  )
}

// ── Dark button ───────────────────────────────────────────────────────────────
export function PrimaryBtn({ children, onClick, disabled, small, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'linear-gradient(135deg, var(--brand-primary-hover), var(--brand-primary))',
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        padding: small ? '7px 14px' : '9px 18px',
        fontSize: small ? '0.8rem' : '0.88rem',
        fontWeight: 700,
        fontFamily: 'var(--font-sans)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 7,
        transition: 'all 200ms var(--ease)',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
        ...style,
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px var(--brand-glow)' } }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
    >
      {children}
    </button>
  )
}

export function OutlineBtn({ children, onClick, disabled, small, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'transparent',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: 10,
        padding: small ? '6px 13px' : '8px 17px',
        fontSize: small ? '0.8rem' : '0.88rem',
        fontWeight: 600,
        fontFamily: 'var(--font-sans)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 7,
        transition: 'all 200ms var(--ease)',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
        ...style,
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = 'var(--bg-header)'; e.currentTarget.style.borderColor = 'var(--active-color)' } }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border-color)' }}
    >
      {children}
    </button>
  )
}

// ── Metric row (for performance lists) ───────────────────────────────────────
export function MetricRow({ label, value, status, statusType, divider = true }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
        <div>
          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
        </div>
        {status && <StatusChip label={status} type={statusType || 'default'} />}
      </div>
      {divider && <div style={{ height: 1, background: 'var(--border-color)' }} />}
    </>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────
export function ProgressBar({ value, max = 100, color = 'var(--brand-primary)', label }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const fill = String(color).includes('var(') || String(color).startsWith('rgb')
    ? color
    : `linear-gradient(90deg, ${color}88, ${color})`
  return (
    <div>
      {label && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span><span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{value}%</span>
      </div>}
      <div style={{ height: 6, background: 'var(--track-bg)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: fill, borderRadius: 99, transition: 'width 600ms var(--ease)' }} />
      </div>
    </div>
  )
}