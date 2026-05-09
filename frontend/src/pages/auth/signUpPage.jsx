// src/pages/auth/SignUpPage.jsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button           from '@mui/material/Button';
import TextField        from '@mui/material/TextField';
import Divider          from '@mui/material/Divider';
import Checkbox         from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Alert            from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { useAuth }      from '../../store/authStore';
import { ROUTES }       from '../../config/route';

// Import your assets
import atlasLogo from '../../assets/atlas-logo.png';
import atlasMascot from '../../assets/atlas.png';

// Google icon SVG
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

export default function SignUpPage() {
  const navigate              = useNavigate();
  const { register }          = useAuth();
  const [agreed, setAgreed]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState('');
  
  // State for progressive form disclosure
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isMenuOpen, setIsMenuOpen]       = useState(false); // Mobile menu state
  
  const [form, setForm] = useState({
    full_name:        '',
    email:            '',
    institution_name: '',
    password:         '',
  });

  // Reusable Nav Classes
  const navLinkClasses = "text-gray-800 hover:text-[#A52028] transition-colors font-semibold tracking-wide text-sm md:text-base px-2 py-1";
  const mobileNavLinkClasses = "block text-lg font-semibold text-gray-800 hover:text-[#A52028] transition-colors py-3 px-6";

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleEmailSignUp(e) {
    e.preventDefault();
    if (!agreed) { setError('Please agree to the Terms and Conditions.'); return; }
    if (!form.email || !form.password || !form.institution_name || !form.full_name) {
      setError('Please fill in all fields.'); return;
    }
    setLoading(true);
    try {
      await register(form);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleSignUp() {
    setError('Google sign-in will be available soon. Please use email for now.');
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans flex flex-col">
      
      {/* 1. Navigation Bar (Mirrored from Landing Page) */}
      <nav className="bg-transparent z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center flex-shrink-0">
            <Link to="/">
              <img src={atlasLogo} alt="ATLAS Logo" className="h-9 md:h-10 object-contain" />
            </Link>
          </div>
          <div className="hidden md:flex space-x-6 lg:space-x-10 items-center">
            <Link to="/" className={navLinkClasses}>HOME</Link>
            <Link to={ROUTES.SIGN_UP} className={`${navLinkClasses} text-[#A52028]`}>SIGN UP</Link>
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
          <div className="md:hidden bg-white border-b border-gray-100 shadow-md absolute w-full">
            <div className="space-y-1 pb-4 pt-2">
              <Link to="/" onClick={() => setIsMenuOpen(false)} className={mobileNavLinkClasses}>HOME</Link>
              <Link to={ROUTES.SIGN_UP} onClick={() => setIsMenuOpen(false)} className={`${mobileNavLinkClasses} text-[#A52028] bg-red-50`}>SIGN UP</Link>
              <Link to="/pricing" onClick={() => setIsMenuOpen(false)} className={mobileNavLinkClasses}>PRICING</Link>
              <Link to="/contact" onClick={() => setIsMenuOpen(false)} className={mobileNavLinkClasses}>CONTACT</Link>
            </div>
          </div>
        )}
      </nav>

      {/* 2. Main Content Split Layout */}
      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col md:flex-row">
          
          {/* LEFT SIDE: Form Container */}
          <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center">
            
            {success ? (
              <div className="text-center animate-fade-in">
                <img src={atlasLogo} alt="ATLAS Logo" className="h-12 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-[#A52028] mb-4">Application Submitted!</h2>
                <Alert severity="success" sx={{ mb: 4, borderRadius: 2 }}>
                  Your institution registration has been received. The ATLAS team will review and provide credentials within <strong>2–3 business days</strong>.
                </Alert>
                <Button variant="outlined" color="primary" fullWidth component={Link} to={ROUTES.SIGN_IN} sx={{ borderRadius: 2 }}>
                  Back to Sign In
                </Button>
              </div>
            ) : (
              <div className="animate-fade-in">
                {/* Header */}
                <div className="text-center mb-8">
                  <img src={atlasLogo} alt="ATLAS Logo" className="h-12 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-[#A52028] mb-2">Get ATLAS for Your Institution</h2>
                  <p className="text-gray-500 text-sm">
                    Tell us about your institution and we'll get your platform set up. 
                    Approved institutions receive credentials within 2–3 business days.
                  </p>
                </div>

                {error && <Alert severity="error" sx={{ mb: 4, borderRadius: 2 }}>{error}</Alert>}

                {/* Google Button */}
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={handleGoogleSignUp}
                  startIcon={<GoogleIcon />}
                  sx={{ borderColor: '#E0E0E0', color: '#333', borderRadius: 2, py: 1.2, mb: 3, textTransform: 'none', fontWeight: 600 }}
                >
                  Continue with Google
                </Button>

                <Divider sx={{ mb: 3, color: '#888', fontSize: '0.8rem' }}>OR</Divider>

                {/* Progressive Form */}
                {!showEmailForm ? (
                  <Button
                    fullWidth
                    variant="contained"
                    onClick={() => setShowEmailForm(true)}
                    sx={{ backgroundColor: '#A52028', color: '#fff', borderRadius: 2, py: 1.2, textTransform: 'none', fontWeight: 600, '&:hover': { backgroundColor: '#8B1A20' } }}
                  >
                    Continue with Email
                  </Button>
                ) : (
                  <form onSubmit={handleEmailSignUp} className="space-y-4 animate-fade-in-down">
                    <TextField name="full_name" label="Full Name" value={form.full_name} onChange={handleChange} fullWidth size="small" required InputProps={{ sx: { borderRadius: 2 } }} />
                    <TextField name="institution_name" label="Institution Name" value={form.institution_name} onChange={handleChange} fullWidth size="small" required InputProps={{ sx: { borderRadius: 2 } }} />
                    <TextField name="email" label="Institutional Email" type="email" value={form.email} onChange={handleChange} fullWidth size="small" required InputProps={{ sx: { borderRadius: 2 } }} />
                    <TextField name="password" label="Password" type="password" value={form.password} onChange={handleChange} fullWidth size="small" required InputProps={{ sx: { borderRadius: 2 } }} />
                    <Button type="submit" variant="contained" fullWidth disabled={loading} sx={{ backgroundColor: '#A52028', borderRadius: 2, py: 1.2, mt: 2, textTransform: 'none', fontWeight: 600, '&:hover': { backgroundColor: '#8B1A20' } }}>
                      {loading ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Submit Registration'}
                    </Button>
                  </form>
                )}

                {/* Sign In Link */}
                <p className="text-center text-sm text-gray-500 mt-6 mb-4">
                  Already have an account? <Link to={ROUTES.SIGN_IN} className="text-[#A52028] font-bold">Sign In</Link>
                </p>

                {/* Terms */}
                <div className="flex justify-center">
                  <FormControlLabel
                    control={<Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)} size="small" sx={{ color: '#A52028', '&.Mui-checked': { color: '#A52028' } }} />}
                    label={<span className="text-xs text-gray-500 text-center inline-block">I agree to the <span className="text-[#A52028] font-bold">Terms and Condition of Use <br/> and Privacy Policy</span></span>}
                  />
                </div>
              </div>
            )}
          </div>

          {/* RIGHT SIDE: Red Panel with Mascot */}
          <div className="hidden md:flex w-1/2 bg-[#A52028] flex-col items-center justify-center relative p-12">
            
            {/* Simple CSS Speech Bubble */}
            <div className="bg-white text-[#A52028] font-bold text-lg px-8 py-4 rounded-3xl mb-8 relative shadow-lg">
              Let's get your institution set up! 🏫
              {/* The little tail of the speech bubble */}
              <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[10px] border-l-transparent border-t-[15px] border-t-white border-r-[10px] border-r-transparent"></div>
            </div>

            <img 
              src={atlasMascot} 
              alt="ATLAS Mascot" 
              className="w-full max-w-[300px] object-contain drop-shadow-2xl"
            />
          </div>

        </div>
      </main>
    </div>
  );
}