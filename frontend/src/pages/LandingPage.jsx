import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../store/authStore'
import api from '../config/api'
import atlasLogo from '../assets/atlas-logo.webp'
import atlasHero from '../assets/atlas.webp'
import delacion from '../assets/Delacion.webp'
import esperida from '../assets/Esperida.webp'
import gonzales from '../assets/Gonzales.webp'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  BarChart3,
  Check,
  ClipboardList,
  Clock,
  FileCheck,
  GraduationCap,
  LayoutDashboard,
  Mail,
  MapPin,
  Server,
  Star,
} from 'lucide-react'

import InstallAppButton from '../components/InstallAppButton'

const SignInPage = lazy(() => import('./auth/signInPage'))
const SignUpPage = lazy(() => import('./auth/signUpPage'))
const PasswordResetPage = lazy(() => import('./auth/passwordReset'))

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

// ── Institutional packages ───────────────────────────────────────────────────
const PACKAGES = [
  {
    name: 'Starter',
    tagline: 'A private server and database to begin.',
    color: 'rgba(21,128,61,0.25)',
    border: 'rgba(22,163,74,0.4)',
    glow: 'rgba(21,128,61,0.15)',
    features: [
      'Syllabus, modules, and assessments',
      'OMR scanning',
      'Course analytics',
      'Backups and business-day support',
    ],
    featured: false,
  },
  {
    name: 'Professional',
    tagline: 'A larger private deployment for the whole institution.',
    color: 'rgba(21,128,61,0.35)',
    border: 'rgba(134,239,172,0.6)',
    glow: 'rgba(22,163,74,0.25)',
    badge: 'Recommended',
    features: [
      'A larger private server and database',
      'Web and Mobile for the whole institution',
      'Analytics across programs',
      'Exam-week scanning and priority support',
    ],
    featured: true,
  },
  {
    name: 'Custom',
    tagline: 'Capacity that grows as you do.',
    color: 'rgba(20,83,45,0.2)',
    border: 'rgba(134,239,172,0.3)',
    glow: 'rgba(21,128,61,0.1)',
    features: [
      'Servers and databases added as you grow',
      'More faculty, more sites, same privacy',
      'Reports across sites, data kept separate',
      'Support and updates matched to your calendar',
    ],
    featured: false,
  },
]

const FEATURES = [
  {
    icon: GraduationCap,
    title: 'Set Up Your Course',
    desc: 'Input your course title, program outcomes, credit units, and intended students. ATLAS ingests and configures everything it needs to build around your specific course.',
    accent: 'rgba(21,128,61,0.3)',
  },
  {
    icon: ClipboardList,
    title: 'Generate Your Syllabus & Modules',
    desc: 'In minutes, ATLAS produces a complete week-by-week, CHED OBE-compliant structure — all grounded in your course materials, not generic templates.',
    accent: 'rgba(21,128,61,0.3)',
  },
  {
    icon: FileCheck,
    title: 'Build Your Assessments',
    desc: "Generate ILO-mapped exams, then scan bubble sheets on ATLAS Mobile. Every item is tagged by Bloom's Taxonomy level and comes with an answer key or essay rubric.",
    accent: 'rgba(20,83,45,0.3)',
  },
  {
    icon: BarChart3,
    title: 'Descriptive Analytics',
    desc: 'See which learning outcomes a course, college, or campus is struggling with. Reports stay on your deployment and sit beside live grading, so login and scoring stay responsive.',
    accent: 'rgba(22,163,74,0.3)',
  },
  {
    icon: LayoutDashboard,
    title: 'Admin Dashboard',
    desc: 'Provision faculty accounts, monitor institutional performance, and generate compliance reports — all from a unified dashboard built for academic leaders.',
    accent: 'rgba(21,128,61,0.3)',
  },
  {
    icon: Server,
    title: 'Private Deployment',
    desc: 'Each institution receives its own server, database, and web address. When more faculty or another campus needs access, that deployment is enlarged. Your data stays on your system.',
    accent: 'rgba(134,239,172,0.3)',
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
    quote: "Our college runs ATLAS on its own deployment. Faculty generate syllabi and exams in the workspace, and our course records stay with the college.",
    author: 'College Head',
    role: 'College of Information',
    stars: 5,
  },
]

const TEAM = [
  { name: 'Hearty Isabel Delacion', title: 'Co-Founder | CEO', image: delacion },
  { name: 'Jasmin B. Esperida', title: 'Co-Founder | CCO', image: esperida },
  { name: 'Noe L. Gonzales', title: 'Co-Founder | CTO', image: gonzales },
]

// ── NAV LINKS (mirrored from sign-in/sign-up pages) ──────────────────────────
const NAV_LINKS = [
  { label: 'HOME', href: '#home' },
  { label: 'PACKAGES', href: '#pricing' },
  { label: 'CONTACT', href: '#contact' },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, user } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('home')
  const pageRef = useRef(null)
  const [authModal, setAuthModal] = useState(null) // 'signin', 'signup', 'reset', null
  const [contactForm, setContactForm] = useState({ name: '', email: '', institution: '', package: '', message: '', leave_blank: '' })
  const [contactStatus, setContactStatus] = useState({ type: '', message: '' })
  const [contactSubmitting, setContactSubmitting] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = pageRef.current?.scrollTop ?? window.scrollY
      setScrolled(scrollTop > 40)
      const sections = NAV_LINKS.map(({ href }) => href.slice(1))
      const activeId = sections.reverse().find((id) => {
        const el = document.getElementById(id)
        return el && el.getBoundingClientRect().top <= 120
      }) || 'home'
      setActiveSection(activeId)
    }
    const scrollContainer = pageRef.current
    scrollContainer?.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => scrollContainer?.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const targetId = location.hash ? location.hash.replace('#', '') : location.pathname.replace('/', '')
    if (!targetId || !['home', 'pricing', 'contact'].includes(targetId)) return

    const section = document.getElementById(targetId)
    if (!section) return

    const timer = setTimeout(() => {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveSection(targetId)
    }, 80)

    return () => clearTimeout(timer)
  }, [location.hash, location.pathname])

  function handleGetStarted() {
    if (isAuthenticated) {
      if (user?.role === 'superadmin') navigate('/superadmin/dashboard')
      else if (user?.role === 'admin') navigate('/admin/dashboard')
      else navigate('/faculty/dashboard')
    } else {
      setAuthModal('signup')
    }
  }

  function scrollTo(id) {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
    setMobileOpen(false)
  }

  function requestQuote(packageName) {
    setContactForm(prev => {
      const auto = /^We would like a quote for the .+ package\.$/
      const nextMessage = !prev.message.trim() || auto.test(prev.message.trim())
        ? `We would like a quote for the ${packageName} package.`
        : prev.message
      return { ...prev, package: packageName, message: nextMessage }
    })
    scrollTo('contact')
  }

  function handleContactChange(event) {
    const { name, value } = event.target
    setContactForm(prev => ({ ...prev, [name]: value }))
    if (contactStatus.message) setContactStatus({ type: '', message: '' })
  }

  function handleContactSubmit(event) {
    event.preventDefault()

    const trimmedName = contactForm.name.trim()
    const trimmedEmail = contactForm.email.trim()
    const trimmedInstitution = contactForm.institution.trim()
    const trimmedPackage = contactForm.package.trim()
    const trimmedMessage = contactForm.message.trim()

    if (!trimmedName || !trimmedEmail || !trimmedInstitution || !trimmedMessage) {
      setContactStatus({ type: 'error', message: 'Please fill in every field before sending your message.' })
      return
    }
    if (trimmedName.length > 120 || trimmedInstitution.length > 200 || trimmedMessage.length > 2000) {
      setContactStatus({ type: 'error', message: 'One of the fields is too long. Shorten it and try again.' })
      return
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(trimmedEmail)) {
      setContactStatus({ type: 'error', message: 'Please enter a valid institutional email address.' })
      return
    }
    const knownPackage = PACKAGES.some((plan) => plan.name === trimmedPackage)

    setContactSubmitting(true)
    setContactStatus({ type: '', message: '' })

    api
      .post('/users/contact/', {
        name: trimmedName,
        email: trimmedEmail,
        institution: trimmedInstitution,
        message: knownPackage ? `Package: ${trimmedPackage}\n\n${trimmedMessage}` : trimmedMessage,
        leave_blank: contactForm.leave_blank,
      })
      .then(({ data }) => {
        setContactStatus({
          type: 'success',
          message: data?.detail || `Thanks, ${trimmedName}! Your message has been sent to the ATLAS team.`,
        })
        setContactForm({ name: '', email: '', institution: '', package: '', message: '', leave_blank: '' })
      })
      .catch((err) => {
        const detail = err?.response?.data?.detail
          || err?.response?.data?.name?.[0]
          || err?.response?.data?.email?.[0]
          || err?.response?.data?.institution?.[0]
          || err?.response?.data?.message?.[0]
          || 'Could not send your message. Please try again or email us directly.'
        setContactStatus({ type: 'error', message: detail })
      })
      .finally(() => setContactSubmitting(false))
  }

  const [featRef, featInView] = useInView()
  const [statsRef, statsInView] = useInView()
  const [testimonialsRef, testimonialsInView] = useInView()
  const [teamRef, teamInView] = useInView()
  const [pricingRef, pricingInView] = useInView()

  return (
    <div ref={pageRef} style={{
      minHeight: '100vh',
      background: '#0A0A0B',
      color: '#F0F0F0',
      fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
      overflowX: 'hidden',
    }}>

      {/* ── GLOBAL STYLES ─────────────────────────────────────────────────── */}
      <style>{`
        * { box-sizing: border-box; }

        html { scroll-behavior: smooth; }

        .atlas-btn-primary {
          background: linear-gradient(135deg, #15803D, #16A34A);
          color: #fff;
          border: none;
          border-radius: 12px;
          font-family: inherit;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.25s ease;
          letter-spacing: 0.02em;
        }
        .atlas-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(21,128,61,0.5);
          background: linear-gradient(135deg, #14532D, #16A34A);
        }
        .atlas-btn-outline {
          background: transparent;
          color: #F0F0F0;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 12px;
          font-family: inherit;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s ease;
        }
        .atlas-btn-outline:hover {
          border-color: rgba(255,255,255,0.5);
          background: rgba(255,255,255,0.07);
        }

        .nav-link {
          color: rgba(255,255,255,0.65);
          text-decoration: none;
          font-size: 0.82rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          transition: color 0.2s;
          cursor: pointer;
          background: none;
          border: none;
          font-family: inherit;
          padding: 4px 0;
        }
        .nav-link:hover, .nav-link.active {
          color: #fff;
        }
        .nav-link.active {
          border-bottom: 2px solid #16A34A;
        }

        .feature-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 2rem;
          transition: all 0.35s ease;
          position: relative;
          overflow: hidden;
        }
        .feature-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 20px;
          opacity: 0;
          transition: opacity 0.35s ease;
          background: linear-gradient(135deg, rgba(21,128,61,0.12), transparent);
        }
        .feature-card:hover {
          border-color: rgba(22,163,74,0.4);
          transform: translateY(-4px);
          box-shadow: 0 20px 60px rgba(21,128,61,0.15);
        }
        .feature-card:hover::before {
          opacity: 1;
        }

        .testimonial-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 20px;
          padding: 2rem;
          transition: all 0.3s ease;
        }
        .testimonial-card:hover {
          border-color: rgba(22,163,74,0.35);
          background: rgba(21,128,61,0.08);
          transform: translateY(-3px);
        }

        .pricing-card {
          background: rgba(255,255,255,0.03);
          border-radius: 24px;
          padding: 2.5rem;
          transition: all 0.35s ease;
          position: relative;
        }
        .pricing-card:hover {
          transform: translateY(-6px);
        }
        .pricing-card.popular {
          background: rgba(21,128,61,0.15);
        }

        .team-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 1.5rem 1.5rem 2rem;
          text-align: center;
          transition: all 0.3s ease;
        }
        .team-card:hover {
          border-color: rgba(22,163,74,0.4);
          background: rgba(21,128,61,0.08);
          transform: translateY(-4px);
        }

        .fade-up {
          opacity: 0;
          transform: translateY(32px);
          transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .fade-up.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .fade-up:nth-child(1) { transition-delay: 0s; }
        .fade-up:nth-child(2) { transition-delay: 0.1s; }
        .fade-up:nth-child(3) { transition-delay: 0.2s; }
        .fade-up:nth-child(4) { transition-delay: 0.3s; }
        .fade-up:nth-child(5) { transition-delay: 0.4s; }
        .fade-up:nth-child(6) { transition-delay: 0.5s; }

        .glow-text {
          background: linear-gradient(135deg, #86EFAC, #BBF7D0, #16A34A);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .stat-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          padding: 1.5rem;
          text-align: center;
          transition: all 0.3s ease;
        }
        .stat-card:hover {
          border-color: rgba(22,163,74,0.4);
          background: rgba(21,128,61,0.08);
        }

        .contact-honeypot {
          position: absolute;
          left: -10000px;
          width: 1px;
          height: 1px;
          overflow: hidden;
        }

        .mobile-menu {
          display: none;
          position: fixed;
          top: 72px;
          left: 0;
          right: 0;
          background: rgba(10,10,11,0.97);
          border-bottom: 1px solid rgba(255,255,255,0.1);
          backdrop-filter: blur(20px);
          z-index: 999;
          padding: 1.5rem;
          flex-direction: column;
          gap: 1rem;
        }
        .mobile-menu.open {
          display: flex;
        }

        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .hamburger { display: flex !important; }
          .hero-title { font-size: clamp(1.8rem, 8vw, 2.8rem) !important; }
          .hero-subtitle { font-size: 1.05rem !important; }
          .section-title { font-size: 2rem !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .pricing-grid { grid-template-columns: 1fr !important; }
          .contact-grid { grid-template-columns: 1fr !important; gap: 2.5rem !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .testimonials-grid { grid-template-columns: 1fr !important; }
          .team-grid { grid-template-columns: 1fr !important; }
          .hero-container {
            flex-direction: column;
            text-align: center;
            gap: 2.5rem;
          }
          .hero-text-content {
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .hero-title, .hero-subtitle {
            text-align: center !important;
          }
          .hero-cta-group, .stats-chips {
            justify-content: center !important;
          }
        }

        @media (min-width: 769px) {
          .hamburger { display: none !important; }
          .hero-container {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 4rem;
            text-align: left;
          }
          .hero-text-content {
            flex: 1.2;
            min-width: 0;
          }
          .hero-image-content {
            flex: 1;
            display: flex;
            justify-content: flex-end;
            position: relative;
            z-index: 2;
          }
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(22,163,74,0.15);
          border: 1px solid rgba(22,163,74,0.35);
          border-radius: 100px;
          padding: 6px 16px;
          font-size: 0.78rem;
          font-weight: 600;
          color: #86EFAC;
          letter-spacing: 0.05em;
          margin-bottom: 1.5rem;
          animation: badge-pulse 2.5s ease-in-out infinite;
        }
        @keyframes badge-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0.25); }
          50% { box-shadow: 0 0 0 8px rgba(22,163,74,0); }
        }

        .hero-cta-group {
          display: flex;
          gap: 1rem;
          justify-content: flex-start;
          flex-wrap: wrap;
          margin-top: 2.5rem;
        }

        .scroll-indicator {
          position: absolute;
          bottom: 2rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          opacity: 0.4;
          animation: bounce 2s ease-in-out infinite;
        }
        @keyframes bounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(8px); }
        }

        .popular-badge {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #15803D, #16A34A);
          color: white;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          padding: 5px 18px;
          border-radius: 100px;
          white-space: nowrap;
        }

        .contact-input {
          width: 100%;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          padding: 0.9rem 1.2rem;
          color: #F0F0F0;
          font-family: inherit;
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.2s;
          margin-bottom: 1rem;
          resize: none;
        }
        .contact-input:focus {
          border-color: rgba(22,163,74,0.6);
        }
        .contact-input::placeholder {
          color: rgba(255,255,255,0.3);
        }
        select.contact-input {
          appearance: none;
          background-image: linear-gradient(45deg, transparent 50%, rgba(134,239,172,0.8) 50%), linear-gradient(135deg, rgba(134,239,172,0.8) 50%, transparent 50%);
          background-position: calc(100% - 18px) 50%, calc(100% - 12px) 50%;
          background-size: 6px 6px, 6px 6px;
          background-repeat: no-repeat;
        }
        .contact-input option {
          background: #0A0A0B;
          color: #F0F0F0;
        }

        .divider {
          width: 60px;
          height: 3px;
          background: linear-gradient(90deg, #15803D, #16A34A);
          border-radius: 3px;
          margin: 1rem auto 0;
        }

        .neon-border-glow {
          position: relative;
        }
        .neon-border-glow::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 2px; /* Border thickness */
          background: linear-gradient(
            90deg,
            rgba(134, 239, 172, 0) 0%,
            rgba(134, 239, 172, 0.8) 12.5%,
            rgba(21, 128, 61, 0.8) 25%,
            rgba(134, 239, 172, 0) 50%,
            rgba(134, 239, 172, 0.8) 62.5%,
            rgba(21, 128, 61, 0.8) 75%,
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
        
        @keyframes orb-float {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(40px, -60px) scale(1.1); }
          66% { transform: translate(-30px, 30px) scale(0.9); }
        }
      `}</style>

      {/* ── NAVBAR ──────────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 1000,
        transition: 'all 0.35s ease',
       
      }}>
        <div style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '0 2rem',
          height: 72,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          {/* Logo */}
          <button onClick={() => scrollTo('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <img src={atlasLogo} alt="ATLAS Logo" style={{ height: 32, objectFit: 'contain' }} />
          </button>

          {/* Desktop Nav */}
          <div className="desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
            {NAV_LINKS.map(({ label, href }) => (
              <button
                key={label}
                className={`nav-link ${activeSection === href.replace('#', '') ? 'active' : ''}`}
                onClick={() => scrollTo(href.replace('#', ''))}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Auth Buttons */}
          <div className="desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <InstallAppButton style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }} />
            {isAuthenticated ? (
              <button className="atlas-btn-primary" onClick={handleGetStarted} style={{ padding: '0.6rem 1.4rem', fontSize: '0.88rem' }}>
                Dashboard
              </button>
            ) : (
              <>
                <button className="atlas-btn-outline" onClick={() => setAuthModal('signin')} style={{ padding: '0.55rem 1.2rem', fontSize: '0.85rem' }}>
                  SIGN IN
                </button>
                <button className="atlas-btn-primary" onClick={() => scrollTo('contact')} style={{ padding: '0.6rem 1.4rem', fontSize: '0.88rem' }}>
                  REQUEST A DEMO
                </button>
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
                background: '#fff', borderRadius: 2,
                transition: 'all 0.3s ease',
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

      {/* Mobile Menu */}
      <div className={`mobile-menu ${mobileOpen ? 'open' : ''}`}>
        {NAV_LINKS.map(({ label, href }) => (
          <button key={label} className={`nav-link ${activeSection === href.replace('#', '') ? 'active' : ''}`} style={{ fontSize: '1rem', padding: '0.5rem 0' }} onClick={() => scrollTo(href.replace('#', ''))}>
            {label}
          </button>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
          <InstallAppButton fullWidth style={{ padding: '0.7rem', fontSize: '0.9rem' }} />
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="atlas-btn-outline" onClick={() => { setAuthModal('signin'); setMobileOpen(false) }} style={{ flex: 1, padding: '0.7rem', fontSize: '0.9rem' }}>
              SIGN IN
            </button>
            <button className="atlas-btn-primary" onClick={() => scrollTo('contact')} style={{ flex: 1, padding: '0.7rem', fontSize: '0.9rem' }}>
              REQUEST A DEMO
            </button>
          </div>
        </div>
      </div>

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section id="home" style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingTop: 72 }}>

        {/* Background orbs */}
        <Orb style={{ width: 600, height: 600, background: 'rgba(21,128,61,0.18)', top: -100, left: -150 }} />
        <Orb style={{ width: 500, height: 500, background: 'rgba(21,128,61,0.12)', bottom: -100, right: -100 }} />
        <Orb style={{ width: 300, height: 300, background: 'rgba(20,83,45,0.2)', top: '40%', left: '60%' }} />

        {/* Grid overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
          zIndex: 0,
        }} />

        <div className="hero-container" style={{ position: 'relative', zIndex: 1, padding: '2rem', maxWidth: 1200, margin: '0 auto', marginTop: '-4rem' }}>
          <div className="hero-text-content">
            <h1 className="hero-title" style={{
            fontSize: 'clamp(2.8rem, 4.5vw, 4rem)',
              fontWeight: 800,
              lineHeight: 1.1,
              maxWidth: 1000,
              letterSpacing: '-0.02em',
              margin: '0 0 1.2rem',
              fontFamily: '"Plus Jakarta Sans", sans-serif',
            }}>
            <span style={{ whiteSpace: 'nowrap' }}>Bring the Passion.</span><br />
            <span className="glow-text" style={{ whiteSpace: 'nowrap' }}>We'll Bring the Platform.</span>
            </h1>

            <p className="hero-subtitle" style={{
              fontSize: '1.2rem',
              color: 'rgba(255,255,255,0.6)',
              lineHeight: 1.7,
              margin: '0 0 2rem',
              maxWidth: '100%',
            }}>
              A private deployment for your institution. ATLAS Web and Mobile include CHED OBE-aligned syllabi, modules, and assessments, OMR scanning, and descriptive analytics.
            </p>

            <div className="hero-cta-group">
              <button className="atlas-btn-primary subtle-neon-glow" onClick={() => scrollTo('contact')} style={{ padding: '0.9rem 2.5rem', fontSize: '1rem' }}>
                Request an Institutional Demo
              </button>
              <button
                className="atlas-btn-outline"
                onClick={() => scrollTo('pricing')}
                style={{ padding: '0.9rem 2rem', fontSize: '1rem' }}
              >
                View Packages
              </button>
            </div>

            {/* Floating stats chips */}
            <div className="stats-chips" style={{ display: 'flex', gap: '.5rem', marginTop: '2rem', flexWrap: 'wrap' }}>
              {[
                'CHED OBE-aligned',
                'ATLAS Mobile OMR',
                'Your own server and database',
              ].map((label) => (
                <div key={label} style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 100,
                  padding: '7px 12px',
                  fontSize: '0.78rem',
                  color: 'rgba(255,255,255,0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <Check size={14} color="#86EFAC" strokeWidth={2.5} aria-hidden="true" />
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className="hero-image-content">
            <img
              src={atlasHero}
              alt="ATLAS Platform Character"
              width={720}
              height={1207}
              decoding="async"
              fetchPriority="high"
              style={{
                width: '100%',
                maxWidth: 360,
                display: 'block',
                filter: 'drop-shadow(0 20px 40px rgba(21,128,61,0.25))',
                transform: 'translateX(0)'
              }}
            />
          </div>
        </div>

        <div className="scroll-indicator">
          <span style={{ fontSize: '0.7rem', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)' }}>SCROLL</span>
          <div style={{ width: 1, height: 40, background: 'linear-gradient(to bottom, rgba(255,255,255,0.3), transparent)' }} />
        </div>
      </section>

      {/* ── STATS ───────────────────────────────────────────────────────────── */}
      <section ref={statsRef} style={{ padding: '4rem 2rem', background: 'rgba(21,128,61,0.06)', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
            {[
              { title: 'Your server', label: 'Application traffic stays on a machine dedicated to your institution' },
              { title: 'Your database', label: 'Courses, grades, scans, and exam keys never leave your deployment' },
              { title: 'Web and Mobile', label: 'Syllabus, modules, assessments, and OMR on one private stack' },
              { title: 'Sized to you', label: 'More faculty or another campus expands your deployment' },
            ].map(({ title, label }, i) => (
              <div key={i} className={`stat-card fade-up subtle-neon-glow ${statsInView ? 'visible' : ''}`}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#86EFAC', lineHeight: 1.3 }}>
                  {title}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginTop: '0.55rem', lineHeight: 1.5 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────────── */}
      <section id="features" style={{ padding: '7rem 2rem', position: 'relative', overflow: 'hidden' }}>
        <Orb style={{ width: 500, height: 500, background: 'rgba(21,128,61,0.1)', top: '10%', right: -150 }} />

        <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ color: '#86EFAC', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '0.75rem' }}>CAPABILITIES</p>
            <h2 className="section-title" style={{ fontSize: '2.6rem', fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
              Everything Your Course Needs <br />
              <span className="glow-text">to Teach Smarter</span>
            </h2>
            <div className="divider" />
          </div>

          <div
            ref={featRef}
            className="features-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}
          >
            {FEATURES.map((f, i) => (
              <div key={i} className={`feature-card fade-up neon-border-glow ${featInView ? 'visible' : ''}`}>
                <div style={{
                  width: 52, height: 52,
                  background: f.accent,
                  border: '1px solid rgba(22,163,74,0.25)',
                  borderRadius: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '1.2rem',
                }}>
                  <f.icon size={22} color="#86EFAC" strokeWidth={1.75} aria-hidden="true" />
                </div>
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
            <p style={{ color: '#86EFAC', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '0.75rem' }}>SOCIAL PROOF</p>
            <h2 className="section-title" style={{ fontSize: '2.6rem', fontWeight: 800, margin: 0 }}>
              What Educators Are Saying
            </h2>
            <div className="divider" />
          </div>

          <div
            ref={testimonialsRef}
            className="testimonials-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}
          >
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className={`testimonial-card fade-up neon-border-glow ${testimonialsInView ? 'visible' : ''}`}>
                <div style={{ display: 'flex', gap: 4, marginBottom: '1rem' }} aria-label={`${t.stars} stars`}>
                  {Array.from({ length: t.stars }, (_, star) => (
                    <Star key={star} size={16} color="#86EFAC" fill="#86EFAC" aria-hidden="true" />
                  ))}
                </div>
                <p style={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.75, fontSize: '0.92rem', fontStyle: 'italic', margin: '0 0 1.5rem' }}>
                  "{t.quote}"
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'rgba(22,163,74,0.25)',
                    border: '1px solid rgba(22,163,74,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.9rem', color: '#86EFAC', fontWeight: 700,
                  }}>
                    {t.author[0]}
                  </div>
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
        <Orb style={{ width: 600, height: 600, background: 'rgba(21,128,61,0.12)', bottom: -200, left: -150 }} />

        <div style={{ maxWidth: 1180, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ color: '#86EFAC', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '0.75rem' }}>PACKAGES</p>
            <h2 className="section-title" style={{ fontSize: '2.6rem', fontWeight: 800, margin: 0 }}>
              A Private Deployment for Your Institution
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: '0.75rem', fontSize: '0.95rem', maxWidth: 720, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.7 }}>
              Starter, Professional, or Custom. Setup, an annual license, and maintenance are quoted together.
            </p>
            <div className="divider" />
          </div>

          <div
            ref={pricingRef}
            className="pricing-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem', alignItems: 'stretch' }}
          >
            {PACKAGES.map((plan) => (
              <div
                key={plan.name}
                className={`pricing-card fade-up neon-border-glow ${pricingInView ? 'visible' : ''} ${plan.featured ? 'popular' : ''}`}
                style={{
                  border: `1px solid ${plan.border}`,
                  background: plan.color,
                  boxShadow: plan.featured ? `0 0 60px ${plan.glow}` : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {plan.badge && <div className="popular-badge">{plan.badge}</div>}

                <div style={{ marginBottom: '1.25rem' }}>
                  <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#86EFAC', margin: '0 0 0.4rem' }}>
                    {plan.name}
                  </h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>{plan.tagline}</p>
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.15rem', marginBottom: '1.5rem', flex: 1 }}>
                  {plan.features.map((feat) => (
                        <div key={feat} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '0.7rem' }}>
                          <span style={{
                            width: 20, height: 20, borderRadius: '50%',
                            background: 'rgba(22,163,74,0.2)',
                            border: '1px solid rgba(22,163,74,0.4)',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            marginRight: 10, flexShrink: 0, marginTop: 1,
                          }}>
                            <Check size={12} color="#86EFAC" strokeWidth={2.5} aria-hidden="true" />
                          </span>
                          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.9rem', lineHeight: 1.45 }}>{feat}</span>
                        </div>
                  ))}
                </div>

                <button
                  className={plan.featured ? 'atlas-btn-primary' : 'atlas-btn-outline'}
                  onClick={() => requestQuote(plan.name)}
                  style={{ width: '100%', padding: '0.85rem', fontSize: '0.92rem', fontWeight: 700, marginTop: 'auto' }}
                >
                  Request a quote
                </button>
              </div>
            ))}
          </div>

          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: '0.88rem', marginTop: '2.5rem', lineHeight: 1.7, maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
            Each school gets its own ATLAS. When you outgrow a package, that deployment expands with you.
          </p>
        </div>
      </section>

      {/* ── TEAM ────────────────────────────────────────────────────────────── */}
      <section id="team" style={{ padding: '7rem 2rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ color: '#86EFAC', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '0.75rem' }}>THE TEAM</p>
            <h2 className="section-title" style={{ fontSize: '2.6rem', fontWeight: 800, margin: 0 }}>
              Built by Students.<br />Made for Teachers.
            </h2>
            <div className="divider" />
          </div>

          <div
            ref={teamRef}
            className="team-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', maxWidth: 900, margin: '0 auto' }}
          >
            {TEAM.map((member, i) => (
              <div key={i} className={`team-card fade-up subtle-neon-glow ${teamInView ? 'visible' : ''}`}>
                <div style={{
                  width: '100%', height: 280,
                  borderRadius: 16,
                  background: 'rgba(22,163,74,0.1)',
                  border: '1px solid rgba(22,163,74,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 1.5rem',
                  overflow: 'hidden',
                }}>
                  <img src={member.image} alt={member.name} width={800} height={1000} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
                </div>
                <h3 style={{ fontWeight: 700, fontSize: '1.2rem', margin: '0 0 0.4rem', color: '#F0F0F0' }}>{member.name}</h3>
                <p style={{ color: '#86EFAC', fontSize: '0.9rem', margin: 0, fontWeight: 600, letterSpacing: '0.04em' }}>{member.title}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTACT / CTA ───────────────────────────────────────────────────── */}
      <section id="contact" style={{ padding: '7rem 2rem', background: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
        <Orb style={{ width: 500, height: 500, background: 'rgba(21,128,61,0.15)', top: -100, right: -100 }} />

        <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div className="contact-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5rem', alignItems: 'center' }}>
            <div>
              <p style={{ color: '#86EFAC', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '0.75rem' }}>GET IN TOUCH</p>
              <h2 style={{ fontSize: '2.4rem', fontWeight: 800, margin: '0 0 1.2rem', lineHeight: 1.2 }}>
                Request an<br />
                <span className="glow-text">Institutional Demo</span>
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.8, fontSize: '0.95rem', marginBottom: '2rem' }}>
                Tell us which package fits your institution: Starter, Professional, or Custom.
                We size a private ATLAS deployment to that package, then expand it when you need more room.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {[
                  { icon: Mail, label: 'Email', value: 'atlas.hybrid.dev@gmail.com' },
                  { icon: MapPin, label: 'Location', value: 'Lipa City, Batangas, Philippines' },
                  { icon: Clock, label: 'Response Time', value: 'Within 24 hours' },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: 'rgba(22,163,74,0.15)',
                      border: '1px solid rgba(22,163,74,0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon size={18} color="#86EFAC" strokeWidth={1.75} aria-hidden="true" />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: '0.92rem', color: '#F0F0F0' }}>{value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <GlassCard style={{ padding: '2.5rem' }}>
              <form onSubmit={handleContactSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', position: 'relative' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.5rem', color: '#F0F0F0' }}>Request a demo or quote</h3>
                <input className="contact-input" name="name" value={contactForm.name} onChange={handleContactChange} placeholder="Your Name" maxLength={120} autoComplete="name" />
                <input className="contact-input" name="email" type="email" value={contactForm.email} onChange={handleContactChange} placeholder="Institutional Email" maxLength={254} autoComplete="email" />
                <input className="contact-input" name="institution" value={contactForm.institution} onChange={handleContactChange} placeholder="Institution Name" maxLength={200} autoComplete="organization" />
                <div className="contact-honeypot" aria-hidden="true">
                  <label htmlFor="leave_blank">Leave this blank</label>
                  <input id="leave_blank" name="leave_blank" tabIndex={-1} autoComplete="off" value={contactForm.leave_blank} onChange={handleContactChange} />
                </div>
                <select className="contact-input" name="package" value={contactForm.package} onChange={handleContactChange}>
                  <option value="">Package of interest</option>
                  {PACKAGES.map((plan) => (
                    <option key={plan.name} value={plan.name}>{plan.name}</option>
                  ))}
                </select>
                <textarea className="contact-input" name="message" rows={4} maxLength={2000} value={contactForm.message} onChange={handleContactChange} placeholder="Tell us about your institution" />
                {contactStatus.message && (
                  <div style={{
                    padding: '0.7rem 0.9rem',
                    borderRadius: 10,
                    fontSize: '0.82rem',
                    border: contactStatus.type === 'success'
                      ? '1px solid rgba(88, 204, 135, 0.5)'
                      : '1px solid rgba(239, 68, 68, 0.5)',
                    background: contactStatus.type === 'success'
                      ? 'rgba(22,163,74,0.12)'
                      : 'rgba(239, 68, 68, 0.12)',
                    color: contactStatus.type === 'success' ? '#c9f7d6' : '#ffd1d1',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}>
                    {contactStatus.type === 'success'
                      ? <Check size={16} color="#86EFAC" strokeWidth={2.5} aria-hidden="true" />
                      : <span style={{ fontSize: '1rem' }}>!</span>}
                    <span>{contactStatus.message}</span>
                  </div>
                )}
                <button type="submit" className="atlas-btn-primary" style={{ width: '100%', padding: '0.9rem', fontSize: '0.95rem' }} disabled={contactSubmitting}>
                  {contactSubmitting ? 'Sending...' : 'Request an Institutional Demo'}
                </button>
              </form>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.07)',
        padding: '2.5rem 2rem',
        background: '#060607',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img src={atlasLogo} alt="ATLAS" width={640} height={188} loading="lazy" decoding="async" style={{ height: 28, width: 'auto', objectFit: 'contain', display: 'block' }} />
            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.82rem' }}>© 2026 ATLAS. All rights reserved.</span>
          </div>
          <div style={{ display: 'flex', gap: '2rem' }}>
            <Link to="/legal/privacy" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.82rem', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link to="/legal/terms" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.82rem', textDecoration: 'none' }}>Terms and Conditions</Link>
            <Link to="/contact" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.82rem', textDecoration: 'none' }}>Contact</Link>
          </div>
        </div>
      </footer>

      {/* ── AUTH MODALS ─────────────────────────────────────────────────────── */}
      <Suspense fallback={null}>
      {authModal === 'signin' && (
        <SignInPage isModal onClose={() => setAuthModal(null)} onSwitch={setAuthModal} />
      )}
      {authModal === 'signup' && (
        <SignUpPage isModal onClose={() => setAuthModal(null)} onSwitch={setAuthModal} />
      )}
      {authModal === 'reset' && (
        <PasswordResetPage isModal onClose={() => setAuthModal(null)} onSwitch={setAuthModal} />
      )}
      </Suspense>
    </div>
  )
}