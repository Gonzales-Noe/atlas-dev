// src/pages/auth/SignUpPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CircularProgress from '@mui/material/CircularProgress';
import { useAuth } from '../../store/authStore';
import { ROUTES } from '../../config/route';
import { mountGoogleSignInButton } from '../../config/googleAuth';

import atlasLogo from '../../assets/atlas-logo.png';
import atlasMascot from '../../assets/atlas.png';

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

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="7" fill="rgba(192,57,43,0.25)" stroke="rgba(192,57,43,0.5)" strokeWidth="1" />
      <path d="M4 7l2 2 4-4" stroke="#FF6B6B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NAV_LINKS = [
  { label: 'HOME', to: '/' },
  { label: 'SIGN UP', to: '/signup' },
  { label: 'PRICING', to: '/pricing' },
  { label: 'CONTACT', to: '/contact' },
];

const PERKS = [
];

export default function SignUpPage({ isModal, onClose, onSwitch }) {
  const navigate = useNavigate();
  const { register, loginWithGoogle } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const [form, setForm] = useState({
    full_name: '', email: '', institution_name: '', password: '',
  });

  const googleButtonRef = useRef(null);
  const googleHandlersRef = useRef({});

  googleHandlersRef.current = {
    loginWithGoogle,
    navigate,
    setLoading,
    setError,
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (success) return undefined;

    let disposed = false;
    let cleanup = () => { };

    mountGoogleSignInButton(googleButtonRef.current, {
      context: 'signup',
      onCredential: async (credential) => {
        const h = googleHandlersRef.current;
        h.setError('');
        h.setLoading(true);
        try {
          const user = await h.loginWithGoogle(credential);
          h.navigate(user.dashboard_path || '/faculty/dashboard');
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
  }, [success]);

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
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
        }
        .auth-nav-link:hover { color: #fff; }
        .auth-nav-link.highlighted { color: #FF6B6B !important; }

        .dark-input {
          width: 100%;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          padding: 0.8rem 1rem;
          color: #F0F0F0;
          font-family: inherit;
          font-size: 0.9rem;
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

        .google-signin-slot {
          width: 100%;
        }
        .google-signin-slot > div {
          width: 100% !important;
          display: flex !important;
          justify-content: stretch !important;
        }

        .btn-secondary {
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
        .btn-secondary:hover {
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

        .success-box {
          background: rgba(30,100,30,0.15);
          border: 1px solid rgba(80,180,80,0.3);
          border-radius: 10px;
          padding: 0.9rem 1rem;
          color: #80FF80;
          font-size: 0.85rem;
          margin-bottom: 1.25rem;
          line-height: 1.6;
        }

        .form-enter {
          opacity: 0;
          transform: translateY(20px);
          animation: formEnter 0.5s ease forwards;
        }
        @keyframes formEnter {
          to { opacity: 1; transform: translateY(0); }
        }

        .email-form-enter {
          animation: formEnter 0.35s ease forwards;
        }

        .mascot-enter {
          opacity: 0;
          transform: translateX(-30px);
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
          margin: 1rem 0;
        }
        .divider-line::before, .divider-line::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.1);
        }

        .speech-bubble {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 20px;
          padding: 1rem 1.4rem;
          color: #F0F0F0;
          font-weight: 600;
          font-size: 0.92rem;
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

        .custom-checkbox {
          width: 16px;
          height: 16px;
          border: 1px solid rgba(192,57,43,0.5);
          border-radius: 4px;
          background: rgba(192,57,43,0.1);
          cursor: pointer;
          flex-shrink: 0;
          appearance: none;
          -webkit-appearance: none;
          position: relative;
          margin: 0;
        }
        .custom-checkbox:checked {
          background: #C0392B;
          border-color: #C0392B;
        }
        .custom-checkbox:checked::after {
          content: '✓';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: white;
          font-size: 10px;
          font-weight: 700;
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

        .label-text {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.4);
          font-weight: 600;
          letter-spacing: 0.05em;
          display: block;
          margin-bottom: 5px;
        }

        @media (max-width: 768px) {
          .desktop-nav-links { display: none !important; }
          .hamburger-btn { display: flex !important; }
          .split-layout { flex-direction: column !important; }
          .mascot-panel { display: none !important; }
        }
        @media (min-width: 769px) {
          .hamburger-btn { display: none !important; }
        }
      `}</style>

      {/* Background orbs */}
      <Orb style={{ width: 500, height: 500, background: 'rgba(139,0,0,0.14)', top: -100, left: -100 }} />
      <Orb style={{ width: 400, height: 400, background: 'rgba(100,0,0,0.12)', bottom: -80, right: -80 }} />

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
                <Link key={label} to={to} className={`auth-nav-link ${label === 'SIGN UP' ? 'highlighted' : ''}`}>{label}</Link>
              ))}
            </div>

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
              <Link key={label} to={to} className={`auth-nav-link ${label === 'SIGN UP' ? 'highlighted' : ''}`}
                style={{ fontSize: '0.95rem', padding: '0.4rem 0' }}
                onClick={() => setIsMenuOpen(false)}>
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
          style={{ width: '100%', maxWidth: 980, display: 'flex', overflow: 'hidden', transform: isModal ? 'scale(0.85)' : 'none' }}
        >
          {/* LEFT: Form Panel */}
          <div style={{ flex: 1, padding: '2.5rem 2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

            {success ? (
              <div className="form-enter" style={{ textAlign: 'center' }}>
                <img src={atlasLogo} alt="ATLAS Logo" style={{ height: 32, filter: 'brightness(0) saturate(100%) invert(26%) sepia(51%) saturate(2796%) hue-rotate(345deg) brightness(92%) contrast(92%)', marginBottom: '1.5rem' }} />
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
                <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 1rem' }}>
                  Application <span className="glow-text">Submitted!</span>
                </h1>
                <div className="success-box">
                  Your institution registration has been received. The ATLAS team will review and provide credentials within <strong>2–3 business days</strong>.
                </div>
                {isModal ? (
                  <button className="btn-secondary" onClick={() => onSwitch('signin')} style={{ width: '100%' }}>
                    Back to Sign In
                  </button>
                ) : (
                  <Link to={ROUTES.SIGN_IN} style={{ textDecoration: 'none' }}>
                    <button className="btn-secondary" style={{ width: '100%' }}>
                      Back to Sign In
                    </button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="form-enter">
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                  <img src={atlasLogo} alt="ATLAS Logo" style={{ height: 32, filter: 'brightness(0) saturate(100%) invert(26%) sepia(51%) saturate(2796%) hue-rotate(345deg) brightness(92%) contrast(92%)', marginBottom: '1.2rem' }} />
                  <h1 style={{ fontSize: '1.55rem', fontWeight: 800, margin: '0 0 0.4rem', letterSpacing: '-0.01em' }}>
                    Get <span className="glow-text">ATLAS</span> for Your Institution
                  </h1>
                  <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>
                    Faculty accounts only. Approved institutions receive credentials within 2–3 business days.
                  </p>
                </div>

                {error && <div className="error-box">{error}</div>}

                {/* Google — rectangular GIS button, width matched to Continue with Email */}
                <div
                  ref={googleButtonRef}
                  className="google-signin-slot"
                  style={{
                    width: '100%',
                    minHeight: 40,
                    marginBottom: '0.85rem',
                    display: 'flex',
                    justifyContent: 'stretch',
                    opacity: loading ? 0.6 : 1,
                    pointerEvents: loading ? 'none' : 'auto',
                  }}
                />

                <div className="divider-line">
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', fontWeight: 600 }}>OR</span>
                </div>

                {/* Progressive email form */}
                {!showEmailForm ? (
                  <button className="btn-primary" onClick={() => setShowEmailForm(true)}>
                    Continue with Email
                  </button>
                ) : (
                  <form onSubmit={handleEmailSignUp} className="email-form-enter" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <span className="label-text">FULL NAME</span>
                      <input className="dark-input" name="full_name" placeholder="Juan dela Cruz" value={form.full_name} onChange={handleChange} required />
                    </div>
                    <div>
                      <span className="label-text">INSTITUTION NAME</span>
                      <input className="dark-input" name="institution_name" placeholder="University of the Philippines" value={form.institution_name} onChange={handleChange} required />
                    </div>
                    <div>
                      <span className="label-text">INSTITUTIONAL EMAIL</span>
                      <input className="dark-input" name="email" type="email" placeholder="you@institution.edu.ph" value={form.email} onChange={handleChange} required />
                    </div>
                    <div>
                      <span className="label-text">PASSWORD</span>
                      <input className="dark-input" name="password" type="password" placeholder="••••••••" value={form.password} onChange={handleChange} required />
                    </div>
                    <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '0.25rem' }}>
                      {loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Submit Registration'}
                    </button>
                  </form>
                )}

                {/* Sign In + Terms */}
                <p style={{ textAlign: 'center', fontSize: '0.83rem', color: 'rgba(255,255,255,0.38)', margin: '1.25rem 0 0.75rem' }}>
                  Already have an account?{' '}
                  {isModal ? (
                    <button type="button" onClick={() => onSwitch('signin')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#FF6B6B', fontWeight: 700 }}>
                      Sign In
                    </button>
                  ) : (
                    <Link to={ROUTES.SIGN_IN} style={{ color: '#FF6B6B', fontWeight: 700, textDecoration: 'none' }}>Sign In</Link>
                  )}
                </p>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer', justifyContent: 'center' }}>
                  <input
                    type="checkbox"
                    className="custom-checkbox"
                    checked={agreed}
                    onChange={e => setAgreed(e.target.checked)}
                    style={{ marginTop: 1 }}
                  />
                  <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.5, textAlign: 'center' }}>
                    I agree to the{' '}
                    <span style={{ color: '#FF6B6B', fontWeight: 600 }}>Terms and Conditions of Use and Privacy Policy</span>
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* RIGHT: Mascot Panel */}
          <div
            className="mascot-panel"
            style={{
              width: '44%',
              background: 'linear-gradient(145deg, rgba(139,0,0,0.4), rgba(80,0,0,0.6))',
              borderLeft: '1px solid rgba(255,255,255,0.08)',
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
            <Orb style={{ width: 200, height: 200, background: 'rgba(100,0,0,0.3)', bottom: -40, left: -40 }} />

            <div className="mascot-enter" style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
              <div className="speech-bubble" style={{ display: 'inline-block', position: 'relative' }}>
                <span style={{ visibility: 'hidden', whiteSpace: 'nowrap' }}>Let's get your institution set up! 🏫</span>
                <span className="typing-text">Let's get your institution set up! 🏫</span>
              </div>

              <img
                src={atlasMascot}
                alt="ATLAS Mascot"
                style={{ width: '100%', maxWidth: 360, objectFit: 'contain', filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.5))' }}
              />

              {/* Perks list */}
              <div style={{ width: '100%', maxWidth: 260, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {PERKS.map((perk, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <CheckIcon />
                    <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 }}>{perk}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}