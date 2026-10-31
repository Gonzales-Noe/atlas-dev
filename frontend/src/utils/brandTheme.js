const STYLE_ID = 'atlas-brand-override'

export const DEFAULT_BRAND = '#AA2423'

export const BRAND_PRESETS = [
  { id: 'atlas', name: 'ATLAS red', hex: '#AA2423' },
  { id: 'navy', name: 'Navy', hex: '#1B3A6B' },
  { id: 'forest', name: 'Forest', hex: '#1F6B45' },
  { id: 'teal', name: 'Teal', hex: '#0F6E6E' },
  { id: 'gold', name: 'Gold', hex: '#8A6A12' },
  { id: 'violet', name: 'Violet', hex: '#5B3A8C' },
  { id: 'crimson', name: 'Crimson', hex: '#9F1239' },
  { id: 'slate', name: 'Slate', hex: '#334155' },
]

function rgb(hex) {
  const h = hex.replace('#', '')
  return [0, 2, 4].map(index => parseInt(h.slice(index, index + 2), 16))
}

function hexOf(channels) {
  return `#${channels.map(channel => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

function mix(hex, target, amount) {
  const start = rgb(hex)
  const end = rgb(target)
  return hexOf(start.map((channel, index) => channel + (end[index] - channel) * amount))
}

export function normalizeHex(value) {
  const text = String(value || '').trim()
  const withHash = text.startsWith('#') ? text : `#${text}`
  if (!/^#[0-9A-Fa-f]{6}$/.test(withHash)) return ''
  return withHash.toUpperCase()
}

export function paletteFromHex(value) {
  const primary = normalizeHex(value)
  if (!primary) return null
  if (primary === DEFAULT_BRAND) {
    const [red, green, blue] = rgb(primary)
    return {
      brand_primary: primary,
      brand_primary_hover: '#6E1212',
      brand_core: '#6E1212',
      brand_deep: '#3F0A0A',
      brand_accent: '#E24B4A',
      brand_pale: '#F3B4B3',
      brand_glow: `rgba(${red}, ${green}, ${blue}, 0.35)`,
      brand_border: `rgba(${red}, ${green}, ${blue}, 0.55)`,
      brand_soft: `rgba(${red}, ${green}, ${blue}, 0.12)`,
      nav_active_bg: `linear-gradient(135deg, rgba(${red}, ${green}, ${blue}, 0.35), rgba(${red}, ${green}, ${blue}, 0.18))`,
      nav_active_bg_light: `linear-gradient(135deg, rgba(${red}, ${green}, ${blue}, 0.14), rgba(${red}, ${green}, ${blue}, 0.06))`,
      nav_active_border: `rgba(${red}, ${green}, ${blue}, 0.40)`,
      is_default: true,
    }
  }
  const [red, green, blue] = rgb(primary)
  return {
    brand_primary: primary,
    brand_primary_hover: mix(primary, '#000000', 0.28),
    brand_core: mix(primary, '#000000', 0.42),
    brand_deep: mix(primary, '#000000', 0.62),
    brand_accent: mix(primary, '#FFFFFF', 0.28),
    brand_pale: mix(primary, '#FFFFFF', 0.72),
    brand_glow: `rgba(${red}, ${green}, ${blue}, 0.35)`,
    brand_border: `rgba(${red}, ${green}, ${blue}, 0.55)`,
    brand_soft: `rgba(${red}, ${green}, ${blue}, 0.12)`,
    nav_active_bg: `linear-gradient(135deg, rgba(${red}, ${green}, ${blue}, 0.35), rgba(${red}, ${green}, ${blue}, 0.18))`,
    nav_active_bg_light: `linear-gradient(135deg, rgba(${red}, ${green}, ${blue}, 0.14), rgba(${red}, ${green}, ${blue}, 0.06))`,
    nav_active_border: `rgba(${red}, ${green}, ${blue}, 0.40)`,
    is_default: false,
  }
}

function themeCss(palette) {
  return `
    :root {
      --brand-red-deep: ${palette.brand_deep};
      --brand-red-core: ${palette.brand_core};
      --brand-red-mid: ${palette.brand_primary};
      --brand-red-bright: ${palette.brand_accent};
      --brand-red-glow: ${palette.brand_glow};
      --brand-primary: ${palette.brand_primary};
      --brand-primary-hover: ${palette.brand_primary_hover};
      --brand-accent: ${palette.brand_accent};
      --brand-pale: ${palette.brand_pale};
      --brand-soft: ${palette.brand_soft};
      --text-accent: ${palette.brand_accent};
      --active-color: ${palette.brand_accent};
      --active-color-hover: ${palette.brand_pale};
      --active-bg: ${palette.brand_soft};
      --border-active: ${palette.brand_border};
      --shell-nav-active-bg: ${palette.nav_active_bg};
      --shell-nav-active-border: ${palette.nav_active_border};
      --shell-badge-text: ${palette.brand_accent};
    }
    body.atlas-light {
      --brand-primary: ${palette.brand_primary};
      --brand-primary-hover: ${palette.brand_primary_hover};
      --brand-accent: ${palette.brand_primary};
      --brand-red-mid: ${palette.brand_primary};
      --brand-red-core: ${palette.brand_primary_hover};
      --brand-red-bright: ${palette.brand_accent};
      --brand-pale: ${palette.brand_pale};
      --brand-soft: ${palette.brand_soft};
      --text-accent: ${palette.brand_primary};
      --active-color: ${palette.brand_primary};
      --active-color-hover: ${palette.brand_primary_hover};
      --active-bg: ${palette.brand_soft};
      --border-active: ${palette.brand_border};
      --shell-nav-active-bg: ${palette.nav_active_bg_light};
      --shell-nav-active-border: ${palette.nav_active_border};
      --shell-badge-text: ${palette.brand_primary_hover};
    }
  `
}

export function applyBrandTheme(palette) {
  const existing = document.getElementById(STYLE_ID)
  if (!palette || palette.is_default) {
    existing?.remove()
    return
  }
  const style = existing || document.createElement('style')
  style.id = STYLE_ID
  style.textContent = themeCss(palette)
  if (!existing) document.head.appendChild(style)
}

export async function loadBrandTheme() {
  const base = import.meta.env.VITE_API_URL || '/api'
  try {
    const response = await fetch(`${base}/auth/platform-theme/`, { credentials: 'include' })
    if (!response.ok) return null
    const data = await response.json()
    applyBrandTheme(data.palette)
    window.dispatchEvent(new CustomEvent('atlas-brand', { detail: data }))
    return data
  } catch {
    return null
  }
}

export function cssColor(name, fallback) {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}
