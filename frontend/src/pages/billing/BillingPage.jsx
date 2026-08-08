import React, { useEffect, useState } from 'react'
import api from '../../config/api'
import { useAuth } from '../../store/authStore'

export default function BillingPage() {
  const { user } = useAuth()
  const [plans, setPlans] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    api.get('/integrations/plans/')
      .then(({ data }) => setPlans(data.plans || []))
      .catch(() => setPlans([]))
  }, [])

  async function handlePay(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!selected) { setError('Please choose a plan.'); return }
    setLoading(true)
    try {
      const { data } = await api.post('/integrations/simulate-payment/', { plan_tier: selected })
      setSuccess(data.detail || 'Payment simulated successfully.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Payment simulation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '80vh', padding: '3rem', display: 'flex', gap: '2rem' }}>
      <div style={{ flex: 1 }}>
        <h2 style={{ marginTop: 0 }}>Choose a plan</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {plans.map(p => (
            <div key={p.tier} onClick={() => setSelected(p.tier)} style={{ padding: '1rem', borderRadius: 16, cursor: 'pointer', boxShadow: selected === p.tier ? '0 8px 24px rgba(0,0,0,0.25)' : 'none', background: 'rgba(255,255,255,0.04)', border: selected === p.tier ? '1px solid rgba(139,0,0,0.6)' : '1px solid rgba(255,255,255,0.06)' }}>
              <h3 style={{ margin: '0 0 0.5rem 0' }}>{p.name}</h3>
              <p style={{ margin: 0, fontWeight: 700 }}>${p.price_usd_per_month}/mo</p>
              <ul>
                {p.features.map(f => <li key={f} style={{ fontSize: '0.9rem' }}>{f}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div style={{ width: 420 }}>
        <div style={{ padding: '1.25rem', borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 style={{ marginTop: 0 }}>Payment details</h3>
          {error && <div style={{ background: 'rgba(192,57,43,0.12)', padding: '0.75rem', borderRadius: 8, color: '#FF8080' }}>{error}</div>}
          {success && <div style={{ background: 'rgba(30,100,30,0.12)', padding: '0.75rem', borderRadius: 8, color: '#80FF80' }}>{success}</div>}
          <form onSubmit={handlePay} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
            <button className="btn-primary" type="submit" disabled={loading}>{loading ? 'Processing…' : 'Simulate Payment'}</button>
          </form>
          <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', marginTop: '1rem' }}>This is a simulated payment flow for development only. No real card processing occurs.</p>
        </div>
      </div>
    </div>
  )
}
