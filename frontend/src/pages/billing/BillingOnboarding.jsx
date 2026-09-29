import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const PLANS = [
  { name: 'Starter', price: '₱2,499', detail: 'Up to 10 faculty accounts', accent: '#FF8A65' },
  { name: 'Professional', price: '₱6,999', detail: 'Up to 50 faculty accounts', accent: '#FF6B6B' },
  { name: 'Enterprise', price: 'Custom', detail: 'Unlimited faculty and support', accent: '#60AAFF' },
]

const initialApplication = () => {
  try { return JSON.parse(localStorage.getItem('atlas_signup_application')) || {} } catch { return {} }
}

export default function BillingOnboarding() {
  const navigate = useNavigate()
  const application = useMemo(initialApplication, [])
  const [plan, setPlan] = useState(application.plan || '')
  const [stage, setStage] = useState(application.status === 'active' ? 'approved' : application.status === 'pending_review' ? 'review' : 'plan')

  const saveApplication = (next) => {
    const updated = { ...application, ...next }
    localStorage.setItem('atlas_signup_application', JSON.stringify(updated))
  }

  const choosePlan = () => {
    if (!plan) return
    saveApplication({ plan, status: 'pending_review' })
    setStage('review')
  }

  const stageNumber = stage === 'plan' ? 1 : stage === 'review' ? 2 : 3

  return (
    <main className="billing-shell">
      <style>{`
        .billing-shell { min-height:100vh; background:radial-gradient(circle at 80% 10%, #3a1116 0, transparent 38%), #0a0a0b; color:#f5f5f5; font-family:"Plus Jakarta Sans", sans-serif; padding:48px 24px; }
        .billing-wrap { max-width:960px; margin:0 auto; }
        .billing-brand { color:#ff6b6b; letter-spacing:.18em; font-weight:800; font-size:.8rem; }
        .billing-header { display:flex; justify-content:space-between; gap:24px; align-items:flex-start; margin:50px 0 34px; }
        .billing-header h1 { font-size:clamp(2rem,5vw,3.6rem); line-height:1.04; margin:0 0 12px; max-width:650px; }
        .billing-header p { color:#aaa; max-width:580px; line-height:1.7; margin:0; }
        .billing-stepper { display:flex; gap:10px; margin-bottom:30px; }
        .billing-step { flex:1; border-top:2px solid #333; padding-top:12px; color:#777; font-size:.76rem; text-transform:uppercase; letter-spacing:.1em; }
        .billing-step.active { border-color:#ff6b6b; color:#fff; }
        .billing-panel { border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.045); padding:28px; border-radius:8px; }
        .billing-panel h2 { margin:0 0 8px; font-size:1.3rem; }
        .billing-muted { color:#999; line-height:1.6; }
        .plan-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin:24px 0; }
        .plan-card { text-align:left; color:#fff; background:#151517; border:1px solid #343438; border-radius:7px; padding:20px; cursor:pointer; min-height:170px; }
        .plan-card.selected { border-color:#ff6b6b; box-shadow:0 0 0 1px #ff6b6b; }
        .plan-card strong { display:block; font-size:1rem; margin-bottom:28px; }
        .plan-price { font-size:1.65rem; font-weight:800; }
        .plan-detail { color:#999; font-size:.8rem; margin-top:8px; }
        .billing-button { background:#c0392b; border:0; color:#fff; border-radius:6px; padding:13px 20px; font:inherit; font-weight:700; cursor:pointer; }
        .billing-button:disabled { opacity:.45; cursor:not-allowed; }
        .billing-button.secondary { background:transparent; border:1px solid #555; }
        .billing-actions { display:flex; gap:12px; justify-content:flex-end; margin-top:24px; }
        .payment-methods { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:22px 0; }
        .payment-method { padding:14px; border:1px solid #3c3c40; background:#151517; color:#fff; border-radius:6px; cursor:pointer; }
        .payment-method.selected { border-color:#60AAFF; }
        .review-icon { font-size:3rem; margin-bottom:18px; }
        @media (max-width:680px) { .billing-shell { padding:28px 16px; } .billing-header { margin-top:40px; } .plan-grid, .payment-methods { grid-template-columns:1fr; } .billing-panel { padding:20px; } }
      `}</style>
      <div className="billing-wrap">
        <div className="billing-brand">ATLAS / INSTITUTION SETUP</div>
        <header className="billing-header">
          <div>
            <h1>Bring your institution into ATLAS.</h1>
            <p>{application.institution ? `Application for ${application.institution}. ` : ''}Choose a plan, let our team review your institution, then start setting up your workspace.</p>
          </div>
          <div className="billing-muted">Step {stageNumber} of 3</div>
        </header>
        <div className="billing-stepper">
          {['Choose plan', 'Application review', 'Payment'].map((label, index) => <div className={`billing-step ${index < stageNumber ? 'active' : ''}`} key={label}>{label}</div>)}
        </div>

        {stage === 'plan' && <section className="billing-panel">
          <h2>Select your institution plan</h2><p className="billing-muted">You can change your plan before payment. Pricing is billed per institution.</p>
          <div className="plan-grid">{PLANS.map(item => <button className={`plan-card ${plan === item.name ? 'selected' : ''}`} key={item.name} onClick={() => setPlan(item.name)}>
            <strong style={{ color: item.accent }}>{item.name}</strong><span className="plan-price">{item.price}</span><div className="plan-detail">{item.detail}</div>
          </button>)}</div>
          <div className="billing-actions"><button className="billing-button" disabled={!plan} onClick={choosePlan}>Submit for review</button></div>
        </section>}

        {stage === 'review' && <section className="billing-panel">
          <div className="review-icon">✓</div><h2>Your application is under review</h2><p className="billing-muted">We received your {plan} application. Our superadmin team will verify the institution details. We will email {application.email || 'your registered address'} as soon as payment is enabled.</p>
          <div className="billing-actions"><button className="billing-button secondary" onClick={() => setStage('plan')}>Change plan</button></div>
        </section>}

        {stage === 'approved' && <section className="billing-panel">
          <div className="review-icon">✓</div><h2>Application approved</h2><p className="billing-muted">Your {plan || application.plan || 'selected'} plan is active. You can sign in now and begin setting up your institution. Payment will be handled separately through the approval email.</p>
          <div className="billing-actions"><button className="billing-button" onClick={() => navigate('/admin/dashboard', { replace: true })}>Continue to admin dashboard</button></div>
        </section>}
      </div>
    </main>
  )
}