// src/pages/auth/SignUpPage.jsx
// Matches: Landing Page | Sign Up
// Two-column layout: red mascot panel (left) + registration form (right)

import { useState }     from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button           from '@mui/material/Button'
import TextField        from '@mui/material/TextField'
import Divider          from '@mui/material/Divider'
import Checkbox         from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Alert            from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import AuthLayout       from '../../components/AuthLayout'
import AtlasLogo        from '../../components/AtlasLogo'
import { useAuth }      from '../../store/authStore'
import { ROUTES }       from '../../config/routes'

// Google icon SVG
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

export default function SignUpPage() {
  const navigate              = useNavigate()
  const { register }          = useAuth()
  const [agreed, setAgreed]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError]     = useState('')
  const [form, setForm]       = useState({
    full_name:        '',
    email:            '',
    institution_name: '',
    password:         '',
  })

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
    setError('')
  }

  async function handleEmailSignUp(e) {
    e.preventDefault()
    if (!agreed) { setError('Please agree to the Terms and Conditions.'); return }
    if (!form.email || !form.password || !form.institution_name || !form.full_name) {
      setError('Please fill in all fields.'); return
    }
    setLoading(true)
    try {
      await register(form)
      setSuccess(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleGoogleSignUp() {
    // TODO: trigger Google OAuth flow via Django allauth or dj-rest-auth
    // For now, show a coming soon message
    setError('Google sign-in will be available soon. Please use email for now.')
  }

  if (success) {
    return (
      <AuthLayout bubbleText="Registration sent! 🎉">
        <div style={{ textAlign: 'center' }}>
          <AtlasLogo size={36} />
          <h2
            style={{
              fontFamily: '"DM Serif Display", serif',
              fontSize: '1.6rem',
              color: '#1A1A1A',
              margin: '20px 0 12px',
            }}
          >
            Application Submitted!
          </h2>
          <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>
            Your institution registration has been received. The ATLAS team will
            review and provide your credentials within <strong>2–3 business days</strong>.
          </Alert>
          <Button
            variant="outlined"
            color="primary"
            fullWidth
            component={Link}
            to={ROUTES.SIGN_IN}
            sx={{ borderRadius: 2 }}
          >
            Back to Sign In
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout bubbleText="Let's get your institution set up! 🏫">
      <div className="auth-form-enter">
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <AtlasLogo size={36} />
          <h2
            style={{
              fontFamily: '"DM Serif Display", serif',
              fontSize: '1.5rem',
              color: '#1A1A1A',
              margin: '16px 0 6px',
              fontWeight: 400,
            }}
          >
            Get ATLAS for Your Institution
          </h2>
          <p style={{ color: '#888', fontSize: '0.83rem', margin: 0, lineHeight: 1.5 }}>
            Tell us about your institution and we'll get your platform set up.
            Approved institutions receive credentials within 2–3 business days.
          </p>
        </div>

        {/* Error */}
        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {/* Google sign-up */}
        <Button
          fullWidth
          variant="outlined"
          onClick={handleGoogleSignUp}
          startIcon={<GoogleIcon />}
          sx={{
            borderColor: '#E0E0E0',
            color: '#333',
            borderRadius: 2,
            py: 1.2,
            mb: 2,
            fontSize: '0.9rem',
            fontWeight: 500,
            '&:hover': { borderColor: '#BDBDBD', background: '#FAFAFA' },
          }}
        >
          Continue with Google
        </Button>

        {/* Divider */}
        <Divider sx={{ mb: 2, color: '#BDBDBD', fontSize: '0.78rem', letterSpacing: '0.04em' }}>
          OR
        </Divider>

        {/* Form */}
        <form onSubmit={handleEmailSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TextField
            name="full_name"
            label="Full Name"
            placeholder="Juan Dela Cruz"
            value={form.full_name}
            onChange={handleChange}
            fullWidth
            size="small"
            required
            InputProps={{ sx: { borderRadius: 2 } }}
          />
          <TextField
            name="institution_name"
            label="Institution Name"
            placeholder="Batangas State University"
            value={form.institution_name}
            onChange={handleChange}
            fullWidth
            size="small"
            required
            InputProps={{ sx: { borderRadius: 2 } }}
          />
          <TextField
            name="email"
            label="Institutional Email"
            type="email"
            placeholder="you@batstate-u.edu.ph"
            value={form.email}
            onChange={handleChange}
            fullWidth
            size="small"
            required
            InputProps={{ sx: { borderRadius: 2 } }}
          />
          <TextField
            name="password"
            label="Password"
            type="password"
            placeholder="At least 8 characters"
            value={form.password}
            onChange={handleChange}
            fullWidth
            size="small"
            required
            InputProps={{ sx: { borderRadius: 2 } }}
          />

          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            disabled={loading}
            sx={{ borderRadius: 2, py: 1.2, fontSize: '0.95rem', mt: 0.5 }}
          >
            {loading
              ? <CircularProgress size={20} sx={{ color: '#fff' }} />
              : 'Continue with Email'
            }
          </Button>
        </form>

        {/* Sign in link */}
        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#888', marginTop: 16 }}>
          Already have an account?{' '}
          <Link
            to={ROUTES.SIGN_IN}
            style={{ color: '#8B0000', fontWeight: 600, textDecoration: 'none' }}
          >
            Sign In
          </Link>
        </p>

        {/* Terms */}
        <FormControlLabel
          control={
            <Checkbox
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              size="small"
              sx={{ color: '#8B0000', '&.Mui-checked': { color: '#8B0000' } }}
            />
          }
          label={
            <span style={{ fontSize: '0.78rem', color: '#666', lineHeight: 1.4 }}>
              I agree to the{' '}
              <a href="#" style={{ color: '#8B0000', fontWeight: 600 }}>
                Terms and Condition of Use and Privacy Policy
              </a>
            </span>
          }
          sx={{ mt: 1, alignItems: 'flex-start' }}
        />
      </div>
    </AuthLayout>
  )
}