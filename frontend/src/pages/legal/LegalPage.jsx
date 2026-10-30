// src/pages/legal/LegalPage.jsx
import { Link, useParams } from 'react-router-dom'
import { PRIVACY_META, PRIVACY_SECTIONS, TERMS_META, TERMS_SECTIONS } from './legalContent'

export default function LegalPage() {
  const { doc } = useParams()
  const isPrivacy = doc === 'privacy'
  const meta = isPrivacy ? PRIVACY_META : TERMS_META
  const sections = isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS

  return (
    <div style={{ minHeight: '100vh', background: '#08080A', color: '#F0F0F2', padding: '2.5rem 1.25rem' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <Link to="/" style={{ color: '#E24B4A', textDecoration: 'none', fontSize: '0.85rem' }}>&larr; Back to ATLAS</Link>
        <h1 style={{ fontSize: '1.6rem', margin: '1rem 0 0.25rem' }}>{meta.title}</h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>{meta.subtitle}</p>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <Link to="/legal/terms" style={tabStyle(!isPrivacy)}>Terms of Service</Link>
          <Link to="/legal/privacy" style={tabStyle(isPrivacy)}>Privacy Policy</Link>
        </div>
        {sections.map((s) => (
          <section key={s.heading} style={{ marginBottom: '1.4rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '1.1rem 1.25rem' }}>
            <h2 style={{ fontSize: '1rem', color: '#E24B4A', margin: '0 0 0.6rem' }}>{s.heading}</h2>
            {s.body.map((p, i) => (
              <p key={i} style={{ fontSize: '0.88rem', lineHeight: 1.65, color: 'rgba(255,255,255,0.78)', margin: '0 0 0.6rem' }}>{p}</p>
            ))}
          </section>
        ))}
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem', textAlign: 'center', marginTop: '2rem' }}>
          &copy; 2026 ATLAS Web Platform. All rights reserved.
        </p>
      </div>
    </div>
  )
}

function tabStyle(active) {
  return {
    padding: '0.45rem 1rem', borderRadius: 999, fontSize: '0.8rem', textDecoration: 'none',
    background: active ? 'rgba(226,75,74,0.15)' : 'transparent',
    color: active ? '#E24B4A' : 'rgba(255,255,255,0.55)',
    border: `1px solid ${active ? 'rgba(226,75,74,0.4)' : 'rgba(255,255,255,0.12)'}`,
  }
}
