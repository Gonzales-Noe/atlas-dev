import { useEffect, useState } from 'react'
import { Alert } from '@mui/material'
import SuperAdminLayout from './SuperAdminLayout'
import { GlassCard, PageHeader, PrimaryBtn, OutlineBtn } from '../../components/ui'
import api from '../../config/api'
import { applyBrandTheme, BRAND_PRESETS, loadBrandTheme, normalizeHex, paletteFromHex } from '../../utils/brandTheme'

export default function Appearance() {
  const [savedHex, setSavedHex] = useState('#AA2423')
  const [hex, setHex] = useState('#AA2423')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let mounted = true
    loadBrandTheme()
      .then(data => {
        if (!mounted || !data?.palette?.brand_primary) return
        setSavedHex(data.palette.brand_primary)
        setHex(data.palette.brand_primary)
      })
      .catch(() => { if (mounted) setError('The current color could not be loaded.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => {
      mounted = false
      loadBrandTheme()
    }
  }, [])

  function preview(next) {
    const normalized = normalizeHex(next)
    setHex(next)
    setNotice('')
    setError('')
    const palette = paletteFromHex(normalized)
    if (palette) applyBrandTheme(palette)
  }

  async function save(nextHex) {
    const normalized = normalizeHex(nextHex)
    if (!normalized) {
      setError('Enter a color like #1B4F8A.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const { data } = await api.patch('/auth/platform-theme/', { brand_primary: normalized })
      applyBrandTheme(data.palette)
      window.dispatchEvent(new CustomEvent('atlas-brand', { detail: data }))
      setSavedHex(data.palette.brand_primary)
      setHex(data.palette.brand_primary)
      setNotice('Saved. This color is now the default across ATLAS.')
    } catch (err) {
      setError(err.response?.data?.detail || 'The color could not be saved.')
      const palette = paletteFromHex(savedHex)
      if (palette) applyBrandTheme(palette)
    } finally {
      setSaving(false)
    }
  }

  const dirty = normalizeHex(hex) !== savedHex

  return (
    <SuperAdminLayout>
      <PageHeader
        title="Appearance"
        subtitle="Replace the default red with the color this institution wants on the public site and the signed-in app"
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}

      <div className="atlas-appearance-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 0.8fr)', gap: 16 }}>
        <GlassCard title="Institution color">
          <p style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.5 }}>
            Buttons, navigation, sign-in, the landing page, and faculty workspace accents follow this color.
            Pick a preset or enter any dark hex color. Pale colors are rejected so labels stay readable.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
            {BRAND_PRESETS.map(preset => {
              const selected = normalizeHex(hex) === preset.hex
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => preview(preset.hex)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textAlign: 'left',
                    background: selected ? 'var(--active-bg)' : 'transparent',
                    color: 'var(--text-primary)',
                    border: selected ? '1px solid var(--border-active)' : '1px solid var(--border-color)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ width: 22, height: 22, borderRadius: 7, background: preset.hex, flexShrink: 0 }} />
                  <span>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem' }}>{preset.name}</span>
                    <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{preset.hex}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              aria-label="Pick a color"
              type="color"
              value={normalizeHex(hex) || '#AA2423'}
              onChange={event => preview(event.target.value)}
              disabled={loading}
              style={{ width: 56, height: 40, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
            />
            <input
              aria-label="Hex color"
              value={hex}
              onChange={event => preview(event.target.value)}
              spellCheck={false}
              style={{
                width: 140,
                background: 'var(--input-bg)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 10,
                padding: '10px 12px',
                fontFamily: 'var(--font-mono)',
              }}
            />
            <PrimaryBtn onClick={() => save(hex)} disabled={loading || saving || !dirty}>
              {saving ? 'Saving' : 'Save color'}
            </PrimaryBtn>
            <OutlineBtn onClick={() => save('#AA2423')} disabled={loading || saving || savedHex === '#AA2423'}>
              Reset to ATLAS red
            </OutlineBtn>
          </div>
        </GlassCard>

        <GlassCard title="Preview">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ height: 72, borderRadius: 14, background: `linear-gradient(135deg, var(--brand-primary-hover), var(--brand-primary))` }} />
            <div style={{ display: 'flex', gap: 8 }}>
              {['var(--brand-deep)', 'var(--brand-primary-hover)', 'var(--brand-primary)', 'var(--brand-accent)', 'var(--brand-pale)'].map(color => (
                <span key={color} style={{ flex: 1, height: 28, borderRadius: 8, background: color }} />
              ))}
            </div>
            <PrimaryBtn>Sample button</PrimaryBtn>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              {dirty ? 'This preview is not saved yet.' : `Saved color ${savedHex}.`}
            </p>
          </div>
        </GlassCard>
      </div>
      <style>{`
        @media (max-width: 800px) {
          .atlas-appearance-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </SuperAdminLayout>
  )
}
