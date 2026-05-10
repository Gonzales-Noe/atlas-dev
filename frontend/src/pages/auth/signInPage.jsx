// src/pages/auth/SignInPage.jsx
import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import Button           from '@mui/material/Button';
import TextField        from '@mui/material/TextField';
import Divider          from '@mui/material/Divider';
import Alert            from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { useAuth }      from '../../store/authStore';
import useRoleRedirect  from '../../hooks/useRoleRedirect';
import { ROUTES }       from '../../config/route';

// Import your assets
import atlasLogo from '../../assets/atlas-logo.png';
import atlasMascot from '../../assets/atlas.png';

// Shared Google icon
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function SignInPage() {
  const navigate                  = useNavigate();
  const location                  = useLocation();
  const { login }                 = useAuth();
  const { redirectToDashboard }   = useRoleRedirect();

  const [form, setForm]       = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  
  // State for mobile menu
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Redirect after login to the page they came from, or their dashboard
  const from = location.state?.from?.pathname;

  // Reusable Nav Classes
  const navLinkClasses = "text-gray-800 hover:text-[#A52028] transition-colors font-semibold tracking-wide text-sm md:text-base px-2 py-1";
  const mobileNavLinkClasses = "block text-lg font-semibold text-gray-800 hover:text-[#A52028] transition-colors py-3 px-6";

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.email || !form.password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      if (from) navigate(from, { replace: true });
      else redirectToDashboard(user.role);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError('Google sign-in will be available soon.');
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans flex flex-col">
      
      {/* 1. Navigation Bar */}
      <nav className="bg-transparent z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center flex-shrink-0">
            <Link to="/">
              <img src={atlasLogo} alt="ATLAS Logo" className="h-9 md:h-10 object-contain" />
            </Link>
          </div>
          <div className="hidden md:flex space-x-6 lg:space-x-10 items-center">
            <Link to="/" className={navLinkClasses}>HOME</Link>
            <Link to={ROUTES.SIGN_UP} className={navLinkClasses}>SIGN UP</Link>
            <Link to="/pricing" className={navLinkClasses}>PRICING</Link>
            <Link to="/contact" className={navLinkClasses}>CONTACT</Link>
          </div>
          <div className="md:hidden">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-700 hover:text-[#A52028] focus:outline-none p-2"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMenuOpen 
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l18 18" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                }
              </svg>
            </button>
          </div>
        </div>
        {isMenuOpen && (
          <div className="md:hidden bg-white border-b border-gray-100 shadow-md absolute w-full z-50">
            <div className="space-y-1 pb-4 pt-2">
              <Link to="/" onClick={() => setIsMenuOpen(false)} className={mobileNavLinkClasses}>HOME</Link>
              <Link to={ROUTES.SIGN_UP} onClick={() => setIsMenuOpen(false)} className={mobileNavLinkClasses}>SIGN UP</Link>
              <Link to="/pricing" onClick={() => setIsMenuOpen(false)} className={mobileNavLinkClasses}>PRICING</Link>
              <Link to="/contact" onClick={() => setIsMenuOpen(false)} className={mobileNavLinkClasses}>CONTACT</Link>
            </div>
          </div>
        )}
      </nav>

      {/* 2. Main Content Split Layout */}
      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col md:flex-row">
          
          {/* LEFT SIDE: Red Panel with Mascot (Flipped from SignUp!) */}
          <div className="hidden md:flex w-1/2 bg-[#A52028] flex-col items-center justify-center relative p-12">
            
            <div className="bg-white text-[#A52028] font-bold text-lg px-8 py-4 rounded-3xl mb-8 relative shadow-lg text-center">
              Welcome back! Ready to teach smarter? 📚
              <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[10px] border-l-transparent border-t-[15px] border-t-white border-r-[10px] border-r-transparent"></div>
            </div>

            <img 
              src={atlasMascot} 
              alt="ATLAS Mascot" 
              className="w-full max-w-[300px] object-contain drop-shadow-2xl"
            />
          </div>

          {/* RIGHT SIDE: Login Form */}
          <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center">
            
            <div className="animate-fade-in">
              {/* Header */}
              <div className="text-center mb-8">
                <img src={atlasLogo} alt="ATLAS Logo" className="h-12 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-[#A52028] mb-2">Welcome Back to ATLAS!</h2>
                <p className="text-gray-500 text-sm">
                  Sign in to your institution's platform.
                </p>
              </div>

              {error && <Alert severity="error" sx={{ mb: 4, borderRadius: 2 }}>{error}</Alert>}
              <Alert severity="info" sx={{ mb: 4, borderRadius: 2 }}>
                Super Admin access: <strong>superadmin@atlas.local</strong> / <strong>SuperAdmin123!</strong><br />
                Faculty access: <strong>faculty@atlas.local</strong> / <strong>Faculty123!</strong>
              </Alert>

              {/* Email / password form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <TextField
                  name="email"
                  label="Email"
                  type="email"
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
                  value={form.password}
                  onChange={handleChange}
                  fullWidth
                  size="small"
                  required
                  InputProps={{ sx: { borderRadius: 2 } }}
                />

                {/* Forgot password */}
                <div className="text-right">
                  <Link
                    to={ROUTES.RESET_PASSWORD}
                    className="text-sm text-[#A52028] font-bold hover:underline"
                  >
                    Forgot Password
                  </Link>
                </div>

                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={loading}
                  sx={{ 
                    backgroundColor: '#A52028', 
                    borderRadius: 2, 
                    py: 1.2, 
                    mt: 2, 
                    textTransform: 'none', 
                    fontWeight: 600, 
                    boxShadow: 'none',
                    '&:hover': { backgroundColor: '#8B1A20', boxShadow: 'none' } 
                  }}
                >
                  {loading ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'LOGIN'}
                </Button>
              </form>

              {/* Divider */}
              <Divider sx={{ my: 3, color: '#888', fontSize: '0.8rem' }}>OR</Divider>

              {/* Google Button */}
              <Button
                fullWidth
                variant="outlined"
                onClick={handleGoogleLogin}
                startIcon={<GoogleIcon />}
                sx={{ 
                  borderColor: '#E0E0E0', 
                  color: '#333', 
                  borderRadius: 2, 
                  py: 1.2, 
                  textTransform: 'none', 
                  fontWeight: 600 
                }}
              >
                Continue with Google
              </Button>

              {/* Sign Up Link */}
              <p className="text-center text-sm text-gray-500 mt-6">
                Don't have an account yet?{' '}
                <Link to={ROUTES.SIGN_UP} className="text-[#A52028] font-bold">
                  Sign Up
                </Link>
              </p>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}