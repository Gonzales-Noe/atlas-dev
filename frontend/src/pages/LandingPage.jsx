import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../store/authStore'
import api from '../config/api'
import { TENANT_INSTITUTION_NAME } from '../config/tenant'
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
  Sparkles,
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
        background: 'rgba(0,0,0,0.048)',
        border: '1px solid rgba(0,0,0,0.12)',
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

// ── Packages ─────────────────────────────────────────────────────────────────
const PACKAGES = [
  {
    name: 'Starter',
    tagline: 'Syllabus, modules, exams, and course analytics.',
    price: 'Quote',
    period: 'annual',
    bestFor: 'Best for getting started',
    highlights: [
      { icon: Server, label: 'Private server and database' },
      { icon: FileCheck, label: 'Syllabus, modules, and exams' },
    ],
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
    tagline: 'Web and Mobile for the whole campus.',
    price: 'Quote',
    period: 'annual',
    bestFor: 'Best value for the campus',
    badge: 'Popular',
    highlights: [
      { icon: LayoutDashboard, label: 'Web and Mobile for everyone' },
      { icon: BarChart3, label: 'Analytics across programs' },
    ],
    features: [
      'A larger private server and database',
      'Web and Mobile for the whole campus',
      'Analytics across programs',
      'Exam-week scanning and priority support',
    ],
    featured: true,
  },
  {
    name: 'Custom',
    tagline: 'For campuses that need capacity to grow with them.',
    price: 'Quote',
    period: 'annual',
    bestFor: 'Best for high growth',
    highlights: [
      { icon: Server, label: 'Capacity added as you grow' },
      { icon: Clock, label: 'Support matched to your calendar' },
    ],
    features: [
      'Servers and databases added as you grow',
      'More faculty added when you need them',
      'Reports across colleges and programs',
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
    accent: 'rgba(142,28,27,0.3)',
  },
  {
    icon: ClipboardList,
    title: 'Generate Your Syllabus & Modules',
    desc: 'In minutes, ATLAS produces a complete week-by-week, CHED OBE-compliant structure — all grounded in your course materials, not generic templates.',
    accent: 'rgba(142,28,27,0.3)',
  },
  {
    icon: FileCheck,
    title: 'Build Your Assessments',
    desc: "Generate ILO-mapped exams, then scan bubble sheets on ATLAS Mobile. Every item is tagged by Bloom's Taxonomy level and comes with an answer key or essay rubric.",
    accent: 'rgba(110,18,18,0.3)',
  },
  {
    icon: BarChart3,
    title: 'Descriptive Analytics',
    desc: 'See which learning outcomes a course, college, or program is struggling with. Reports sit beside live grading, so login and scoring stay responsive.',
    accent: 'rgba(170,36,35,0.3)',
  },
  {
    icon: LayoutDashboard,
    title: 'Admin Dashboard',
    desc: 'Add faculty accounts, follow course performance, and generate compliance reports from one dashboard.',
    accent: 'rgba(142,28,27,0.3)',
  },
  {
    icon: Server,
    title: 'Private server',
    desc: 'ATLAS runs on a server and database for Batangas State University - Lipa Campus. Courses, grades, and scans stay on that system.',
    accent: 'rgba(226,75,74,0.3)',
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
    quote: "Faculty generate syllabi and exams in the workspace, and our course records stay with the college.",
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
  const { isAuthenticated, isLoading, user } = useAuth()
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
    const trimmedInstitution = TENANT_INSTITUTION_NAME
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
      setContactStatus({ type: 'error', message: 'Please enter a valid email address.' })
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
    <div ref={pageRef} className="atlas-landing" style={{
      minHeight: '100vh',
      background: '#FFFFFF',
      color: '#1A1A1A',
      fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
      overflowX: 'hidden',
    }}>

      {/* ── GLOBAL STYLES ─────────────────────────────────────────────────── */}
      <style>{`
        * { box-sizing: border-box; }

        html { scroll-behavior: smooth; }

        .atlas-btn-primary {
          background: linear-gradient(135deg, var(--brand-primary-hover), var(--brand-primary));
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
          box-shadow: 0 8px 32px rgba(142,28,27,0.5);
          background: linear-gradient(135deg, var(--brand-red-core), var(--brand-primary));
        }
        .atlas-btn-outline {
          background: transparent;
          color: #1A1A1A;
          border: 1px solid rgba(0,0,0,0.14);
          border-radius: 12px;
          font-family: inherit;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s ease;
        }
        .atlas-btn-outline:hover {
          border-color: rgba(17,17,17,0.58);
          background: rgba(0,0,0,0.084);
        }

        .nav-link {
          color: rgba(17,17,17,0.73);
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
          color: #1A1A1A;
        }
        .nav-link.active {
          border-bottom: 2px solid var(--brand-primary);
        }

        .feature-card {
          background: rgba(0,0,0,0.045);
          border: 1px solid rgba(0,0,0,0.096);
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
          background: linear-gradient(135deg, rgba(142,28,27,0.12), transparent);
        }
        .feature-card:hover {
          border-color: rgba(170,36,35,0.4);
          transform: translateY(-4px);
          box-shadow: 0 20px 60px rgba(142,28,27,0.15);
        }
        .feature-card:hover::before {
          opacity: 1;
        }

        .testimonial-card {
          background: rgba(0,0,0,0.048);
          border: 1px solid rgba(0,0,0,0.108);
          border-radius: 20px;
          padding: 2rem;
          transition: all 0.3s ease;
        }
        .testimonial-card:hover {
          border-color: rgba(170,36,35,0.35);
          background: rgba(142,28,27,0.08);
          transform: translateY(-3px);
        }

        .pricing-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.16fr) minmax(0, 0.92fr);
          gap: 1.15rem;
          align-items: center;
          padding: 1.75rem 0.25rem 2.25rem;
        }
        .pricing-slot {
          min-width: 0;
        }
        .pricing-slot.is-featured {
          position: relative;
          z-index: 2;
        }
        .pricing-card {
          background: #fffdfb;
          border: 1px solid rgba(60, 40, 20, 0.1);
          border-radius: 18px;
          padding: 1.55rem 1.4rem 1.35rem;
          box-shadow: 0 10px 30px rgba(60, 30, 10, 0.05);
          display: flex;
          flex-direction: column;
          position: relative;
          transition: transform 0.35s ease, box-shadow 0.35s ease;
        }
        .pricing-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 16px 40px rgba(60, 30, 10, 0.08);
        }
        .pricing-slot.is-featured .pricing-card {
          border: 2px solid #e24b4a;
          padding: 1.85rem 1.65rem 0;
          box-shadow: 0 22px 50px rgba(170, 36, 35, 0.16);
          transform: scale(1.08);
          overflow: hidden;
        }
        .pricing-slot.is-featured .pricing-card:hover {
          transform: translateY(-8px) scale(1.08);
          box-shadow: 0 28px 60px rgba(170, 36, 35, 0.22);
        }
        .pricing-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.55rem;
        }
        .pricing-kicker {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #1a1a1a;
        }
        .pricing-kicker svg {
          color: var(--brand-accent);
        }
        .pricing-tagline {
          color: rgba(17,17,17,0.55);
          font-size: 0.9rem;
          line-height: 1.5;
          margin: 0;
          min-height: 2.7em;
        }
        .pricing-price {
          display: flex;
          align-items: baseline;
          gap: 0.35rem;
          margin: 1.15rem 0 1.05rem;
        }
        .pricing-price strong {
          font-size: 2.7rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          line-height: 1;
          color: #161616;
        }
        .pricing-slot.is-featured .pricing-price strong {
          font-size: 3.15rem;
        }
        .pricing-price span {
          color: rgba(17,17,17,0.42);
          font-size: 0.95rem;
          font-weight: 500;
        }
        .pricing-highlights {
          background: rgba(17,17,17,0.035);
          border-radius: 12px;
          padding: 0.8rem 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
          margin-bottom: 1.1rem;
        }
        .pricing-slot.is-featured .pricing-highlights {
          background: rgba(226, 75, 74, 0.08);
        }
        .pricing-highlight {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-size: 0.9rem;
          color: #2a2a2a;
          line-height: 1.35;
        }
        .pricing-highlight svg {
          flex-shrink: 0;
          color: rgba(17,17,17,0.55);
        }
        .pricing-card .pricing-cta {
          width: 100%;
          padding: 0.82rem 1rem;
          border-radius: 10px;
          font-size: 0.92rem;
        }
        .pricing-card .atlas-btn-outline.pricing-cta {
          background: #fff;
          border-color: rgba(17,17,17,0.14);
        }
        .pricing-best {
          text-align: center;
          font-size: 0.8rem;
          color: rgba(17,17,17,0.45);
          margin: 0.7rem 0 0;
        }
        .pricing-included {
          margin-top: 1.05rem;
          padding-top: 1rem;
          border-top: 1px solid rgba(0,0,0,0.08);
        }
        .pricing-included h4 {
          margin: 0 0 0.75rem;
          font-size: 0.92rem;
          font-weight: 700;
          color: #1a1a1a;
        }
        .pricing-feature {
          display: flex;
          align-items: flex-start;
          gap: 0.55rem;
          margin-bottom: 0.55rem;
          color: rgba(17,17,17,0.78);
          font-size: 0.9rem;
          line-height: 1.4;
        }
        .pricing-feature svg {
          flex-shrink: 0;
          margin-top: 2px;
          color: #1f9d55;
        }
        .pricing-slot.is-featured .pricing-included {
          margin: 1.15rem -1.65rem 0;
          padding: 1.2rem 1.65rem 1.5rem;
          border-top: none;
          background: linear-gradient(180deg, rgba(255, 196, 168, 0.35) 0%, #e87856 24%, #c4382c 58%, #8e1c1b 100%);
          color: #fff;
        }
        .pricing-slot.is-featured .pricing-included h4,
        .pricing-slot.is-featured .pricing-feature {
          color: #fff;
        }
        .pricing-slot.is-featured .pricing-feature svg {
          color: #fff;
        }

        .team-card {
          background: rgba(0,0,0,0.048);
          border: 1px solid rgba(0,0,0,0.096);
          border-radius: 20px;
          padding: 1.5rem 1.5rem 2rem;
          text-align: center;
          transition: all 0.3s ease;
        }
        .team-card:hover {
          border-color: rgba(170,36,35,0.4);
          background: rgba(142,28,27,0.08);
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
          background: linear-gradient(135deg, var(--brand-accent), var(--brand-pale), var(--brand-primary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .stat-card {
          background: rgba(0,0,0,0.048);
          border: 1px solid rgba(0,0,0,0.096);
          border-radius: 16px;
          padding: 1.5rem;
          text-align: center;
          transition: all 0.3s ease;
        }
        .stat-card:hover {
          border-color: rgba(170,36,35,0.4);
          background: rgba(142,28,27,0.08);
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
          background: #FFFFFF;
          border-bottom: 1px solid rgba(0,0,0,0.12);
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
          .pricing-grid { grid-template-columns: 1fr !important; align-items: stretch; }
          .pricing-slot.is-featured .pricing-card,
          .pricing-slot.is-featured .pricing-card:hover {
            transform: none;
          }
          .pricing-tagline { min-height: 0; }
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
          background: rgba(170,36,35,0.15);
          border: 1px solid rgba(170,36,35,0.35);
          border-radius: 100px;
          padding: 6px 16px;
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--brand-accent);
          letter-spacing: 0.05em;
          margin-bottom: 1.5rem;
          animation: badge-pulse 2.5s ease-in-out infinite;
        }
        @keyframes badge-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(170,36,35,0.25); }
          50% { box-shadow: 0 0 0 8px rgba(170,36,35,0); }
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
          background: #1a1a1a;
          color: #fff;
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 4px 8px;
          border-radius: 6px;
          white-space: nowrap;
          line-height: 1.2;
        }

        .contact-input {
          width: 100%;
          background: rgba(0,0,0,0.06);
          border: 1px solid rgba(0,0,0,0.14);
          border-radius: 12px;
          padding: 0.9rem 1.2rem;
          color: #1A1A1A;
          font-family: inherit;
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.2s;
          margin-bottom: 1rem;
          resize: none;
        }
        .contact-input:focus {
          border-color: rgba(170,36,35,0.6);
        }
        .contact-input::placeholder {
          color: rgba(17,17,17,0.38);
        }
        select.contact-input {
          appearance: none;
          background-image: linear-gradient(45deg, transparent 50%, rgba(226,75,74,0.8) 50%), linear-gradient(135deg, rgba(226,75,74,0.8) 50%, transparent 50%);
          background-position: calc(100% - 18px) 50%, calc(100% - 12px) 50%;
          background-size: 6px 6px, 6px 6px;
          background-repeat: no-repeat;
        }
        .contact-input option {
          background: #FFFFFF;
          color: #1A1A1A;
        }

        .divider {
          width: 60px;
          height: 3px;
          background: linear-gradient(90deg, var(--brand-primary-hover), var(--brand-primary));
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
            rgba(226, 75, 74, 0) 0%,
            rgba(226, 75, 74, 0.8) 12.5%,
            rgba(142, 28, 27, 0.8) 25%,
            rgba(226, 75, 74, 0) 50%,
            rgba(226, 75, 74, 0.8) 62.5%,
            rgba(142, 28, 27, 0.8) 75%,
            rgba(226, 75, 74, 0) 100%
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
            rgba(226, 75, 74, 0) 0%,
            rgba(226, 75, 74, 0.5) 12.5%,
            rgba(142, 28, 27, 0.5) 25%,
            rgba(226, 75, 74, 0) 50%,
            rgba(226, 75, 74, 0.5) 62.5%,
            rgba(142, 28, 27, 0.5) 75%,
            rgba(226, 75, 74, 0) 100%
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
        top: 'var(--atlas-titlebar-h, 0px)', left: 0, right: 0,
        zIndex: 1000,
        background: 'rgba(255,255,255,0.72)',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
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
            {!isLoading && isAuthenticated ? (
              <button className="atlas-btn-primary" onClick={handleGetStarted} style={{ padding: '0.6rem 1.4rem', fontSize: '0.88rem' }}>
                Dashboard
              </button>
            ) : !isLoading ? (
              <>
                <button className="atlas-btn-outline" onClick={() => setAuthModal('signin')} style={{ padding: '0.55rem 1.2rem', fontSize: '0.85rem' }}>
                  SIGN IN
                </button>
                <button className="atlas-btn-primary" onClick={() => scrollTo('contact')} style={{ padding: '0.6rem 1.4rem', fontSize: '0.88rem' }}>
                  REQUEST A DEMO
                </button>
              </>
            ) : null}
          </div>

          {/* Hamburger */}
          <button
            className="hamburger"
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1A1A1A', display: 'flex', flexDirection: 'column', gap: 5 }}
          >
            {[0,1,2].map(i => (
              <span key={i} style={{
                display: 'block', width: 24, height: 2,
                background: '#1A1A1A', borderRadius: 2,
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
          {!isLoading && isAuthenticated ? (
            <button className="atlas-btn-primary" onClick={() => { handleGetStarted(); setMobileOpen(false) }} style={{ padding: '0.7rem', fontSize: '0.9rem' }}>
              Dashboard
            </button>
          ) : !isLoading ? (
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="atlas-btn-outline" onClick={() => { setAuthModal('signin'); setMobileOpen(false) }} style={{ flex: 1, padding: '0.7rem', fontSize: '0.9rem' }}>
                SIGN IN
              </button>
              <button className="atlas-btn-primary" onClick={() => scrollTo('contact')} style={{ flex: 1, padding: '0.7rem', fontSize: '0.9rem' }}>
                REQUEST A DEMO
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section id="home" style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingTop: 72 }}>

        {/* Background orbs */}
        <Orb style={{ width: 600, height: 600, background: 'rgba(142,28,27,0.18)', top: -100, left: -150 }} />
        <Orb style={{ width: 500, height: 500, background: 'rgba(142,28,27,0.12)', bottom: -100, right: -100 }} />
        <Orb style={{ width: 300, height: 300, background: 'rgba(110,18,18,0.2)', top: '40%', left: '60%' }} />

        {/* Grid overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `linear-gradient(rgba(0,0,0,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.045) 1px, transparent 1px)`,
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
              color: 'rgba(17,17,17,0.68)',
              lineHeight: 1.7,
              margin: '0 0 2rem',
              maxWidth: '100%',
            }}>
              ATLAS for {TENANT_INSTITUTION_NAME}. Web and Mobile include CHED OBE-aligned syllabi, modules, and assessments, OMR scanning, and descriptive analytics.
            </p>

            <div className="hero-cta-group">
              <button className="atlas-btn-primary subtle-neon-glow" onClick={() => scrollTo('contact')} style={{ padding: '0.9rem 2.5rem', fontSize: '1rem' }}>
                Request a demo
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
                'Campus server and database',
              ].map((label) => (
                <div key={label} style={{
                  background: 'rgba(0,0,0,0.06)',
                  border: '1px solid rgba(0,0,0,0.12)',
                  borderRadius: 100,
                  padding: '7px 12px',
                  fontSize: '0.78rem',
                  color: 'rgba(17,17,17,0.68)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <Check size={14} color="var(--brand-accent)" strokeWidth={2.5} aria-hidden="true" />
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
                filter: 'drop-shadow(0 20px 40px rgba(142,28,27,0.25))',
                transform: 'translateX(0)'
              }}
            />
          </div>
        </div>

        <div className="scroll-indicator">
          <span style={{ fontSize: '0.7rem', letterSpacing: '0.1em', color: 'rgba(17,17,17,0.48)' }}>SCROLL</span>
          <div style={{ width: 1, height: 40, background: 'linear-gradient(to bottom, rgba(17,17,17,0.38), transparent)' }} />
        </div>
      </section>

      {/* ── STATS ───────────────────────────────────────────────────────────── */}
      <section ref={statsRef} style={{ padding: '4rem 2rem', background: 'rgba(142,28,27,0.06)', borderTop: '1px solid rgba(0,0,0,0.072)', borderBottom: '1px solid rgba(0,0,0,0.072)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
            {[
              { title: 'Campus server', label: 'Application traffic stays on the server for this campus' },
              { title: 'Campus database', label: 'Courses, grades, scans, and exam keys stay on this system' },
              { title: 'Web and Mobile', label: 'Syllabus, modules, assessments, and OMR on one stack' },
              { title: 'Room to grow', label: 'More faculty can be added without a second system' },
            ].map(({ title, label }, i) => (
              <div key={i} className={`stat-card fade-up subtle-neon-glow ${statsInView ? 'visible' : ''}`}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--brand-accent)', lineHeight: 1.3 }}>
                  {title}
                </div>
                <div style={{ color: 'rgba(17,17,17,0.58)', fontSize: '0.85rem', marginTop: '0.55rem', lineHeight: 1.5 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────────── */}
      <section id="features" style={{ padding: '7rem 2rem', position: 'relative', overflow: 'hidden' }}>
        <Orb style={{ width: 500, height: 500, background: 'rgba(142,28,27,0.1)', top: '10%', right: -150 }} />

        <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ color: 'var(--brand-accent)', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '0.75rem' }}>CAPABILITIES</p>
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
                  border: '1px solid rgba(170,36,35,0.25)',
                  borderRadius: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '1.2rem',
                }}>
                  <f.icon size={22} color="var(--brand-accent)" strokeWidth={1.75} aria-hidden="true" />
                </div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.75rem', color: '#1A1A1A' }}>{f.title}</h3>
                <p style={{ color: 'rgba(17,17,17,0.63)', fontSize: '0.9rem', lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ────────────────────────────────────────────────────── */}
      <section id="testimonials" style={{ padding: '7rem 2rem', background: 'rgba(0,0,0,0.045)', borderTop: '1px solid rgba(0,0,0,0.072)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ color: 'var(--brand-accent)', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '0.75rem' }}>SOCIAL PROOF</p>
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
                    <Star key={star} size={16} color="var(--brand-accent)" fill="var(--brand-accent)" aria-hidden="true" />
                  ))}
                </div>
                <p style={{ color: 'rgba(17,17,17,0.78)', lineHeight: 1.75, fontSize: '0.92rem', fontStyle: 'italic', margin: '0 0 1.5rem' }}>
                  "{t.quote}"
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'rgba(170,36,35,0.25)',
                    border: '1px solid rgba(170,36,35,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.9rem', color: 'var(--brand-accent)', fontWeight: 700,
                  }}>
                    {t.author[0]}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1A1A1A' }}>{t.author}</div>
                    <div style={{ fontSize: '0.8rem', color: 'rgba(17,17,17,0.48)' }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ padding: '7rem 2rem', position: 'relative', overflow: 'hidden' }}>
        <Orb style={{ width: 600, height: 600, background: 'rgba(142,28,27,0.12)', bottom: -200, left: -150 }} />

        <div style={{ maxWidth: 1180, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ color: 'var(--brand-accent)', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '0.75rem' }}>PACKAGES</p>
            <h2 className="section-title" style={{ fontSize: '2.6rem', fontWeight: 800, margin: 0 }}>
              A Private Deployment for Your Institution
            </h2>
            <p style={{ color: 'rgba(17,17,17,0.58)', marginTop: '0.75rem', fontSize: '0.95rem', maxWidth: 720, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.7 }}>
              Starter, Professional, or Custom. Setup, an annual license, and maintenance are quoted together.
            </p>
            <div className="divider" />
          </div>

          <div
            ref={pricingRef}
            className="pricing-grid"
          >
            {PACKAGES.map((plan) => (
              <div
                key={plan.name}
                className={`pricing-slot fade-up ${pricingInView ? 'visible' : ''} ${plan.featured ? 'is-featured' : ''}`}
              >
                <div className={`pricing-card ${plan.featured ? 'popular' : ''}`}>
                  <div className="pricing-head">
                    <h3 className="pricing-kicker">
                      <Sparkles size={14} strokeWidth={2.25} aria-hidden="true" />
                      {plan.name}
                    </h3>
                    {plan.badge && <span className="popular-badge">{plan.badge}</span>}
                  </div>

                  <p className="pricing-tagline">{plan.tagline}</p>

                  <div className="pricing-price">
                    <strong>{plan.price}</strong>
                    <span>/{plan.period}</span>
                  </div>

                  <div className="pricing-highlights">
                    {plan.highlights.map((item) => (
                      <div key={item.label} className="pricing-highlight">
                        <item.icon size={16} strokeWidth={1.75} aria-hidden="true" />
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    className={plan.featured ? 'atlas-btn-primary pricing-cta' : 'atlas-btn-outline pricing-cta'}
                    onClick={() => requestQuote(plan.name)}
                  >
                    {plan.featured ? 'Get started' : 'Request a quote'}
                  </button>
                  <p className="pricing-best">{plan.bestFor}</p>

                  <div className="pricing-included">
                    <h4>What&apos;s included:</h4>
                    {plan.features.map((feat) => (
                      <div key={feat} className="pricing-feature">
                        <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p style={{ textAlign: 'center', color: 'rgba(17,17,17,0.53)', fontSize: '0.88rem', marginTop: '2.5rem', lineHeight: 1.7, maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
            Starter, Professional, or Custom. A larger package adds capacity for this campus.
          </p>
        </div>
      </section>

      {/* ── TEAM ────────────────────────────────────────────────────────────── */}
      <section id="team" style={{ padding: '7rem 2rem', borderTop: '1px solid rgba(0,0,0,0.072)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ color: 'var(--brand-accent)', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '0.75rem' }}>THE TEAM</p>
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
                  background: 'rgba(170,36,35,0.1)',
                  border: '1px solid rgba(170,36,35,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 1.5rem',
                  overflow: 'hidden',
                }}>
                  <img src={member.image} alt={member.name} width={800} height={1000} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
                </div>
                <h3 style={{ fontWeight: 700, fontSize: '1.2rem', margin: '0 0 0.4rem', color: '#1A1A1A' }}>{member.name}</h3>
                <p style={{ color: 'var(--brand-accent)', fontSize: '0.9rem', margin: 0, fontWeight: 600, letterSpacing: '0.04em' }}>{member.title}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTACT / CTA ───────────────────────────────────────────────────── */}
      <section id="contact" style={{ padding: '7rem 2rem', background: 'rgba(0,0,0,0.045)', borderTop: '1px solid rgba(0,0,0,0.072)', position: 'relative', overflow: 'hidden' }}>
        <Orb style={{ width: 500, height: 500, background: 'rgba(142,28,27,0.15)', top: -100, right: -100 }} />

        <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div className="contact-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5rem', alignItems: 'center' }}>
            <div>
              <p style={{ color: 'var(--brand-accent)', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '0.75rem' }}>GET IN TOUCH</p>
              <h2 style={{ fontSize: '2.4rem', fontWeight: 800, margin: '0 0 1.2rem', lineHeight: 1.2 }}>
                Request a<br />
                <span className="glow-text">Demo</span>
              </h2>
              <p style={{ color: 'rgba(17,17,17,0.63)', lineHeight: 1.8, fontSize: '0.95rem', marginBottom: '2rem' }}>
                Tell us which package fits {TENANT_INSTITUTION_NAME}: Starter, Professional, or Custom.
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
                      background: 'rgba(170,36,35,0.15)',
                      border: '1px solid rgba(170,36,35,0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon size={18} color="var(--brand-accent)" strokeWidth={1.75} aria-hidden="true" />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(17,17,17,0.43)', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: '0.92rem', color: '#1A1A1A' }}>{value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <GlassCard style={{ padding: '2.5rem' }}>
              <form onSubmit={handleContactSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', position: 'relative' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.5rem', color: '#1A1A1A' }}>Request a demo or quote</h3>
                <input className="contact-input" name="name" value={contactForm.name} onChange={handleContactChange} placeholder="Your Name" maxLength={120} autoComplete="name" />
                <input className="contact-input" name="email" type="email" value={contactForm.email} onChange={handleContactChange} placeholder="Email" maxLength={254} autoComplete="email" />
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
                <textarea className="contact-input" name="message" rows={4} maxLength={2000} value={contactForm.message} onChange={handleContactChange} placeholder="How can we help?" />
                {contactStatus.message && (
                  <div style={{
                    padding: '0.7rem 0.9rem',
                    borderRadius: 10,
                    fontSize: '0.82rem',
                    border: contactStatus.type === 'success'
                      ? '1px solid rgba(88, 204, 135, 0.5)'
                      : '1px solid rgba(239, 68, 68, 0.5)',
                    background: contactStatus.type === 'success'
                      ? 'rgba(170,36,35,0.12)'
                      : 'rgba(239, 68, 68, 0.12)',
                    color: contactStatus.type === 'success' ? '#c9f7d6' : '#ffd1d1',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}>
                    {contactStatus.type === 'success'
                      ? <Check size={16} color="var(--brand-accent)" strokeWidth={2.5} aria-hidden="true" />
                      : <span style={{ fontSize: '1rem' }}>!</span>}
                    <span>{contactStatus.message}</span>
                  </div>
                )}
                <button type="submit" className="atlas-btn-primary" style={{ width: '100%', padding: '0.9rem', fontSize: '0.95rem' }} disabled={contactSubmitting}>
                  {contactSubmitting ? 'Sending...' : 'Request a demo'}
                </button>
              </form>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid rgba(0,0,0,0.084)',
        padding: '2.5rem 2rem',
        background: '#FFFFFF',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img src={atlasLogo} alt="ATLAS" width={640} height={188} loading="lazy" decoding="async" style={{ height: 28, width: 'auto', objectFit: 'contain', display: 'block' }} />
            <span style={{ color: 'rgba(17,17,17,0.55)', fontSize: '0.82rem' }}>© 2026 ATLAS. All rights reserved.</span>
          </div>
          <div style={{ display: 'flex', gap: '2rem' }}>
            <Link to="/legal/privacy" style={{ color: 'rgba(17,17,17,0.62)', fontSize: '0.82rem', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link to="/legal/terms" style={{ color: 'rgba(17,17,17,0.62)', fontSize: '0.82rem', textDecoration: 'none' }}>Terms and Conditions</Link>
            <Link to="/contact" style={{ color: 'rgba(17,17,17,0.62)', fontSize: '0.82rem', textDecoration: 'none' }}>Contact</Link>
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