// src/pages/auth/SignInPage.jsx
// Matches: Landing Page | Sign In
// "Welcome Back to ATLAS!" form with email/password + Google option

import { useState }          from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import Button                from '@mui/material/Button'
import TextField             from '@mui/material/TextField'
import Divider               from '@mui/material/Divider'
import Alert                 from '@mui/material/Alert'
import CircularProgress      from '@mui/material/CircularProgress'
import AuthLayout            from '../../components/AuthLayout'
import AtlasLogo             from '../../components/AtlasLogo'
import AutoAlert             from '../../components/AutoAlert'
import { useAuth }           from '../../store/authStore'
import useRoleRedirect       from '../../hooks/useRoleRedirect'
import { ROUTES }            from '../../config/routes'

// Shared Google icon
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

export default function SignInPage() {
  const navigate                  = useNavigate()
  const location                  = useLocation()
  const { login, loginWithGoogle } = useAuth()
  const { redirectToDashboard }   = useRoleRedirect()

  const [form, setForm]       = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // Redirect after login to the page they came from, or their dashboard
  const from = location.state?.from?.pathname

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.email || !form.password) { setError('Please enter your email and password.'); return }
    setLoading(true)
    try {
      const user = await login(form.email, form.password)
      if (from) navigate(from, { replace: true })
      else redirectToDashboard(user.role)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    setError('Google sign-in will be available soon.')
  }

  return (
    <AuthLayout bubbleText="Welcome back! Ready to teach smarter? 📚">
      <div className="auth-form-enter">
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <AtlasLogo size={36} />
          <h2
            style={{
              fontFamily: '"DM Serif Display", serif',
              fontSize: '1.6rem',
              color: '#1A1A1A',
              margin: '16px 0 6px',
              fontWeight: 400,
            }}
          >
            Welcome Back to ATLAS!
          </h2>
          <p style={{ color: '#888', fontSize: '0.83rem', margin: 0 }}>
            Sign in to your institution's platform.
          </p>
        </div>

        {/* Error */}
        <AutoAlert message={error} onClose={() => setError('')} sx={{ mb: 2, borderRadius: 2 }} />

        {/* Email / password form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TextField
            name="email"
            label="Email"
            type="email"
            placeholder="you@institution.edu.ph"
            value={form.email}
            onChange={handleChange}
            fullWidth
            size="small"
            required
            autoFocus
            InputProps={{ sx: { borderRadius: 2 } }}
          />
          <TextField
            name="password"
            label="Password"
            type="password"
            placeholder="••••••••"
            value={form.password}
            onChange={handleChange}
            fullWidth
            size="small"
            required
            InputProps={{ sx: { borderRadius: 2 } }}
          />

          {/* Forgot password */}
          <div style={{ textAlign: 'right', marginTop: -6 }}>
            <Link
              to={ROUTES.RESET_PASSWORD}
              style={{ fontSize: '0.82rem', color: '#8B0000', fontWeight: 600, textDecoration: 'none' }}
            >
              Forgot Password
            </Link>
          </div>

          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={loading}
            sx={{ borderRadius: 2, py: 1.3, fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.04em', bgcolor: '#8B0000', '&:hover': { bgcolor: '#700000' } }}
          >
            {loading
              ? <CircularProgress size={20} sx={{ color: '#fff' }} />
              : 'LOGIN'
            }
          </Button>
        </form>

        {/* Divider */}
        <Divider sx={{ my: 2, color: '#BDBDBD', fontSize: '0.78rem', letterSpacing: '0.04em' }}>
          OR
        </Divider>

        {/* Google */}
        <Button
          fullWidth
          variant="outlined"
          onClick={handleGoogleLogin}
          startIcon={<GoogleIcon />}
          sx={{
            borderColor: '#E0E0E0',
            color: '#333',
            borderRadius: 2,
            py: 1.1,
            fontSize: '0.88rem',
            fontWeight: 500,
            '&:hover': { borderColor: '#BDBDBD', background: '#FAFAFA' },
          }}
        >
          Continue with Google
        </Button>

        {/* Sign up link */}
        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#888', marginTop: 16 }}>
          Don't have an account yet?{' '}
          <Link
            to={ROUTES.SIGN_UP}
            style={{ color: '#8B0000', fontWeight: 600, textDecoration: 'none' }}
          >
            Sign Up
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}