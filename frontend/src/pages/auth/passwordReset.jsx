// src/pages/auth/PasswordResetPage.jsx
// Matches: Sign in | Password Reset
// Step 1: Enter email → get OTP
// Step 2: Enter 4-digit OTP code
// Step 3: Set new password

import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button           from '@mui/material/Button'
import TextField        from '@mui/material/TextField'
import Alert            from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import AuthLayout       from '../../components/AuthLayout'
import AtlasLogo        from '../../components/AtlasLogo'
import { useAuth }      from '../../store/authStore'
import { ROUTES }       from '../../config/routes'

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
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 8 }}>
      {[0, 1, 2, 3].map((i) => (
        <input
          key={i}
          ref={(el) => (inputs.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] || ''}
          onKeyDown={(e) => handleKey(e, i)}
          onChange={() => {}}   // controlled via onKeyDown
          style={{
            width: 52,
            height: 56,
            textAlign: 'center',
            fontSize: '1.5rem',
            fontWeight: 700,
            fontFamily: '"Plus Jakarta Sans", sans-serif',
            border: digits[i] ? '2px solid #8B0000' : '2px solid #E0E0E0',
            borderRadius: 8,
            outline: 'none',
            background: '#fff',
            color: '#1A1A1A',
            transition: 'border-color 0.2s',
            cursor: 'text',
          }}
          onFocus={(e) => e.target.style.borderColor = '#8B0000'}
          onBlur={(e) => { if (!digits[i]) e.target.style.borderColor = '#E0E0E0' }}
        />
      ))}
    </div>
  )
}

// ── Steps ────────────────────────────────────────────────────────────────────
const STEPS = { EMAIL: 0, OTP: 1, NEW_PASSWORD: 2, DONE: 3 }

export default function PasswordResetPage() {
  const navigate                              = useNavigate()
  const { sendOtp, verifyOtp, resetPassword } = useAuth()

  const [step, setStep]             = useState(STEPS.EMAIL)
  const [email, setEmail]           = useState('')
  const [otp, setOtp]               = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm]       = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  // ── Step 1: Send OTP ────────────────────────────────────────────────────
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
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: Verify OTP ──────────────────────────────────────────────────
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
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3: Reset password ───────────────────────────────────────────────
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
    } finally {
      setLoading(false)
    }
  }

  function startResendCooldown() {
    setResendCooldown(60)
    const interval = setInterval(() => {
      setResendCooldown((c) => {
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
    } finally {
      setLoading(false)
    }
  }

  // ── Bubble text per step ─────────────────────────────────────────────────
  const bubbleTexts = [
    "Forgot your password? No worries! 🔐",
    "Check your email for the OTP! 📧",
    "Almost there! Set your new password 🔑",
    "You're all set! Welcome back 🎉",
  ]

  return (
    <AuthLayout bubbleText={bubbleTexts[step]}>
      <div className="auth-form-enter">

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <AtlasLogo size={36} />
        </div>

        {/* ── STEP 0: Email ─────────────────────────────────────────── */}
        {step === STEPS.EMAIL && (
          <form onSubmit={handleSendOtp}>
            <h3
              style={{
                fontFamily: '"DM Serif Display", serif',
                fontSize: '1.4rem',
                margin: '0 0 8px',
                textAlign: 'center',
                color: '#1A1A1A',
                fontWeight: 400,
              }}
            >
              Reset your password
            </h3>
            <p style={{ color: '#888', fontSize: '0.83rem', textAlign: 'center', marginBottom: 24 }}>
              Enter your institutional email and we'll send you a one-time code.
            </p>

            {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <TextField
                label="Enter your Email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                size="small"
                fullWidth
                required
                InputProps={{ sx: { borderRadius: 2 } }}
              />
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={loading}
                sx={{ borderRadius: 2, whiteSpace: 'nowrap', px: 2.5, minWidth: 0 }}
              >
                {loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Get OTP'}
              </Button>
            </div>

            <p style={{ textAlign: 'center', fontSize: '0.83rem', color: '#888', marginTop: 20 }}>
              Remembered it?{' '}
              <Link to={ROUTES.SIGN_IN} style={{ color: '#8B0000', fontWeight: 600, textDecoration: 'none' }}>
                Sign In
              </Link>
            </p>
          </form>
        )}

        {/* ── STEP 1: OTP ─────────────────────────────────────────── */}
        {step === STEPS.OTP && (
          <form onSubmit={handleVerifyOtp}>
            <h3
              style={{
                fontFamily: '"DM Serif Display", serif',
                fontSize: '1.4rem',
                margin: '0 0 8px',
                textAlign: 'center',
                color: '#1A1A1A',
                fontWeight: 400,
              }}
            >
              Reset your password
            </h3>
            <p style={{ color: '#888', fontSize: '0.83rem', textAlign: 'center', marginBottom: 20 }}>
              We sent a 4-digit code to <strong style={{ color: '#333' }}>{email}</strong>
            </p>

            {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

            <p style={{ color: '#555', fontSize: '0.8rem', marginBottom: 10, textAlign: 'center' }}>
              Enter Code
            </p>

            <OtpInput value={otp} onChange={setOtp} />

            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
              disabled={loading || otp.length < 4}
              sx={{ borderRadius: 2, py: 1.3, fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.04em', mt: 2 }}
            >
              {loading ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'LOGIN'}
            </Button>

            <p style={{ textAlign: 'center', fontSize: '0.82rem', color: '#888', marginTop: 16 }}>
              Didn't receive it?{' '}
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0}
                style={{
                  background: 'none', border: 'none', cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                  color: resendCooldown > 0 ? '#BDBDBD' : '#8B0000',
                  fontWeight: 600, fontSize: '0.82rem', padding: 0,
                  fontFamily: '"Plus Jakarta Sans", sans-serif',
                }}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
              </button>
            </p>
          </form>
        )}

        {/* ── STEP 2: New password ──────────────────────────────────── */}
        {step === STEPS.NEW_PASSWORD && (
          <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3
              style={{
                fontFamily: '"DM Serif Display", serif',
                fontSize: '1.4rem',
                margin: '0 0 4px',
                textAlign: 'center',
                color: '#1A1A1A',
                fontWeight: 400,
              }}
            >
              Set New Password
            </h3>
            <p style={{ color: '#888', fontSize: '0.83rem', textAlign: 'center', margin: '0 0 8px' }}>
              Choose a strong password for your account.
            </p>

            {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

            <TextField
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setError('') }}
              size="small"
              fullWidth
              required
              InputProps={{ sx: { borderRadius: 2 } }}
            />
            <TextField
              label="Confirm Password"
              type="password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError('') }}
              size="small"
              fullWidth
              required
              InputProps={{ sx: { borderRadius: 2 } }}
            />

            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
              disabled={loading}
              sx={{ borderRadius: 2, py: 1.3, fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.04em' }}
            >
              {loading ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Reset Password'}
            </Button>
          </form>
        )}

        {/* ── STEP 3: Done ─────────────────────────────────────────── */}
        {step === STEPS.DONE && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <h3
              style={{
                fontFamily: '"DM Serif Display", serif',
                fontSize: '1.5rem',
                color: '#1A1A1A',
                margin: '0 0 12px',
                fontWeight: 400,
              }}
            >
              Password Reset Successful!
            </h3>
            <p style={{ color: '#888', fontSize: '0.88rem', marginBottom: 24 }}>
              You can now sign in with your new password.
            </p>
            <Button
              variant="contained"
              color="primary"
              fullWidth
              onClick={() => navigate(ROUTES.SIGN_IN)}
              sx={{ borderRadius: 2, py: 1.2 }}
            >
              Go to Sign In
            </Button>
          </div>
        )}
      </div>
    </AuthLayout>
  )
}