// src/pages/auth/PasswordResetPage.jsx
import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CircularProgress from '@mui/material/CircularProgress'
import { useAuth }      from '../../store/authStore'
import { ROUTES }       from '../../config/routes'
import atlasLogo        from '../../assets/atlas-logo.png'

// ── Shared design primitives ─────────────────────────────────────────────────
function Orb({ style }) {
  return (
    <div style={{
      position: 'absolute',
      borderRadius: '50%',
      filter: 'blur(80px)',
      pointerEvents: 'none',
      zIndex: 0,
      ...style,
    }} />
  )
}

// ── OTP 4-box input ─────────────────────────────────────────────────────────
function OtpInput({ value, onChange }) {
  const inputs = useRef([])
  const digits = value.split('')

  function handleKey(e, idx) {
    if (e.key === 'Backspace') {
      const next = [...digits]
      next[idx] = ''
      onChange(next.join(''))
      if (idx > 0) inputs.current[idx - 1]?.focus()
      return
    }
    if (!/^\d$/.test(e.key)) return
    const next = [...digits]
    next[idx] = e.key
    onChange(next.join(''))
    if (idx < 3) inputs.current[idx + 1]?.focus()
  }

  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', margin: '0.5rem 0 1rem' }}>
      {[0, 1, 2, 3].map((i) => (
        <input
          key={i}
          ref={el => (inputs.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] || ''}
          onKeyDown={e => handleKey(e, i)}
          onChange={() => {}}
          style={{
            width: 58,
            height: 64,
            textAlign: 'center',
            fontSize: '1.8rem',
            fontWeight: 800,
            fontFamily: '"Plus Jakarta Sans", sans-serif',
            background: 'rgba(255,255,255,0.06)',
            border: digits[i] ? '2px solid rgba(192,57,43,0.8)' : '1px solid rgba(255,255,255,0.14)',
            borderRadius: 14,
            outline: 'none',
            color: '#F0F0F0',
            transition: 'border-color 0.2s, background 0.2s',
            cursor: 'text',
            boxShadow: digits[i] ? '0 0 16px rgba(192,57,43,0.2)' : 'none',
          }}
          onFocus={e => {
            e.target.style.borderColor = 'rgba(192,57,43,0.8)'
            e.target.style.background = 'rgba(255,255,255,0.1)'
          }}
          onBlur={e => {
            if (!digits[i]) {
              e.target.style.borderColor = 'rgba(255,255,255,0.14)'
              e.target.style.background = 'rgba(255,255,255,0.06)'
            }
          }}
        />
      ))}
    </div>
  )
}

// ── Steps ────────────────────────────────────────────────────────────────────
const STEPS = { EMAIL: 0, OTP: 1, NEW_PASSWORD: 2, DONE: 3 }

const STEP_CONFIG = [
  { icon: '🔐', bubble: "Forgot your password? No worries!" },
  { icon: '📧', bubble: "Check your email for the OTP!" },
  { icon: '🔑', bubble: "Almost there! Set your new password." },
  { icon: '🎉', bubble: "You're all set! Welcome back." },
]

const NAV_LINKS = [
  { label: 'HOME',    to: '/' },
  { label: 'SIGN UP', to: '/signup' },
  { label: 'PRICING', to: '/pricing' },
  { label: 'CONTACT', to: '/contact' },
]

// ── Step indicator ───────────────────────────────────────────────────────────
function StepDots({ current }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: '1.5rem' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: i === current ? 20 : 7,
          height: 7,
          borderRadius: 4,
          background: i <= current ? 'linear-gradient(90deg, #8B0000, #C0392B)' : 'rgba(255,255,255,0.12)',
          transition: 'all 0.4s ease',
        }} />
      ))}
    </div>
  )
}

export default function PasswordResetPage({ isModal, onClose, onSwitch }) {
  const navigate                              = useNavigate()
  const { sendOtp, verifyOtp, resetPassword } = useAuth()

  const [step, setStep]               = useState(STEPS.EMAIL)
  const [email, setEmail]             = useState('')
  const [otp, setOtp]                 = useState('')
  const [resetToken, setResetToken]   = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm]         = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [isMenuOpen, setIsMenuOpen]   = useState(false)
  const [scrolled, setScrolled]       = useState(false)
  const [showNewPass, setShowNewPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  async function handleSendOtp(e) {
    e.preventDefault()
    if (!email) { setError('Please enter your email.'); return }
    setLoading(true); setError('')
    try {
      await sendOtp(email)
      setStep(STEPS.OTP)
      startResendCooldown()
    } catch {
      setError('Could not send OTP. Please check the email address.')
    } finally { setLoading(false) }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    if (otp.length < 4) { setError('Please enter all 4 digits.'); return }
    setLoading(true); setError('')
    try {
      const token = await verifyOtp(email, otp)
      setResetToken(token)
      setStep(STEPS.NEW_PASSWORD)
    } catch {
      setError('Invalid or expired OTP. Please try again.')
    } finally { setLoading(false) }
  }

  async function handleReset(e) {
    e.preventDefault()
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (newPassword !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true); setError('')
    try {
      await resetPassword(resetToken, newPassword)
      setStep(STEPS.DONE)
    } catch {
      setError('Failed to reset password. Please start over.')
    } finally { setLoading(false) }
  }

  function startResendCooldown() {
    setResendCooldown(60)
    const interval = setInterval(() => {
      setResendCooldown(c => {
        if (c <= 1) { clearInterval(interval); return 0 }
        return c - 1
      })
    }, 1000)
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    setLoading(true)
    try {
      await sendOtp(email)
      startResendCooldown()
      setError('')
    } catch {
      setError('Could not resend OTP.')
    } finally { setLoading(false) }
  }

  return (
    <div style={isModal ? {
      position: 'fixed',
      inset: 0,
      background: 'rgba(10,10,11,0.85)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      color: '#F0F0F0',
      fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
      overflowY: 'auto',
    } : {
      minHeight: '100vh',
      background: '#0A0A0B',
      color: '#F0F0F0',
      fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }

        .auth-nav-link {
          color: rgba(255,255,255,0.55);
          text-decoration: none;
          font-size: 0.82rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          transition: color 0.2s;
        }
        .auth-nav-link:hover { color: #fff; }

        .dark-input {
          width: 100%;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          padding: 0.85rem 1rem;
          color: #F0F0F0;
          font-family: inherit;
          font-size: 0.92rem;
          outline: none;
          transition: border-color 0.2s, background 0.2s;
        }
        .dark-input:focus {
          border-color: rgba(192,57,43,0.7);
          background: rgba(255,255,255,0.09);
        }
        .dark-input::placeholder { color: rgba(255,255,255,0.28); }

        .btn-primary {
          width: 100%;
          background: linear-gradient(135deg, #8B0000, #C0392B);
          color: #fff;
          border: none;
          border-radius: 12px;
          padding: 0.9rem;
          font-family: inherit;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.25s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(139,0,0,0.5);
        }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

        .btn-inline {
          background: linear-gradient(135deg, #8B0000, #C0392B);
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 0.82rem 1.4rem;
          font-family: inherit;
          font-size: 0.88rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.25s ease;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .btn-inline:hover:not(:disabled) {
          box-shadow: 0 6px 20px rgba(139,0,0,0.45);
          transform: translateY(-1px);
        }
        .btn-inline:disabled { opacity: 0.6; cursor: not-allowed; }

        .glass-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 24px;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }

        .error-box {
          background: rgba(192,57,43,0.15);
          border: 1px solid rgba(192,57,43,0.35);
          border-radius: 10px;
          padding: 0.75rem 1rem;
          color: #FF8080;
          font-size: 0.85rem;
          margin-bottom: 1rem;
        }

        .step-enter {
          opacity: 0;
          transform: translateX(20px);
          animation: stepEnter 0.4s ease forwards;
        }
        @keyframes stepEnter {
          to { opacity: 1; transform: translateX(0); }
        }

        .glow-text {
          background: linear-gradient(135deg, #FF6B6B, #FF4444, #CC0000);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .speech-bubble {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 20px;
          padding: 1rem 1.4rem;
          color: #F0F0F0;
          font-weight: 600;
          font-size: 0.9rem;
          position: relative;
          backdrop-filter: blur(10px);
          text-align: center;
          line-height: 1.5;
          transition: all 0.4s ease;
        }
        .speech-bubble::after {
          content: '';
          position: absolute;
          bottom: -10px;
          left: 50%;
          transform: translateX(-50%);
          border: 10px solid transparent;
          border-top-color: rgba(255,255,255,0.08);
          border-bottom: 0;
        }

        .label-text {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.4);
          font-weight: 600;
          letter-spacing: 0.05em;
          display: block;
          margin-bottom: 5px;
        }

        .password-wrap {
          position: relative;
        }
        .password-toggle {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: rgba(255,255,255,0.35);
          font-size: 0.85rem;
          font-family: inherit;
          transition: color 0.2s;
          padding: 2px 4px;
        }
        .password-toggle:hover { color: rgba(255,255,255,0.7); }

        .mobile-menu-drawer {
          position: absolute;
          top: 64px; left: 0; right: 0;
          background: rgba(10,10,11,0.97);
          border-bottom: 1px solid rgba(255,255,255,0.08);
          backdrop-filter: blur(20px);
          z-index: 998;
          padding: 1.25rem 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          transform: translateY(-10px);
          opacity: 0;
          pointer-events: none;
          transition: all 0.25s ease;
        }
        .mobile-menu-drawer.open {
          transform: translateY(0);
          opacity: 1;
          pointer-events: all;
        }

        @media (max-width: 768px) {
          .desktop-nav-links { display: none !important; }
          .hamburger-btn { display: flex !important; }
          .mascot-col { display: none !important; }
          .reset-split { flex-direction: column !important; }
        }
        @media (min-width: 769px) {
          .hamburger-btn { display: none !important; }
        }
      `}</style>

      {/* Background orbs */}
      <Orb style={{ width: 500, height: 500, background: 'rgba(139,0,0,0.15)', top: -150, left: -100 }} />
      <Orb style={{ width: 350, height: 350, background: 'rgba(100,0,0,0.12)', bottom: -80, right: -80 }} />
      <div style={{
        position: 'fixed', inset: 0,
        backgroundImage: `linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* ── NAVBAR ──────────────────────────────────────────────────────────── */}
      {isModal && (
        <button onClick={onClose} style={{
          position: 'absolute', top: 24, right: 24, background: 'rgba(255,255,255,0.1)', border: 'none',
          color: '#fff', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
          transition: 'background 0.2s'
        }}
        onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
        onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
        >
          ✕
        </button>
      )}

      {!isModal && (
        <nav style={{
          position: 'relative', zIndex: 999,
          background: scrolled ? 'rgba(10,10,11,0.9)' : 'transparent',
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.07)' : 'none',
          transition: 'all 0.3s ease',
          backdropFilter: scrolled ? 'blur(20px)' : 'none',
        }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 2rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/">
            <img src={atlasLogo} alt="ATLAS Logo" style={{ height: 28, objectFit: 'contain', filter: 'brightness(0) saturate(100%) invert(26%) sepia(51%) saturate(2796%) hue-rotate(345deg) brightness(92%) contrast(92%)' }} />
          </Link>
          <div className="desktop-nav-links" style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
            {NAV_LINKS.map(({ label, to }) => (
              <Link key={label} to={to} className="auth-nav-link">{label}</Link>
            ))}
          </div>
          <button
            className="hamburger-btn"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 5, padding: 4 }}
          >
            {[0,1,2].map(i => (
              <span key={i} style={{
                display: 'block', width: 22, height: 2, background: '#fff', borderRadius: 2, transition: 'all 0.3s',
                transform: isMenuOpen ? (i===0?'rotate(45deg) translate(5px,5px)':i===1?'scaleX(0)':'rotate(-45deg) translate(5px,-5px)') : 'none',
              }} />
            ))}
          </button>
        </div>
        <div className={`mobile-menu-drawer ${isMenuOpen ? 'open' : ''}`}>
          {NAV_LINKS.map(({ label, to }) => (
            <Link key={label} to={to} className="auth-nav-link" style={{ fontSize: '0.95rem', padding: '0.4rem 0' }} onClick={() => setIsMenuOpen(false)}>{label}</Link>
          ))}
        </div>
        </nav>
      )}

      {/* ── MAIN ────────────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', position: 'relative', zIndex: 1 }}>
        <div
          className="reset-split glass-card"
          style={{ width: '100%', maxWidth: 800, display: 'flex', overflow: 'hidden', minHeight: 500, transform: isModal ? 'scale(0.85)' : 'none' }}
        >
          {/* LEFT: Mascot panel */}
          <div
            className="mascot-col"
            style={{
              width: '42%',
              background: 'linear-gradient(145deg, rgba(139,0,0,0.4), rgba(80,0,0,0.6))',
              borderRight: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '3rem 2rem',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <Orb style={{ width: 280, height: 280, background: 'rgba(180,20,20,0.25)', top: -60, right: -60 }} />
            <Orb style={{ width: 180, height: 180, background: 'rgba(100,0,0,0.3)', bottom: -40, left: -40 }} />

            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', width: '100%' }}>
              {/* Logo */}
              <img src={atlasLogo} alt="ATLAS Logo" style={{ height: 28, filter: 'brightness(0) saturate(100%) invert(26%) sepia(51%) saturate(2796%) hue-rotate(345deg) brightness(92%) contrast(92%)' }} />

              {/* Speech bubble — updates per step */}
              <div className="speech-bubble" style={{ maxWidth: 260 }}>
                {STEP_CONFIG[step]?.bubble}
              </div>

              {/* Mascot icon large */}
              <div style={{ fontSize: '5rem', lineHeight: 1, filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.5))', transition: 'all 0.4s ease' }}>
                {STEP_CONFIG[step]?.icon}
              </div>

              {/* Step progress bar */}
              {step < STEPS.DONE && (
                <div style={{ width: '80%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    {['Email', 'Verify', 'Password'].map((label, i) => (
                      <span key={label} style={{
                        fontSize: '0.7rem',
                        color: i <= step ? '#FF6B6B' : 'rgba(255,255,255,0.25)',
                        fontWeight: 600,
                        transition: 'color 0.3s',
                      }}>
                        {label}
                      </span>
                    ))}
                  </div>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${((step) / 2) * 100}%`,
                      background: 'linear-gradient(90deg, #8B0000, #C0392B)',
                      borderRadius: 4,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Form panel */}
          <div style={{ flex: 1, padding: '3rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

            {/* ── STEP 0: Email ─────────────────────────────────────── */}
            {step === STEPS.EMAIL && (
              <div key="email" className="step-enter">
                <h1 style={{ fontSize: '1.55rem', fontWeight: 800, margin: '0 0 0.4rem', letterSpacing: '-0.01em' }}>
                  Reset your <span className="glow-text">password</span>
                </h1>
                <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.87rem', margin: '0 0 1.75rem', lineHeight: 1.6 }}>
                  Enter your institutional email and we'll send you a one-time code.
                </p>

                {error && <div className="error-box">{error}</div>}

                <form onSubmit={handleSendOtp}>
                  <span className="label-text">INSTITUTIONAL EMAIL</span>
                  <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem' }}>
                    <input
                      className="dark-input"
                      type="email"
                      placeholder="you@institution.edu.ph"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setError('') }}
                      required
                      autoFocus
                      style={{ flex: 1 }}
                    />
                    <button type="submit" className="btn-inline" disabled={loading}>
                      {loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Get OTP'}
                    </button>
                  </div>

                  <p style={{ textAlign: 'center', fontSize: '0.83rem', color: 'rgba(255,255,255,0.35)', margin: 0 }}>
                    Remembered it?{' '}
                    {isModal ? (
                      <button type="button" onClick={() => onSwitch('signin')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#FF6B6B', fontWeight: 700 }}>
                        Sign In
                      </button>
                    ) : (
                      <Link to={ROUTES.SIGN_IN} style={{ color: '#FF6B6B', fontWeight: 700, textDecoration: 'none' }}>
                        Sign In
                      </Link>
                    )}
                  </p>
                </form>
              </div>
            )}

            {/* ── STEP 1: OTP ───────────────────────────────────────── */}
            {step === STEPS.OTP && (
              <div key="otp" className="step-enter">
                <h1 style={{ fontSize: '1.55rem', fontWeight: 800, margin: '0 0 0.4rem', letterSpacing: '-0.01em' }}>
                  Check your <span className="glow-text">email</span>
                </h1>
                <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.87rem', margin: '0 0 1.75rem', lineHeight: 1.6 }}>
                  We sent a 4-digit code to{' '}
                  <span style={{ color: '#FF8080', fontWeight: 600 }}>{email}</span>
                </p>

                {error && <div className="error-box">{error}</div>}

                <form onSubmit={handleVerifyOtp}>
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.05em', textAlign: 'center', marginBottom: 8 }}>
                    ENTER CODE
                  </p>

                  <OtpInput value={otp} onChange={setOtp} />

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={loading || otp.length < 4}
                    style={{ marginTop: '0.5rem', marginBottom: '1.25rem' }}
                  >
                    {loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Verify Code'}
                  </button>

                  <p style={{ textAlign: 'center', fontSize: '0.83rem', color: 'rgba(255,255,255,0.35)', margin: 0 }}>
                    Didn't receive it?{' '}
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resendCooldown > 0}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                        color: resendCooldown > 0 ? 'rgba(255,255,255,0.25)' : '#FF6B6B',
                        fontWeight: 700, fontSize: '0.83rem',
                        fontFamily: 'inherit', transition: 'color 0.2s',
                      }}
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                    </button>
                  </p>
                </form>
              </div>
            )}

            {/* ── STEP 2: New Password ──────────────────────────────── */}
            {step === STEPS.NEW_PASSWORD && (
              <div key="newpass" className="step-enter">
                <h1 style={{ fontSize: '1.55rem', fontWeight: 800, margin: '0 0 0.4rem', letterSpacing: '-0.01em' }}>
                  Set new <span className="glow-text">password</span>
                </h1>
                <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.87rem', margin: '0 0 1.75rem', lineHeight: 1.6 }}>
                  Choose a strong password for your account. Minimum 8 characters.
                </p>

                {error && <div className="error-box">{error}</div>}

                <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                  <div>
                    <span className="label-text">NEW PASSWORD</span>
                    <div className="password-wrap">
                      <input
                        className="dark-input"
                        type={showNewPass ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={e => { setNewPassword(e.target.value); setError('') }}
                        required
                        autoFocus
                        style={{ paddingRight: '3.5rem' }}
                      />
                      <button type="button" className="password-toggle" onClick={() => setShowNewPass(!showNewPass)}>
                        {showNewPass ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="label-text">CONFIRM PASSWORD</span>
                    <div className="password-wrap">
                      <input
                        className="dark-input"
                        type={showConfirm ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={confirm}
                        onChange={e => { setConfirm(e.target.value); setError('') }}
                        required
                        style={{ paddingRight: '3.5rem' }}
                      />
                      <button type="button" className="password-toggle" onClick={() => setShowConfirm(!showConfirm)}>
                        {showConfirm ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  {/* Password match indicator */}
                  {confirm.length > 0 && (
                    <div style={{
                      fontSize: '0.78rem',
                      color: newPassword === confirm ? '#80FF80' : '#FF8080',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      <span>{newPassword === confirm ? '✓' : '✗'}</span>
                      {newPassword === confirm ? 'Passwords match' : 'Passwords do not match'}
                    </div>
                  )}

                  <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '0.25rem' }}>
                    {loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Reset Password'}
                  </button>
                </form>
              </div>
            )}

            {/* ── STEP 3: Done ──────────────────────────────────────── */}
            {step === STEPS.DONE && (
              <div key="done" className="step-enter" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '4rem', marginBottom: '1.25rem', lineHeight: 1 }}>✅</div>
                <h1 style={{ fontSize: '1.7rem', fontWeight: 800, margin: '0 0 0.6rem', letterSpacing: '-0.01em' }}>
                  Password <span className="glow-text">Reset!</span>
                </h1>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.88rem', margin: '0 0 2rem', lineHeight: 1.7 }}>
                  You can now sign in to ATLAS with your new password.
                </p>
                <button
                  className="btn-primary"
                  onClick={() => isModal ? onSwitch('signin') : navigate(ROUTES.SIGN_IN)}
                >
                  Go to Sign In →
                </button>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}