import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../config/api'

const PLANS = [
  { name: 'Starter', price: '₱2,499', detail: '30 days · Up to 10 faculty accounts', accent: '#E24B4A' },
  { name: 'Professional', price: '₱6,999', detail: '30 days · Up to 50 faculty accounts', accent: '#E24B4A' },
]

const initialApplication = () => {
  try { return JSON.parse(localStorage.getItem('atlas_signup_application')) || {} } catch { return {} }
}

const initialPlan = application => {
  const requested = application.plan || localStorage.getItem('atlas_selected_plan')
  return ['Starter', 'Professional'].includes(requested) ? requested : 'Starter'
}

export default function BillingOnboarding() {
  const navigate = useNavigate()
  const application = useMemo(initialApplication, [])
  const [plan, setPlan] = useState(() => initialPlan(application))
  const [stage, setStage] = useState('plan')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState({
    application_status: '',
    payment_status: '',
    is_active: false,
    trial_active: false,
    trial_expired: false,
  })

  useEffect(() => {
    let active = true

    const syncStatus = async () => {
      try {
        const { data } = await api.get('/auth/billing/status/')
        if (!active) return

        setStatus(data)
        if (['Starter', 'Professional'].includes(data.selected_plan)) {
          setPlan(data.selected_plan)
        }
        if (data.trial_active) {
          setStage('trial')
          return
        }

        if (data.trial_expired) {
          setStage('expired')
          return
        }

        if (data.access_active) {
          setStage('approved')
          return
        }

        if (data.payment_status === 'pending') {
          setStage('review')
          return
        }

        setStage('plan')
      } catch {
        if (active) {
          setStage(application.status === 'active' ? 'approved' : 'plan')
        }
      }
    }

    syncStatus()
    return () => { active = false }
  }, [application.status])

  const saveApplication = (next) => {
    const updated = { ...application, ...next }
    localStorage.setItem('atlas_signup_application', JSON.stringify(updated))
  }

  const choosePlan = async () => {
    if (!plan) return
    setLoading(true)
    setError('')
    try {
      localStorage.setItem('atlas_selected_plan', plan)
      saveApplication({ plan, status: 'pending_payment' })
      const { data } = await api.post('/auth/billing/checkout/', { selected_plan: plan })
      if (data.checkout_url) {
        window.location.href = data.checkout_url
        return
      }
      setStatus({
        application_status: 'approved_pending_payment',
        payment_status: 'pending',
        is_active: false,
      })
      setStage('review')
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to create the checkout session.')
    } finally {
      setLoading(false)
    }
  }

  const stageNumber = stage === 'plan' ? 2 : stage === 'review' ? 2 : 3
  const isAdmin = status.role === 'admin'
  const dashboardPath = isAdmin ? '/admin/dashboard' : '/faculty/dashboard'
  const trialDaysRemaining = status.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(status.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0

  return (
    <main className="billing-shell">
      <style>{`
        .billing-shell { min-height:100vh; background:radial-gradient(circle at 80% 10%, #3F0A0A 0, transparent 38%), #0a0a0b; color:#f5f5f5; font-family:"Plus Jakarta Sans", sans-serif; padding:48px 24px; }
        .billing-wrap { max-width:960px; margin:0 auto; }
        .billing-brand { color:#E24B4A; letter-spacing:.18em; font-weight:800; font-size:.8rem; }
        .billing-header { display:flex; justify-content:space-between; gap:24px; align-items:flex-start; margin:50px 0 34px; }
        .billing-header h1 { font-size:clamp(2rem,5vw,3.6rem); line-height:1.04; margin:0 0 12px; max-width:650px; }
        .billing-header p { color:#aaa; max-width:580px; line-height:1.7; margin:0; }
        .billing-stepper { display:flex; gap:10px; margin-bottom:30px; }
        .billing-step { flex:1; border-top:2px solid #333; padding-top:12px; color:#777; font-size:.76rem; text-transform:uppercase; letter-spacing:.1em; }
        .billing-step.active { border-color:#AA2423; color:#fff; }
        .billing-panel { border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.045); padding:28px; border-radius:8px; }
        .billing-panel h2 { margin:0 0 8px; font-size:1.3rem; }
        .billing-muted { color:#999; line-height:1.6; }
        .plan-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; margin:24px 0; }
        .plan-card { text-align:left; color:#fff; background:#151517; border:1px solid #343438; border-radius:7px; padding:20px; cursor:pointer; min-height:170px; }
        .plan-card.selected { border-color:#AA2423; box-shadow:0 0 0 1px #AA2423; }
        .plan-card strong { display:block; font-size:1rem; margin-bottom:28px; }
        .plan-price { font-size:1.65rem; font-weight:800; }
        .plan-detail { color:#999; font-size:.8rem; margin-top:8px; }
        .billing-button { background:#AA2423; border:0; color:#fff; border-radius:6px; padding:13px 20px; font:inherit; font-weight:700; cursor:pointer; }
        .billing-button:disabled { opacity:.45; cursor:not-allowed; }
        .billing-button.secondary { background:transparent; border:1px solid #555; }
        .billing-actions { display:flex; gap:12px; justify-content:flex-end; margin-top:24px; }
        .error-banner { margin-top:16px; padding:12px 14px; border-radius:8px; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.35); color:#fecaca; }
        @media (max-width:680px) { .billing-shell { padding:28px 16px; } .billing-header { margin-top:40px; } .plan-grid { grid-template-columns:1fr; } .billing-panel { padding:20px; } }
      `}</style>
      <div className="billing-wrap">
        <div className="billing-brand">ATLAS / INSTITUTION SETUP</div>
        <header className="billing-header">
          <div>
            <h1>{stage === 'trial' ? 'Your ATLAS trial is ready.' : stage === 'expired' ? 'Your trial has ended.' : 'Bring your institution into ATLAS.'}</h1>
            <p>{application.institution ? `Application for ${application.institution}. ` : ''}{stage === 'trial' ? 'Explore syllabus generation for 7 days, with no payment method required.' : stage === 'expired' ? 'Choose a paid plan to restore access to your institution workspace.' : 'Choose a plan and complete a secure one-time payment to activate 30 days of access.'}</p>
          </div>
          <div className="billing-muted">Step {stageNumber} of 3</div>
        </header>
        <div className="billing-stepper">
          {['7-day trial', 'Choose plan', 'Access'].map((label, index) => <div className={`billing-step ${index < stageNumber ? 'active' : ''}`} key={label}>{label}</div>)}
        </div>

        {stage === 'trial' && <section className="billing-panel">
          <h2>{trialDaysRemaining} {trialDaysRemaining === 1 ? 'day' : 'days'} left in your trial</h2>
          <p className="billing-muted">The trial includes up to {status.faculty_limit || 2} faculty accounts and {status.generation_limit || 5} syllabus generations per faculty. AI generation outside the Syllabus module is unavailable during the trial. No automatic charge will be made when it ends.</p>
          {status.role === 'faculty' && <p className="billing-muted">Used syllabus generations: {status.generation_used || 0} of {status.generation_limit || 5}. Contact your institution admin if you need to upgrade after the trial.</p>}
          {error && <div className="error-banner">{error}</div>}
          <div className="billing-actions">
            {isAdmin && <button type="button" className="billing-button secondary" onClick={() => setStage('plan')}>Choose a paid plan</button>}
            <button type="button" className="billing-button" onClick={() => navigate(dashboardPath, { replace: true })}>Continue to workspace</button>
          </div>
        </section>}

        {stage === 'expired' && <section className="billing-panel">
          <h2>{isAdmin ? 'Restore your institution access' : 'Ask your institution admin to upgrade'}</h2>
          <p className="billing-muted">{isAdmin ? 'Choose Starter or Professional below to pay for the next 30 days. Payment is manual; ATLAS will not charge you automatically.' : 'Your institution trial has ended. An admin must choose a paid plan before you can continue using the workspace.'}</p>
          {isAdmin && <div className="billing-actions"><button type="button" className="billing-button" onClick={() => setStage('plan')}>View paid plans</button></div>}
        </section>}

        {stage === 'plan' && <section className="billing-panel">
          <h2>Select your institution plan</h2>
          <p className="billing-muted">Each payment provides 30 days of access. Renewal is manual; there is no automatic billing.</p>
          <div className="plan-grid">{PLANS.map(item => <button type="button" className={`plan-card ${plan === item.name ? 'selected' : ''}`} key={item.name} onClick={() => setPlan(item.name)}>
            <strong style={{ color: item.accent }}>{item.name}</strong><span className="plan-price">{item.price}</span><div className="plan-detail">{item.detail}</div>
          </button>)}</div>
          {error && <div className="error-banner">{error}</div>}
          <div className="billing-actions">
            <button type="button" className="billing-button" disabled={!plan || loading} onClick={choosePlan}>{loading ? 'Preparing checkout…' : 'Continue to PayMongo'}</button>
          </div>
        </section>}

        {stage === 'review' && <section className="billing-panel">
          <div className="review-icon">✓</div>
          <h2>Payment is pending</h2>
          <p className="billing-muted">Your {plan} checkout is ready. Complete payment to activate 30 days of paid access. If your trial is still active, it remains available until the trial ends.</p>
          <div className="billing-actions">
            <button type="button" className="billing-button secondary" onClick={() => setStage('plan')}>Change plan</button>
            <button type="button" className="billing-button" onClick={() => window.location.reload()}>Refresh status</button>
          </div>
        </section>}

        {stage === 'approved' && <section className="billing-panel">
          <div className="review-icon">✓</div>
          <h2>Institution access is active</h2>
          <p className="billing-muted">Your {plan || status.selected_plan || 'selected'} plan is active until {status.subscription_ends_at ? new Date(status.subscription_ends_at).toLocaleDateString() : 'the end of the current paid period'}. Renew manually to keep access.</p>
          <div className="billing-actions">
            <button type="button" className="billing-button" onClick={() => navigate(dashboardPath, { replace: true })}>Continue to workspace</button>
          </div>
        </section>}
      </div>
    </main>
  )
}