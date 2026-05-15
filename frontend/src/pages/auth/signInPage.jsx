// src/pages/auth/SignInPage.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import CircularProgress from '@mui/material/CircularProgress';
import { useAuth }      from '../../store/authStore';
import useRoleRedirect  from '../../hooks/useRoleRedirect';
import { ROUTES }       from '../../config/route';

import atlasLogo    from '../../assets/atlas-logo.png';
import atlasMascot  from '../../assets/atlas.png';

// ── Shared design primitives (mirrors landing page) ──────────────────────────
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
  );
}

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

const NAV_LINKS = [
  { label: 'HOME',    to: '/' },
  { label: 'SIGN UP', to: '/signup' },
  { label: 'PRICING', to: '/pricing' },
  { label: 'CONTACT', to: '/contact' },
];

export default function SignInPage({ isModal, onClose, onSwitch }) {
  const navigate                = useNavigate();
  const location                = useLocation();
  const { login }               = useAuth();
  const { redirectToDashboard } = useRoleRedirect();

  const [form, setForm]         = useState({ email: '', password: '' });
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted]   = useState(false);

  const from = location.state?.from?.pathname;

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
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
      overflow: 'hidden',
      position: 'relative',
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
          padding: 4px 0;
        }
        .auth-nav-link:hover { color: #fff; }
        .auth-nav-link.active { color: #FF6B6B; }

        .dark-input {
          width: 100%;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          padding: 0.85rem 1.1rem;
          color: #F0F0F0;
          font-family: inherit;
          font-size: 0.92rem;
          outline: none;
          transition: border-color 0.2s, background 0.2s;
          margin-bottom: 0;
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
          letter-spacing: 0.03em;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(139,0,0,0.5);
          background: linear-gradient(135deg, #A00000, #D44);
        }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

        .btn-google {
          width: 100%;
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.8);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 12px;
          padding: 0.85rem;
          font-family: inherit;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .btn-google:hover {
          border-color: rgba(255,255,255,0.28);
          background: rgba(255,255,255,0.09);
        }

        .glass-panel {
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

        .form-enter {
          opacity: 0;
          transform: translateY(20px);
          animation: formEnter 0.5s ease forwards;
        }
        @keyframes formEnter {
          to { opacity: 1; transform: translateY(0); }
        }

        .mascot-enter {
          opacity: 0;
          transform: translateX(30px);
          animation: mascotEnter 0.6s ease 0.15s forwards;
        }
        @keyframes mascotEnter {
          to { opacity: 1; transform: translateX(0); }
        }

        .glow-text {
          background: linear-gradient(135deg, #FF6B6B, #FF4444, #CC0000);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .divider-line {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin: 1.25rem 0;
        }
        .divider-line::before, .divider-line::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.1);
        }

        .mobile-menu-drawer {
          position: absolute;
          top: 64px;
          left: 0;
          right: 0;
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

        .subtle-neon-glow {
          position: relative;
        }
        .subtle-neon-glow::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(
            90deg,
            rgba(255, 107, 107, 0) 0%,
            rgba(255, 107, 107, 0.5) 12.5%,
            rgba(139, 0, 0, 0.5) 25%,
            rgba(255, 107, 107, 0) 50%,
            rgba(255, 107, 107, 0.5) 62.5%,
            rgba(139, 0, 0, 0.5) 75%,
            rgba(255, 107, 107, 0) 100%
          );
          background-size: 200% 100%;
          animation: neon-pan 4s linear infinite;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
        @keyframes neon-pan {
          0% { background-position: 100% 0; }
          100% { background-position: 0 0; }
        }

        .speech-bubble {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 20px;
          padding: 1rem 1.4rem;
          color: #F0F0F0;
          font-weight: 600;
          font-size: 0.95rem;
          position: relative;
          backdrop-filter: blur(10px);
          text-align: center;
          line-height: 1.5;
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
        
        .typing-text {
          position: absolute;
          left: 1.4rem;
          top: 1rem;
          white-space: nowrap;
          overflow: hidden;
          border-right: 2px solid #F0F0F0;
          animation: typing 2.5s steps(35, end) forwards, blink 0.75s step-end infinite;
        }
        @keyframes typing {
          from { width: 0; }
          to { width: calc(100% - 2.8rem); }
        }
        @keyframes blink {
          from, to { border-color: transparent; }
          50% { border-color: #F0F0F0; }
        }

        @media (max-width: 768px) {
          .desktop-nav-links { display: none !important; }
          .hamburger-btn { display: flex !important; }
          .split-layout { flex-direction: column !important; }
          .mascot-panel { display: none !important; }
          .form-panel { border-radius: 20px !important; }
        }
        @media (min-width: 769px) {
          .hamburger-btn { display: none !important; }
        }
      `}</style>

      {/* Background orbs */}
      <Orb style={{ width: 500, height: 500, background: 'rgba(139,0,0,0.15)', top: -120, right: -100 }} />
      <Orb style={{ width: 400, height: 400, background: 'rgba(100,0,0,0.12)', bottom: -80, left: -120 }} />

      {/* Grid overlay */}
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
          backdropFilter: scrolled ? 'blur(20px)' : 'none',
          transition: 'all 0.3s ease',
        }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          padding: '0 2rem', height: 64,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Link to="/">
            <img src={atlasLogo} alt="ATLAS Logo" style={{ height: 28, objectFit: 'contain', filter: 'brightness(0) saturate(100%) invert(26%) sepia(51%) saturate(2796%) hue-rotate(345deg) brightness(92%) contrast(92%)' }} />
          </Link>

          <div className="desktop-nav-links" style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
            {NAV_LINKS.map(({ label, to }) => (
              <Link key={label} to={to} className={`auth-nav-link ${label === 'SIGN UP' ? '' : ''}`}>{label}</Link>
            ))}
          </div>

          {/* Hamburger */}
          <button
            className="hamburger-btn"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 5, padding: 4 }}
          >
            {[0,1,2].map(i => (
              <span key={i} style={{
                display: 'block', width: 22, height: 2,
                background: '#fff', borderRadius: 2,
                transition: 'all 0.3s ease',
                transform: isMenuOpen
                  ? i===0 ? 'rotate(45deg) translate(5px,5px)'
                  : i===1 ? 'scaleX(0)'
                  : 'rotate(-45deg) translate(5px,-5px)'
                  : 'none',
              }} />
            ))}
          </button>
        </div>

        <div className={`mobile-menu-drawer ${isMenuOpen ? 'open' : ''}`}>
          {NAV_LINKS.map(({ label, to }) => (
            <Link key={label} to={to} className="auth-nav-link" style={{ fontSize: '0.95rem', padding: '0.4rem 0' }} onClick={() => setIsMenuOpen(false)}>
              {label}
            </Link>
          ))}
        </div>
        </nav>
      )}

      {/* ── MAIN ────────────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', position: 'relative', zIndex: 1 }}>
        <div
          className="split-layout glass-panel subtle-neon-glow"
          style={{ width: '100%', maxWidth: 960, display: 'flex', overflow: 'hidden', minHeight: 580, transform: isModal ? 'scale(0.85)' : 'none' }}
        >

          {/* LEFT: Mascot Panel */}
          <div
            className="mascot-panel"
            style={{
              width: '45%',
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
            <Orb style={{ width: 300, height: 300, background: 'rgba(180,20,20,0.25)', top: -60, left: -60 }} />
            <Orb style={{ width: 200, height: 200, background: 'rgba(100,0,0,0.3)', bottom: -40, right: -40 }} />

            <div className="mascot-enter" style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
              <div className="speech-bubble" style={{ display: 'inline-block', position: 'relative' }}>
                <span style={{ visibility: 'hidden', whiteSpace: 'nowrap' }}>Welcome back! Ready to teach smarter? 📚</span>
                <span className="typing-text">Welcome back! Ready to teach smarter? 📚</span>
              </div>
              <img
                src={atlasMascot}
                alt="ATLAS Mascot"
                style={{ width: '100%', maxWidth: 380, objectFit: 'contain', filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.5))' }}
              />
            </div>
          </div>

          {/* RIGHT: Form Panel */}
          <div
            className="form-panel"
            style={{ flex: 1, padding: '3rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
          >
            <div className="form-enter">

              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <img src={atlasLogo} alt="ATLAS Logo" style={{ height: 34, objectFit: 'contain', filter: 'brightness(0) saturate(100%) invert(26%) sepia(51%) saturate(2796%) hue-rotate(345deg) brightness(92%) contrast(92%)', marginBottom: '1.2rem' }} />
                <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 0.4rem', letterSpacing: '-0.01em' }}>
                  Welcome Back to <span className="glow-text">ATLAS!</span>
                </h1>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.88rem', margin: 0 }}>
                  Sign in to your institution's platform.
                </p>
              </div>

              {error && <div className="error-box">{error}</div>}

              {/* Form */}
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', fontWeight: 600, letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                    EMAIL
                  </label>
                  <input
                    className="dark-input"
                    name="email"
                    type="email"
                    placeholder="you@institution.edu.ph"
                    value={form.email}
                    onChange={handleChange}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', fontWeight: 600, letterSpacing: '0.05em' }}>
                      PASSWORD
                    </label>
                    {isModal ? (
                      <button type="button" onClick={() => onSwitch('reset')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.78rem', color: '#FF6B6B', fontWeight: 600 }}>
                        Forgot password?
                      </button>
                    ) : (
                      <Link to={ROUTES.RESET_PASSWORD} style={{ fontSize: '0.78rem', color: '#FF6B6B', fontWeight: 600, textDecoration: 'none' }}>
                        Forgot password?
                      </Link>
                    )}
                  </div>
                  <input
                    className="dark-input"
                    name="password"
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={handleChange}
                    required
                  />
                </div>

                <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '0.5rem' }}>
                  {loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'LOGIN'}
                </button>
              </form>

              {/* Divider */}
              <div className="divider-line">
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem', fontWeight: 600 }}>OR</span>
              </div>

              {/* Google */}
              <button className="btn-google" onClick={handleGoogleLogin}>
                <GoogleIcon />
                Continue with Google
              </button>

              {/* Sign Up */}
              <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', marginTop: '1.5rem', margin: '1.5rem 0 0' }}>
                Don't have an account?{' '}
                {isModal ? (
                  <button type="button" onClick={() => onSwitch('signup')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#FF6B6B', fontWeight: 700 }}>
                    Sign Up
                  </button>
                ) : (
                  <Link to={ROUTES.SIGN_UP} style={{ color: '#FF6B6B', fontWeight: 700, textDecoration: 'none' }}>
                    Sign Up
                  </Link>
                )}
              </p>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}