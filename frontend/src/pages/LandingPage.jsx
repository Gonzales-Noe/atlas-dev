import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store/authStore'
import atlasLogo from '../assets/atlas-logo.png'
import atlasHero from '../assets/atlas.png'
import delacion from '../assets/Delacion.png'
import esperida from '../assets/Esperida.png'
import gonzales from '../assets/Gonzales.jpg'
import { useEffect, useRef, useState } from 'react'

import SignInPage from './auth/signInPage'
import SignUpPage from './auth/signUpPage'
import PasswordResetPage from './auth/passwordReset'

// ── Scroll-triggered animation hook ─────────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true) },
      { threshold }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [threshold])
  return [ref, inView]
}

// ── Animated counter ─────────────────────────────────────────────────────────
function AnimatedNumber({ target, suffix = '', duration = 1800 }) {
  const [count, setCount] = useState(0)
  const [ref, inView] = useInView()
  useEffect(() => {
    if (!inView) return
    let start = 0
    const step = target / (duration / 16)
    const timer = setInterval(() => {
      start += step
      if (start >= target) { setCount(target); clearInterval(timer) }
      else setCount(Math.floor(start))
    }, 16)
    return () => clearInterval(timer)
  }, [inView, target, duration])
  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>
}

// ── Floating orb ─────────────────────────────────────────────────────────────
function Orb({ style }) {
  return (
    <div style={{
      position: 'absolute',
      borderRadius: '50%',
      filter: 'blur(80px)',
      pointerEvents: 'none',
      zIndex: 0,
      animation: 'orb-float 25s ease-in-out infinite',
      ...style,
    }} />
  )
}

// ── Glass card ───────────────────────────────────────────────────────────────
function GlassCard({ children, style, className = '' }) {
  return (
    <div
      className={`neon-border-glow ${className}`}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 20,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── Data ─────────────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: 'Starter',
    price: '₱2,499',
    period: '/month',
    tagline: 'For small departments getting started',
    color: 'rgba(139,0,0,0.25)',
    border: 'rgba(200,60,60,0.4)',
    glow: 'rgba(139,0,0,0.15)',
    features: [
      'Up to 10 faculty accounts',
      'Unlimited course creation',
      'OBE syllabus generator',
      'ILO-mapped assessments',
      'Assessment Generation',
      'Email support',
    ],
    cta: 'Get Started',
    popular: false,
  },
  {
    name: 'Professional',
    price: '₱6,999',
    period: '/month',
    tagline: 'For growing institutions',
    color: 'rgba(180,20,20,0.35)',
    border: 'rgba(255,80,80,0.6)',
    glow: 'rgba(200,0,0,0.25)',
    features: [
      'Up to 50 faculty accounts',
      'Everything in Starter',
      'Performance analytics dashboard',
      "Bloom's Taxonomy tagging",
      'Admin dashboard & reports',
      'Priority support',
      'Custom branding',
    ],
    cta: 'BUY NOW',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    tagline: 'For large universities',
    color: 'rgba(100,0,0,0.2)',
    border: 'rgba(255,120,120,0.3)',
    glow: 'rgba(139,0,0,0.1)',
    features: [
      'Unlimited faculty accounts',
      'Everything in Professional',
      'Dedicated onboarding',
      'API access',
      'SLA guarantee',
      'On-premise option',
      'Custom integrations',
    ],
    cta: 'Contact Sales',
    popular: false,
  },
]

const FEATURES = [
  {
    icon: '🎓',
    title: 'Set Up Your Course',
    desc: 'Input your course title, program outcomes, credit units, and intended students. ATLAS ingests and configures everything it needs to build around your specific course.',
    accent: 'rgba(139,0,0,0.3)',
  },
  {
    icon: '📋',
    title: 'Generate Your Syllabus & Modules',
    desc: 'In minutes, ATLAS produces a complete week-by-week, CHED OBE-compliant structure — all grounded in your course materials, not generic templates.',
    accent: 'rgba(180,20,20,0.3)',
  },
  {
    icon: '✅',
    title: 'Build Your Assessments',
    desc: "Generate ILO-mapped exams in multiple formats. Every item is tagged by Bloom's Taxonomy level and comes with an automated answer key or essay rubric.",
    accent: 'rgba(100,0,0,0.3)',
  },
  {
    icon: '📊',
    title: 'Performance Analytics',
    desc: 'The system computes weighted scores, identifies which learning outcomes your class is struggling with, and tells you exactly what to do next.',
    accent: 'rgba(160,10,10,0.3)',
  },
  {
    icon: '🏫',
    title: 'Admin Dashboard',
    desc: 'Provision faculty accounts, monitor institutional performance, and generate compliance reports — all from a unified dashboard built for academic leaders.',
    accent: 'rgba(120,0,0,0.3)',
  },
  {
    icon: '⚡',
    title: 'Instant Deployment',
    desc: 'No complex setup. Approved institutions receive credentials within 2–3 business days and can deploy faculty accounts on the same day.',
    accent: 'rgba(200,40,40,0.3)',
  },
]

const TESTIMONIALS = [
  {
    quote: "I used to spend entire weekends preparing for one course. With ATLAS, I had a complete, properly aligned syllabus ready in under 20 minutes. That time went back to my students.",
    author: 'Faculty Member',
    role: 'College of Education',
    stars: 5,
  },
  {
    quote: "The analytics dashboard showed me exactly which topics my class was failing on — by learning outcome, not just by score. I've never had that kind of clarity from any tool before.",
    author: 'Instructor',
    role: 'College of Arts and Sciences',
    stars: 5,
  },
  {
    quote: "Our department adopted ATLAS mid-semester. Provisioning our faculty was straightforward, and they were generating exams and syllabi on the same day. The onboarding friction was genuinely minimal.",
    author: 'College Head',
    role: 'College of Information',
    stars: 5,
  },
]

const TEAM = [
  { name: 'Hearty Isabel Delacion', title: 'Co-Founder | CEO', image: delacion },
  { name: 'Jasmin Esperida', title: 'Co-Founder | CCO', image: esperida },
  { name: 'Noe Gonzales', title: 'Co-Founder | CTO', image: gonzales },
]

const NAV_LINKS = [
  { label: 'HOME',    sectionId: 'home'    },
  { label: 'PRICING', sectionId: 'pricing' },
  { label: 'CONTACT', sectionId: 'contact' },
]

// Every page section in top-to-bottom order.
// Sections without a nav tab (features, testimonials, team) map to the
// nearest preceding nav anchor so the highlight advances naturally.
const ALL_SECTION_IDS = ['home', 'features', 'testimonials', 'pricing', 'team', 'contact']

const SECTION_TO_NAV = {
  home:         'home',
  features:     'home',      // between Home ↔ Pricing  → keep Home lit
  testimonials: 'home',      // same
  pricing:      'pricing',
  team:         'pricing',   // between Pricing ↔ Contact → keep Pricing lit
  contact:      'contact',
}

// ── useActiveSection ─────────────────────────────────────────────────────────
// Watches all page sections with IntersectionObserver and returns which nav
// tab should be highlighted.  Updates on every scroll — no click required.
function useActiveSection() {
  const [activeSection, setActiveSection] = useState('home')

  useEffect(() => {
    // Keep a live map of which sections are currently visible
    const visibilityMap = {}

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          visibilityMap[entry.target.id] = entry.isIntersecting
        })

        // Walk sections in page order; the topmost visible one wins
        const current = ALL_SECTION_IDS.find(id => visibilityMap[id])
        if (current) {
          setActiveSection(SECTION_TO_NAV[current] ?? current)
        }
      },
      {
        // Shrink the detection zone: fire when a section enters the
        // middle band of the viewport (top 20 % → bottom 30 % = 50 % band).
        rootMargin: '-10% 0px -55% 0px',
        threshold: 0,
      }
    )

    ALL_SECTION_IDS.forEach(id => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [])

  return [activeSection, setActiveSection]
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate  = useNavigate()
  const { isAuthenticated, user } = useAuth()
  const [scrolled, setScrolled]   = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [authModal, setAuthModal]   = useState(null)

  // Single source of truth for which nav tab is active.
  // Updated automatically by IntersectionObserver (scroll) AND manually
  // when the user clicks a nav link (instant feedback before scroll settles).
  const [activeSection, setActiveSection] = useActiveSection()

  // Navbar background on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function handleGetStarted() {
    if (isAuthenticated) {
      if (user?.role === 'superadmin') navigate('/superadmin/dashboard')
      else if (user?.role === 'admin')  navigate('/admin/dashboard')
      else navigate('/faculty/dashboard')
    } else {
      setAuthModal('signup')
    }
  }

  // Immediately highlight the clicked tab and then scroll smoothly.
  // The IntersectionObserver will take over once the page settles.
  function scrollTo(sectionId) {
    setActiveSection(SECTION_TO_NAV[sectionId] ?? sectionId) // instant highlight
    const el = document.getElementById(sectionId)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
    setMobileOpen(false)
  }

  const [featRef,         featInView]         = useInView()
  const [statsRef,        statsInView]        = useInView()
  const [testimonialsRef, testimonialsInView] = useInView()
  const [teamRef,         teamInView]         = useInView()
  const [pricingRef,      pricingInView]      = useInView()

  return (
    <div style={{
      minHeight:   '100vh',
      background:  '#0A0A0B',
      color:       '#F0F0F0',
      fontFamily:  '"Plus Jakarta Sans", "Inter", sans-serif',
      overflowX:   'hidden',
    }}>

      {/* ── GLOBAL STYLES ─────────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Serif+Display&display=swap');

        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }

        .atlas-btn-primary {
          background: linear-gradient(135deg, #8B0000, #C0392B);
          color: #fff; border: none; border-radius: 12px;
          font-family: inherit; font-weight: 700; cursor: pointer;
          transition: all 0.25s ease; letter-spacing: 0.02em;
        }
        .atlas-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(139,0,0,0.5);
          background: linear-gradient(135deg, #A00000, #E04428);
        }
        .atlas-btn-outline {
          background: transparent; color: #F0F0F0;
          border: 1px solid rgba(255,255,255,0.2); border-radius: 12px;
          font-family: inherit; font-weight: 600; cursor: pointer;
          transition: all 0.25s ease;
        }
        .atlas-btn-outline:hover {
          border-color: rgba(255,255,255,0.5);
          background: rgba(255,255,255,0.07);
        }

        /* ── Nav link ── */
        .nav-link {
          color: rgba(255,255,255,0.55);
          text-decoration: none;
          font-size: 0.82rem; font-weight: 600;
          letter-spacing: 0.08em;
          cursor: pointer; background: none; border: none;
          border-bottom: 2px solid transparent;
          font-family: inherit; padding: 4px 0;
          position: relative;
          transition: color 0.2s, border-color 0.2s;
        }
        .nav-link:hover { color: #fff; }

        /* Active state */
        .nav-link.active {
          color: #fff;
          border-bottom: 2px solid #C0392B;
        }

        /* Hover underline (non-active only) */
        .nav-link:not(.active)::after {
          content: '';
          position: absolute; left: 0; bottom: -2px;
          width: 0; height: 2px;
          background: rgba(192,57,43,0.5); border-radius: 2px;
          transition: width 0.25s ease;
        }
        .nav-link:not(.active):hover::after { width: 100%; }

        .feature-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px; padding: 2rem;
          transition: all 0.35s ease;
          position: relative; overflow: hidden;
        }
        .feature-card::before {
          content: ''; position: absolute; inset: 0; border-radius: 20px;
          opacity: 0; transition: opacity 0.35s ease;
          background: linear-gradient(135deg, rgba(139,0,0,0.12), transparent);
        }
        .feature-card:hover {
          border-color: rgba(192,57,43,0.4);
          transform: translateY(-4px);
          box-shadow: 0 20px 60px rgba(139,0,0,0.15);
        }
        .feature-card:hover::before { opacity: 1; }

        .testimonial-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 20px; padding: 2rem;
          transition: all 0.3s ease;
        }
        .testimonial-card:hover {
          border-color: rgba(192,57,43,0.35);
          background: rgba(139,0,0,0.08);
          transform: translateY(-3px);
        }

        .pricing-card {
          background: rgba(255,255,255,0.03);
          border-radius: 24px; padding: 2.5rem;
          transition: all 0.35s ease; position: relative;
        }
        .pricing-card:hover { transform: translateY(-6px); }
        .pricing-card.popular { background: rgba(139,0,0,0.15); }

        .team-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px; padding: 1.5rem 1.5rem 2rem;
          text-align: center; transition: all 0.3s ease;
        }
        .team-card:hover {
          border-color: rgba(192,57,43,0.4);
          background: rgba(139,0,0,0.08);
          transform: translateY(-4px);
        }

        .fade-up {
          opacity: 0; transform: translateY(32px);
          transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .fade-up.visible { opacity: 1; transform: translateY(0); }
        .fade-up:nth-child(1) { transition-delay: 0s; }
        .fade-up:nth-child(2) { transition-delay: 0.1s; }
        .fade-up:nth-child(3) { transition-delay: 0.2s; }
        .fade-up:nth-child(4) { transition-delay: 0.3s; }
        .fade-up:nth-child(5) { transition-delay: 0.4s; }
        .fade-up:nth-child(6) { transition-delay: 0.5s; }

        .glow-text {
          background: linear-gradient(135deg, #FF6B6B, #FF4444, #CC0000);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .stat-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; padding: 1.5rem;
          text-align: center; transition: all 0.3s ease;
        }
        .stat-card:hover {
          border-color: rgba(192,57,43,0.4);
          background: rgba(139,0,0,0.08);
        }

        .check-icon::before {
          content: '✓'; display: inline-block;
          width: 20px; height: 20px;
          background: rgba(192,57,43,0.2);
          border: 1px solid rgba(192,57,43,0.4);
          border-radius: 50%; font-size: 11px;
          line-height: 20px; text-align: center;
          color: #FF6B6B; margin-right: 10px; flex-shrink: 0;
        }

        .mobile-menu {
          display: none; position: fixed;
          top: 72px; left: 0; right: 0;
          background: rgba(10,10,11,0.97);
          border-bottom: 1px solid rgba(255,255,255,0.1);
          backdrop-filter: blur(20px);
          z-index: 999; padding: 1.5rem;
          flex-direction: column; gap: 1rem;
        }
        .mobile-menu.open { display: flex; }

        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .hamburger { display: flex !important; }
          .hero-title { font-size: clamp(1.8rem, 8vw, 2.8rem) !important; }
          .hero-subtitle { font-size: 1.05rem !important; }
          .section-title { font-size: 2rem !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .pricing-grid { grid-template-columns: 1fr !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .testimonials-grid { grid-template-columns: 1fr !important; }
          .team-grid { grid-template-columns: 1fr !important; }
          .hero-container { flex-direction: column; text-align: center; gap: 2.5rem; }
          .hero-text-content { display: flex; flex-direction: column; align-items: center; }
          .hero-title, .hero-subtitle { text-align: center !important; }
          .hero-cta-group, .stats-chips { justify-content: center !important; }
        }
        @media (min-width: 769px) {
          .hamburger { display: none !important; }
          .hero-container {
            display: flex; align-items: center;
            justify-content: space-between; gap: 4rem; text-align: left;
          }
          .hero-text-content { flex: 1.2; min-width: 0; }
          .hero-image-content {
            flex: 1; display: flex; justify-content: flex-end;
            position: relative; z-index: 2;
          }
        }

        .hero-badge {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(192,57,43,0.15);
          border: 1px solid rgba(192,57,43,0.35);
          border-radius: 100px; padding: 6px 16px;
          font-size: 0.78rem; font-weight: 600;
          color: #FF8080; letter-spacing: 0.05em;
          margin-bottom: 1.5rem;
          animation: badge-pulse 2.5s ease-in-out infinite;
        }
        @keyframes badge-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(192,57,43,0.25); }
          50%       { box-shadow: 0 0 0 8px rgba(192,57,43,0); }
        }

        .hero-cta-group {
          display: flex; gap: 1rem;
          justify-content: flex-start; flex-wrap: wrap; margin-top: 2.5rem;
        }

        .scroll-indicator {
          position: absolute; bottom: 2rem; left: 50%;
          transform: translateX(-50%);
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          opacity: 0.4; animation: bounce 2s ease-in-out infinite;
        }
        @keyframes bounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50%       { transform: translateX(-50%) translateY(8px); }
        }

        .popular-badge {
          position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
          background: linear-gradient(135deg, #8B0000, #C0392B);
          color: white; font-size: 0.72rem; font-weight: 700;
          letter-spacing: 0.08em; padding: 5px 18px;
          border-radius: 100px; white-space: nowrap;
        }

        .contact-input {
          width: 100%; background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.12); border-radius: 12px;
          padding: 0.9rem 1.2rem; color: #F0F0F0;
          font-family: inherit; font-size: 0.95rem;
          outline: none; transition: border-color 0.2s;
          margin-bottom: 1rem; resize: none;
        }
        .contact-input:focus { border-color: rgba(192,57,43,0.6); }
        .contact-input::placeholder { color: rgba(255,255,255,0.3); }

        .divider {
          width: 60px; height: 3px;
          background: linear-gradient(90deg, #8B0000, #C0392B);
          border-radius: 3px; margin: 1rem auto 0;
        }

        .neon-border-glow { position: relative; }
        .neon-border-glow::after {
          content: ''; position: absolute; inset: 0;
          border-radius: inherit; padding: 2px;
          background: linear-gradient(
            90deg,
            rgba(255,107,107,0) 0%, rgba(255,107,107,0.8) 12.5%,
            rgba(139,0,0,0.8) 25%, rgba(255,107,107,0) 50%,
            rgba(255,107,107,0.8) 62.5%, rgba(139,0,0,0.8) 75%,
            rgba(255,107,107,0) 100%
          );
          background-size: 200% 100%;
          animation: neon-pan 4s linear infinite;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          pointer-events: none;
        }
        @keyframes neon-pan {
          0%   { background-position: 100% 0; }
          100% { background-position: 0 0; }
        }

        .subtle-neon-glow { position: relative; }
        .subtle-neon-glow::after {
          content: ''; position: absolute; inset: 0;
          border-radius: inherit; padding: 1px;
          background: linear-gradient(
            90deg,
            rgba(255,107,107,0) 0%, rgba(255,107,107,0.5) 12.5%,
            rgba(139,0,0,0.5) 25%, rgba(255,107,107,0) 50%,
            rgba(255,107,107,0.5) 62.5%, rgba(139,0,0,0.5) 75%,
            rgba(255,107,107,0) 100%
          );
          background-size: 200% 100%;
          animation: neon-pan 4s linear infinite;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          pointer-events: none;
        }

        @keyframes orb-float {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33%       { transform: translate(40px, -60px) scale(1.1); }
          66%       { transform: translate(-30px, 30px) scale(0.9); }
        }
      `}</style>

      {/* ── NAVBAR ──────────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        transition: 'all 0.35s ease',
        background:    scrolled ? 'rgba(10,10,11,0.92)' : 'transparent',
        borderBottom:  scrolled ? '1px solid rgba(255,255,255,0.08)' : 'none',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          padding: '0 2rem', height: 72,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* Logo */}
          <button onClick={() => scrollTo('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <img src={atlasLogo} alt="ATLAS Logo" style={{ height: 32, objectFit: 'contain', filter: 'brightness(0) saturate(100%) invert(26%) sepia(51%) saturate(2796%) hue-rotate(345deg) brightness(92%) contrast(92%)' }} />
          </button>

          {/* Desktop nav links */}
          <div className="desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
            {NAV_LINKS.map(({ label, sectionId }) => (
              <button
                key={label}
                className={`nav-link${activeSection === sectionId ? ' active' : ''}`}
                onClick={() => scrollTo(sectionId)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Auth buttons */}
          <div className="desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {isAuthenticated ? (
              <button className="atlas-btn-primary" onClick={handleGetStarted} style={{ padding: '0.6rem 1.4rem', fontSize: '0.88rem' }}>
                Dashboard
              </button>
            ) : (
              <>
                <button className="atlas-btn-outline" onClick={() => setAuthModal('signin')} style={{ padding: '0.55rem 1.2rem', fontSize: '0.85rem' }}>SIGN IN</button>
                <button className="atlas-btn-primary" onClick={() => setAuthModal('signup')} style={{ padding: '0.6rem 1.4rem', fontSize: '0.88rem' }}>SIGN UP</button>
              </>
            )}
          </div>

          {/* Hamburger */}
          <button
            className="hamburger"
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', flexDirection: 'column', gap: 5 }}
          >
            {[0,1,2].map(i => (
              <span key={i} style={{
                display: 'block', width: 24, height: 2,
                background: '#fff', borderRadius: 2, transition: 'all 0.3s ease',
                transform: mobileOpen
                  ? i === 0 ? 'rotate(45deg) translate(5px,5px)'
                  : i === 1 ? 'scaleX(0)'
                  : 'rotate(-45deg) translate(5px,-5px)'
                  : 'none',
              }} />
            ))}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <div className={`mobile-menu ${mobileOpen ? 'open' : ''}`}>
        {NAV_LINKS.map(({ label, sectionId }) => (
          <button
            key={label}
            className={`nav-link${activeSection === sectionId ? ' active' : ''}`}
            style={{ fontSize: '1rem', padding: '0.5rem 0' }}
            onClick={() => scrollTo(sectionId)}
          >
            {label}
          </button>
        ))}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button className="atlas-btn-outline" onClick={() => { setAuthModal('signin'); setMobileOpen(false) }} style={{ flex: 1, padding: '0.7rem', fontSize: '0.9rem' }}>SIGN IN</button>
          <button className="atlas-btn-primary" onClick={() => { setAuthModal('signup'); setMobileOpen(false) }} style={{ flex: 1, padding: '0.7rem', fontSize: '0.9rem' }}>SIGN UP</button>
        </div>
      </div>

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section id="home" style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingTop: 72 }}>
        <Orb style={{ width: 600, height: 600, background: 'rgba(139,0,0,0.18)', top: -100, left: -150 }} />
        <Orb style={{ width: 500, height: 500, background: 'rgba(180,20,20,0.12)', bottom: -100, right: -100 }} />
        <Orb style={{ width: 300, height: 300, background: 'rgba(100,0,0,0.2)', top: '40%', left: '60%' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)`, backgroundSize: '60px 60px', zIndex: 0 }} />

        <div className="hero-container" style={{ position: 'relative', zIndex: 1, padding: '2rem', maxWidth: 1200, margin: '0 auto', marginTop: '-4rem' }}>
          <div className="hero-text-content">
            <div className="hero-badge" style={{ margin: '0 0 1.5rem' }}>
              <span style={{ width: 6, height: 6, background: '#FF6B6B', borderRadius: '50%', display: 'inline-block' }} />
              NOW AVAILABLE FOR PHILIPPINE HIGHER EDUCATION
            </div>
            <h1 className="hero-title" style={{ fontSize: 'clamp(2.8rem, 4.5vw, 4rem)', fontWeight: 800, lineHeight: 1.1, maxWidth: 1000, letterSpacing: '-0.02em', margin: '0 0 1.2rem', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              <span style={{ whiteSpace: 'nowrap' }}>Bring the Passion.</span><br />
              <span className="glow-text" style={{ whiteSpace: 'nowrap' }}>We'll Bring the Platform.</span>
            </h1>
            <p className="hero-subtitle" style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, margin: '0 0 2rem', maxWidth: '100%' }}>
              The AI-powered OBE platform built for Philippine Higher Education —
              syllabus generation, assessment building, grading, and performance analytics in one place.
            </p>
            <div className="hero-cta-group">
              <button className="atlas-btn-primary subtle-neon-glow" onClick={handleGetStarted} style={{ padding: '0.9rem 2.5rem', fontSize: '1rem' }}>Join ATLAS Now!</button>
              <button className="atlas-btn-outline" onClick={() => scrollTo('features')} style={{ padding: '0.9rem 2rem', fontSize: '1rem' }}>See How It Works ↓</button>
            </div>
            <div className="stats-chips" style={{ display: 'flex', gap: '.5rem', marginTop: '3rem', flexWrap: 'nowrap' }}>
              {[
                { label: 'CHED OBE-Compliant', icon: '✓' },
                { label: "Bloom's Taxonomy Tagged", icon: '✓' },
                { label: 'Assessment Generation', icon: '✓' },
              ].map(({ label, icon }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 100, padding: '7px 9px', fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#FF6B6B' }}>{icon}</span>{label}
                </div>
              ))}
            </div>
          </div>
          <div className="hero-image-content">
            <img src={atlasHero} alt="ATLAS Platform Character" style={{ width: '100%', maxWidth: 580, display: 'block', filter: 'drop-shadow(0 20px 40px rgba(139,0,0,0.25))', transform: 'translateX(60px)' }} />
          </div>
        </div>

        <div className="scroll-indicator">
          <span style={{ fontSize: '0.7rem', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)' }}>SCROLL</span>
          <div style={{ width: 1, height: 40, background: 'linear-gradient(to bottom, rgba(255,255,255,0.3), transparent)' }} />
        </div>
      </section>

      {/* ── STATS ───────────────────────────────────────────────────────────── */}
      <section ref={statsRef} style={{ padding: '4rem 2rem', background: 'rgba(139,0,0,0.06)', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
            {[
              { value: 20,  suffix: 'min',  label: 'Syllabus ready in',      prefix: '<' },
              { value: 95,  suffix: '%',    label: 'Faculty satisfaction rate' },
              { value: 500, suffix: '+',    label: 'Courses generated' },
              { value: 3,   suffix: ' days', label: 'From signup to live' },
            ].map(({ value, suffix, label, prefix }, i) => (
              <div key={i} className={`stat-card fade-up subtle-neon-glow ${statsInView ? 'visible' : ''}`}>
                <div style={{ fontSize: '2.4rem', fontWeight: 800, color: '#FF6B6B', lineHeight: 1 }}>
                  {prefix || ''}{statsInView && <AnimatedNumber target={value} suffix={suffix} />}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginTop: '0.5rem' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────────── */}
      <section id="features" style={{ padding: '7rem 2rem', position: 'relative', overflow: 'hidden' }}>
        <Orb style={{ width: 500, height: 500, background: 'rgba(139,0,0,0.1)', top: '10%', right: -150 }} />
        <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ color: '#FF6B6B', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '0.75rem' }}>CAPABILITIES</p>
            <h2 className="section-title" style={{ fontSize: '2.6rem', fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
              Everything Your Course Needs <br /><span className="glow-text">to Teach Smarter</span>
            </h2>
            <div className="divider" />
          </div>
          <div ref={featRef} className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
            {FEATURES.map((f, i) => (
              <div key={i} className={`feature-card fade-up neon-border-glow ${featInView ? 'visible' : ''}`}>
                <div style={{ width: 52, height: 52, background: f.accent, border: '1px solid rgba(192,57,43,0.25)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', marginBottom: '1.2rem' }}>{f.icon}</div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.75rem', color: '#F0F0F0' }}>{f.title}</h3>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.9rem', lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ────────────────────────────────────────────────────── */}
      <section id="testimonials" style={{ padding: '7rem 2rem', background: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ color: '#FF6B6B', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '0.75rem' }}>SOCIAL PROOF</p>
            <h2 className="section-title" style={{ fontSize: '2.6rem', fontWeight: 800, margin: 0 }}>What Educators Are Saying</h2>
            <div className="divider" />
          </div>
          <div ref={testimonialsRef} className="testimonials-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className={`testimonial-card fade-up neon-border-glow ${testimonialsInView ? 'visible' : ''}`}>
                <div style={{ color: '#FF4444', fontSize: '1rem', marginBottom: '1rem', letterSpacing: 2 }}>{'★'.repeat(t.stars)}</div>
                <p style={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.75, fontSize: '0.92rem', fontStyle: 'italic', margin: '0 0 1.5rem' }}>"{t.quote}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(192,57,43,0.25)', border: '1px solid rgba(192,57,43,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', color: '#FF8080', fontWeight: 700 }}>{t.author[0]}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#F0F0F0' }}>{t.author}</div>
                    <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ padding: '7rem 2rem', position: 'relative', overflow: 'hidden' }}>
        <Orb style={{ width: 600, height: 600, background: 'rgba(139,0,0,0.12)', bottom: -200, left: -150 }} />
        <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ color: '#FF6B6B', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '0.75rem' }}>PRICING</p>
            <h2 className="section-title" style={{ fontSize: '2.6rem', fontWeight: 800, margin: 0 }}>Simple, Institutional Pricing</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: '0.75rem', fontSize: '0.95rem' }}>Billed per institution. Faculty access included.</p>
            <div className="divider" />
          </div>
          <div ref={pricingRef} className="pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', alignItems: 'center' }}>
            {PLANS.map((plan, i) => (
              <div key={i} className={`pricing-card fade-up neon-border-glow ${pricingInView ? 'visible' : ''} ${plan.popular ? 'popular' : ''}`} style={{ border: `1px solid ${plan.border}`, background: plan.color, boxShadow: plan.popular ? `0 0 60px ${plan.glow}` : 'none', transform: plan.popular ? 'scale(1.04)' : 'scale(1)' }}>
                {plan.popular && <div className="popular-badge">✦ MOST POPULAR</div>}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#FF8080', margin: '0 0 0.4rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{plan.name}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem', margin: '0 0 1.2rem' }}>{plan.tagline}</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: '2.8rem', fontWeight: 800, color: '#F0F0F0', lineHeight: 1 }}>{plan.price}</span>
                    {plan.period && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>{plan.period}</span>}
                  </div>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.5rem', marginBottom: '2rem' }}>
                  {plan.features.map((feat, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
                      <span className="check-icon" />
                      <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.88rem', lineHeight: 1.5 }}>{feat}</span>
                    </div>
                  ))}
                </div>
                <button className={plan.popular ? 'atlas-btn-primary' : 'atlas-btn-outline'} onClick={() => plan.price === 'Custom' ? scrollTo('contact') : setAuthModal('signup')} style={{ width: '100%', padding: '0.85rem', fontSize: '0.92rem', fontWeight: 700 }}>{plan.cta}</button>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', marginTop: '2.5rem' }}>
            All plans include faculty access · No setup fees · Cancel anytime
          </p>
        </div>
      </section>

      {/* ── TEAM ────────────────────────────────────────────────────────────── */}
      <section id="team" style={{ padding: '7rem 2rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ color: '#FF6B6B', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '0.75rem' }}>THE TEAM</p>
            <h2 className="section-title" style={{ fontSize: '2.6rem', fontWeight: 800, margin: 0 }}>Built by Students.<br />Made for Teachers.</h2>
            <div className="divider" />
          </div>
          <div ref={teamRef} className="team-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', maxWidth: 900, margin: '0 auto' }}>
            {TEAM.map((member, i) => (
              <div key={i} className={`team-card fade-up subtle-neon-glow ${teamInView ? 'visible' : ''}`}>
                <div style={{ width: '100%', height: 280, borderRadius: 16, background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', overflow: 'hidden' }}>
                  <img src={member.image} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
                </div>
                <h3 style={{ fontWeight: 700, fontSize: '1.2rem', margin: '0 0 0.4rem', color: '#F0F0F0' }}>{member.name}</h3>
                <p style={{ color: '#FF6B6B', fontSize: '0.9rem', margin: 0, fontWeight: 600, letterSpacing: '0.04em' }}>{member.title}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTACT ─────────────────────────────────────────────────────────── */}
      <section id="contact" style={{ padding: '7rem 2rem', background: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
        <Orb style={{ width: 500, height: 500, background: 'rgba(139,0,0,0.15)', top: -100, right: -100 }} />
        <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5rem', alignItems: 'center' }}>
            <div>
              <p style={{ color: '#FF6B6B', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '0.75rem' }}>GET IN TOUCH</p>
              <h2 style={{ fontSize: '2.4rem', fontWeight: 800, margin: '0 0 1.2rem', lineHeight: 1.2 }}>
                Ready to Transform<br /><span className="glow-text">Your Institution?</span>
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.8, fontSize: '0.95rem', marginBottom: '2rem' }}>
                Get in touch with our team to learn how ATLAS can help your institution meet CHED OBE requirements while cutting faculty workload in half.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {[
                  { icon: '📧', label: 'Email',         value: 'atlasdegdev@gmail.com' },
                  { icon: '📍', label: 'Location',      value: 'Lipa City, Batangas, Philippines' },
                  { icon: '⏱️', label: 'Response Time', value: 'Within 24 hours' },
                ].map(({ icon, label, value }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(192,57,43,0.15)', border: '1px solid rgba(192,57,43,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>{icon}</div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: '0.92rem', color: '#F0F0F0' }}>{value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <GlassCard style={{ padding: '2.5rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 1.5rem', color: '#F0F0F0' }}>Send us a message</h3>
              <input className="contact-input" placeholder="Your Name" />
              <input className="contact-input" type="email" placeholder="Institutional Email" />
              <input className="contact-input" placeholder="Institution Name" />
              <textarea className="contact-input" rows={4} placeholder="How can we help?" />
              <button className="atlas-btn-primary" style={{ width: '100%', padding: '0.9rem', fontSize: '0.95rem' }}>Send Message</button>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '2.5rem 2rem', background: '#060607' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img src={atlasLogo} alt="ATLAS" style={{ height: 24, filter: 'brightness(0) saturate(100%) invert(26%) sepia(51%) saturate(2796%) hue-rotate(345deg) brightness(92%) contrast(92%)' }} />
            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.82rem' }}>© 2026 ATLAS. All rights reserved.</span>
          </div>
          <div style={{ display: 'flex', gap: '2rem' }}>
            {['Privacy Policy', 'Terms and Conditions', 'Contact'].map(label => (
              <span key={label} style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.82rem', cursor: 'pointer', transition: 'color 0.2s' }}
                onMouseEnter={e => e.target.style.color = 'rgba(255,255,255,0.7)'}
                onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.3)'}
              >{label}</span>
            ))}
          </div>
        </div>
      </footer>

      {/* ── AUTH MODALS ─────────────────────────────────────────────────────── */}
      {authModal === 'signin' && <SignInPage isModal onClose={() => setAuthModal(null)} onSwitch={setAuthModal} />}
      {authModal === 'signup' && <SignUpPage isModal onClose={() => setAuthModal(null)} onSwitch={setAuthModal} />}
      {authModal === 'reset'  && <PasswordResetPage isModal onClose={() => setAuthModal(null)} onSwitch={setAuthModal} />}
    </div>
  )
}