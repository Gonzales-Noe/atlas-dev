// src/pages/auth/SignInPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import CircularProgress from '@mui/material/CircularProgress';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../store/authStore';
import useRoleRedirect from '../../hooks/useRoleRedirect';
import { ROUTES } from '../../config/route';
import { mountGoogleSignInButton } from '../../config/googleAuth';

import atlasLogo from '../../assets/atlas-logo.webp';
import atlasMascot from '../../assets/atlas.webp';

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

const NAV_LINKS = [
  { label: 'HOME', to: '/' },
  { label: 'SIGN UP', to: '/signup' },
  { label: 'PACKAGES', to: '/pricing' },
  { label: 'CONTACT', to: '/contact' },
];

export default function SignInPage({ isModal, onClose, onSwitch }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginWithGoogle } = useAuth();
  const { redirectToDashboard } = useRoleRedirect();

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const googleButtonRef = useRef(null);
  const googleHandlersRef = useRef({});

  const from = location.state?.from?.pathname;

  googleHandlersRef.current = {
    loginWithGoogle,
    from,
    navigate,
    redirectToDashboard,
    setLoading,
    setError,
  };

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => { };

    mountGoogleSignInButton(googleButtonRef.current, {
      context: 'signin',
      onCredential: async (credential) => {
        const h = googleHandlersRef.current;
        h.setError('');
        h.setLoading(true);
        try {
          const user = await h.loginWithGoogle(credential);
          if (h.from) h.navigate(h.from, { replace: true });
          else h.redirectToDashboard(user.role);
        } catch (err) {
          h.setError(err.message || 'Google sign-in failed.');
        } finally {
          h.setLoading(false);
        }
      },
      onError: (err) => {
        googleHandlersRef.current.setError(err.message || 'Google sign-in failed.');
      },
    }).then((dispose) => {
      if (disposed) dispose();
      else cleanup = dispose;
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const email = form.email.trim();
    const password = form.password.trim();

    if (!email || !password) { setError('Please enter your email and password.'); return; }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      setError('Please enter a valid institutional email address.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    try {
      const user = await login(email, password);
      if (from) navigate(from, { replace: true });
      else redirectToDashboard(user.role);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
        .auth-nav-link.active { color: #86EFAC; }

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
          border-color: rgba(22,163,74,0.7);
          background: rgba(255,255,255,0.09);
        }
        .dark-input::placeholder { color: rgba(255,255,255,0.28); }

        .password-input-wrap { position: relative; }
        .password-input-wrap .dark-input { padding-right: 3rem; }
        .password-toggle {
          position: absolute;
          top: 50%;
          right: 0.9rem;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.25rem;
          color: rgba(255,255,255,0.55);
          background: none;
          border: 0;
          cursor: pointer;
        }
        .password-toggle:hover { color: #fff; }
        .password-toggle:focus-visible { outline: 2px solid #FF6B6B; outline-offset: 2px; }

        .btn-primary {
          width: 100%;
          background: linear-gradient(135deg, #15803D, #16A34A);
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
          box-shadow: 0 8px 28px rgba(21,128,61,0.5);
          background: linear-gradient(135deg, #14532D, #16A34A);
        }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

        .google-signin-slot {
          width: 100%;
          display: flex;
          justify-content: center;
        }
        .google-signin-slot > div {
          margin: 0 auto;
        }

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
          background: rgba(22,163,74,0.15);
          border: 1px solid rgba(22,163,74,0.35);
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
          background: linear-gradient(135deg, #86EFAC, #BBF7D0, #16A34A);
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
            rgba(134, 239, 172, 0) 0%,
            rgba(134, 239, 172, 0.5) 12.5%,
            rgba(21, 128, 61, 0.5) 25%,
            rgba(134, 239, 172, 0) 50%,
            rgba(134, 239, 172, 0.5) 62.5%,
            rgba(21, 128, 61, 0.5) 75%,
            rgba(134, 239, 172, 0) 100%
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
      <Orb style={{ width: 500, height: 500, background: 'rgba(21,128,61,0.15)', top: -120, right: -100 }} />
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
              <img src={atlasLogo} alt="ATLAS Logo" style={{ height: 28, objectFit: 'contain' }} />
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
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  display: 'block', width: 22, height: 2,
                  background: '#fff', borderRadius: 2,
                  transition: 'all 0.3s ease',
                  transform: isMenuOpen
                    ? i === 0 ? 'rotate(45deg) translate(5px,5px)'
                      : i === 1 ? 'scaleX(0)'
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
              background: 'linear-gradient(145deg, rgba(21,128,61,0.4), rgba(134, 239, 172, 0))',
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
            <Orb style={{ width: 300, height: 300, background: 'rgba(21, 128, 61, 0.8)', top: -60, left: -60 }} />
            <Orb style={{ width: 200, height: 200, background: 'rgba(134, 239, 172, 0)', bottom: -40, right: -40 }} />

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
                <img src={atlasLogo} alt="ATLAS Logo" style={{ height: 34, objectFit: 'contain', marginBottom: '1.2rem' }} />
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
                      <button type="button" onClick={() => onSwitch('reset')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.78rem', color: '#86EFAC', fontWeight: 600 }}>
                        Forgot password?
                      </button>
                    ) : (
                      <Link to={ROUTES.RESET_PASSWORD} style={{ fontSize: '0.78rem', color: '#86EFAC', fontWeight: 600, textDecoration: 'none' }}>
                        Forgot password?
                      </Link>
                    )}
                  </div>
                  <div className="password-input-wrap">
                    <input
                      className="dark-input"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={handleChange}
                      required
                    />
                    <button
                      className="password-toggle"
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword(show => !show)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '0.5rem' }}>
                  {loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'LOGIN'}
                </button>
              </form>

              {/* Divider */}
              <div className="divider-line">
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem', fontWeight: 600 }}>OR</span>
              </div>

              {/* Google — rectangular GIS button, centered */}
              <div
                ref={googleButtonRef}
                className="google-signin-slot"
                style={{
                  width: '100%',
                  minHeight: 40,
                  display: 'flex',
                  justifyContent: 'center',
                  opacity: loading ? 0.6 : 1,
                  pointerEvents: loading ? 'none' : 'auto',
                }}
              />

              {/* Sign Up */}
              <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', marginTop: '1.5rem', margin: '1.5rem 0 0' }}>
                Don't have an account?{' '}
                {isModal ? (
                  <button type="button" onClick={() => onSwitch('signup')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#86EFAC', fontWeight: 700 }}>
                    Sign Up
                  </button>
                ) : (
                  <Link to={ROUTES.SIGN_UP} style={{ color: '#86EFAC', fontWeight: 700, textDecoration: 'none' }}>
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