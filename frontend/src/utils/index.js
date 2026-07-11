// src/utils/index.js

// ── Role helpers ───────────────────────────────────────────────────────────
export const ROLES = {
  FACULTY:    'faculty',
  ADMIN:      'admin',
  SUPERADMIN: 'superadmin',
}

export function hasRole(user, ...roles) {
  return roles.includes(user?.role)
}

// ── Format helpers ─────────────────────────────────────────────────────────
export function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── String helpers ─────────────────────────────────────────────────────────
export function truncate(str, max = 80) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

export function toInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('')
}

// ── Error helpers ──────────────────────────────────────────────────────────
export function extractApiError(err) {
  if (!err?.response?.data) return err?.message || 'An unexpected error occurred.'
  const data = err.response.data
  if (typeof data === 'string') return data
  if (data.detail) {
    if (typeof data.detail === 'string') return data.detail
    if (typeof data.detail === 'object') return extractApiError({ response: { data: data.detail } })
  }
  if (data.error) return data.error
  if (data.errors) {
    if (typeof data.errors === 'string') return data.errors
    if (typeof data.errors === 'object') return extractApiError({ response: { data: data.errors } })
  }
  if (data.non_field_errors) return Array.isArray(data.non_field_errors)
    ? data.non_field_errors[0]
    : String(data.non_field_errors)

  const firstKey = Object.keys(data)[0]
  if (!firstKey) return 'An unexpected error occurred.'

  const value = data[firstKey]
  if (Array.isArray(value) && value.length > 0) {
    return `${firstKey}: ${value[0]}`
  }
  if (typeof value === 'string') {
    return `${firstKey}: ${value}`
  }
  if (typeof value === 'boolean' || value == null) {
    return `${firstKey}: ${String(value)}`
  }
  return JSON.stringify(value)
}

// ── Bloom's taxonomy levels ────────────────────────────────────────────────
export const BLOOMS_LEVELS = [
  { value: 'remembering',   label: 'Remembering',   color: '#E57373' },
  { value: 'understanding', label: 'Understanding',  color: '#FFB74D' },
  { value: 'applying',      label: 'Applying',       color: '#FFF176' },
  { value: 'analyzing',     label: 'Analyzing',      color: '#81C784' },
  { value: 'evaluating',    label: 'Evaluating',     color: '#4FC3F7' },
  { value: 'creating',      label: 'Creating',       color: '#CE93D8' },
]

export function bloomsColor(level) {
  return BLOOMS_LEVELS.find((l) => l.value === level?.toLowerCase())?.color || '#E0E0E0'
}