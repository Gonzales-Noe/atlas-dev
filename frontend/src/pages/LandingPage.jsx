import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ROUTES } from '../config/route'
import { useAuth } from '../store/authStore'
import atlasLogo from '../assets/atlas-logo.png'
import atlasMascot from '../assets/atlas.png'

// ── Laptop Mockup ─────────────────────────────────────────────────────────────
function LaptopMockup({ children }) {
  return (
    <div className="relative w-full max-w-[420px] mx-auto select-none">
      {/* Screen bezel */}
      <div className="relative bg-[#1a1a1a] rounded-t-xl rounded-b-sm pt-3 px-3 pb-2 shadow-2xl border border-[#333]">
        {/* Camera dot */}
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#444]" />
        {/* Screen */}
        <div className="bg-[#f5f5f5] rounded-md overflow-hidden" style={{ aspectRatio: '16/10' }}>
          {children}
        </div>
      </div>
      {/* Hinge */}
      <div className="h-[6px] bg-gradient-to-b from-[#2a2a2a] to-[#1a1a1a] rounded-b-sm" />
      {/* Base */}
      <div className="h-[10px] bg-gradient-to-b from-[#222] to-[#111] rounded-b-xl mx-[-6px] shadow-lg" />
      {/* Foot shadow */}
      <div className="h-[3px] bg-black/20 blur-sm rounded-full mx-4 mt-0.5" />
    </div>
  )
}

// ── App Screen Preview ────────────────────────────────────────────────────────
function AppScreenPreview({ mascotSmall = false }) {
  return (
    <div className="w-full h-full flex bg-white relative overflow-hidden">
      {/* Fake sidebar */}
      <div className="w-[22%] bg-[#8B0000] h-full flex flex-col items-center py-2 gap-1.5 flex-shrink-0">
        <div className="w-6 h-6 rounded-full bg-white/20 mt-1" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className={`w-[70%] h-1.5 rounded-full ${i === 0 ? 'bg-white/70' : 'bg-white/20'}`} />
        ))}
      </div>
      {/* Fake content */}
      <div className="flex-1 p-2 flex flex-col gap-1.5 bg-[#f8f8f8]">
        <div className="w-[55%] h-2 bg-[#8B0000]/30 rounded-full" />
        <div className="w-[35%] h-1.5 bg-gray-200 rounded-full" />
        <div className="flex gap-1.5 mt-1">
          {['#8B0000', '#c0392b', '#922b21'].map((c, i) => (
            <div key={i} className="flex-1 h-8 rounded" style={{ background: c, opacity: 0.15 + i * 0.1 }} />
          ))}
        </div>
        <div className="flex-1 bg-white rounded border border-gray-100 p-1.5 flex flex-col gap-1">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-1 items-center">
              <div className="w-1.5 h-1.5 rounded-full bg-[#8B0000]/40" />
              <div className="flex-1 h-1 bg-gray-200 rounded-full" />
            </div>
          ))}
        </div>
        {/* Join button */}
        <div className="self-start bg-[#8B0000] text-white text-[6px] px-1.5 py-0.5 rounded font-bold">
          Join ATLAS
        </div>
      </div>
      {/* Mascot overlay */}
      <img
        src={atlasMascot}
        alt=""
        className="absolute right-0 bottom-0 h-[55%] object-contain pointer-events-none"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
      />
    </div>
  )
}

// ── Feature Row ───────────────────────────────────────────────────────────────
function FeatureRow({ title, description, reverse = false, index }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.15 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`flex flex-col md:flex-row items-center gap-10 md:gap-16 py-12 md:py-16 transition-all duration-700 ease-out
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}
        ${reverse ? 'md:flex-row-reverse' : ''}`}
      style={{ transitionDelay: `${index * 80}ms` }}
    >
      {/* Laptop */}
      <div className="w-full md:w-[52%] flex justify-center">
        <LaptopMockup>
          <AppScreenPreview />
        </LaptopMockup>
      </div>

      {/* Text */}
      <div className="w-full md:w-[48%] text-center md:text-left px-2 md:px-0">
        <div className="inline-flex items-center gap-2 mb-4">
          <span className="text-3xl">{['🎓','📋','✅','📊'][index]}</span>
        </div>
        <h3 className="text-[#8B0000] text-2xl md:text-3xl font-bold mb-4 leading-tight">
          {title}
        </h3>
        <p className="text-gray-600 text-base leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  )
}

// ── Testimonial Card ──────────────────────────────────────────────────────────
function TestimonialCard({ quote, author, role, delay }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.1 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`bg-[#8B0000] text-white rounded-xl p-6 flex flex-col gap-3 shadow-lg
        transition-all duration-700 ease-out
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="text-yellow-400 text-lg tracking-widest">★★★★★</div>
      <p className="text-white/90 text-sm leading-relaxed italic flex-1">
        "{quote}"
      </p>
      <div className="border-t border-white/20 pt-3 mt-auto">
        <p className="font-bold text-sm">{author}</p>
        <p className="text-white/70 text-xs mt-0.5">{role}</p>
      </div>
    </div>
  )
}

// ── Team Card ─────────────────────────────────────────────────────────────────
function TeamCard({ name, title, initials, delay }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.1 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`bg-gradient-to-b from-[#8B0000] to-[#6B0000] text-white rounded-xl overflow-hidden shadow-lg
        transition-all duration-700 ease-out hover:-translate-y-1 hover:shadow-2xl cursor-default
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Avatar area */}
      <div className="h-44 flex items-center justify-center bg-[#7a0000]/40">
        <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center">
          <span className="text-white font-bold text-xl">{initials}</span>
        </div>
      </div>
      {/* Info */}
      <div className="px-5 py-4 text-center">
        <p className="font-bold text-base">{name}</p>
        <p className="text-white/70 text-xs mt-1 uppercase tracking-wider">{title}</p>
      </div>
    </div>
  )
}

// ── Section Heading ───────────────────────────────────────────────────────────
function SectionHeading({ label, title, subtitle }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.2 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`text-center mb-12 transition-all duration-700 ease-out
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
    >
      {label && (
        <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#8B0000] bg-[#8B0000]/10 px-3 py-1 rounded-full mb-4 inline-block">
          {label}
        </span>
      )}
      <h2 className="text-[#8B0000] text-3xl md:text-4xl font-bold mt-3 mb-3">{title}</h2>
      {subtitle && <p className="text-gray-500 text-base max-w-xl mx-auto leading-relaxed">{subtitle}</p>}
    </div>
  )
}

// ── Main Landing Page ─────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuth()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [heroVisible, setHeroVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setHeroVisible(true), 100)
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => { clearTimeout(timer); window.removeEventListener('scroll', onScroll) }
  }, [])

  const handleGetStarted = () => {
    if (isAuthenticated) {
      if (user?.role === 'superadmin') navigate('/superadmin/dashboard')
      else if (user?.role === 'admin') navigate('/admin/dashboard')
      else navigate('/faculty/dashboard')
    } else {
      navigate('/signup')
    }
  }

  const features = [
    {
      title: 'Set Up Your Course',
      description: 'Input your course title, program outcomes, credit units, and intended students. ATLAS ingests and configures everything it needs to build around your specific course — no generic templates, no wasted time.',
    },
    {
      title: 'Generate Your Syllabus & Modules',
      description: 'In minutes, ATLAS produces a complete week-by-week, CHED OBE-compliant structure — all grounded in your course materials. Expanded lesson modules included, ready for classroom use.',
    },
    {
      title: 'Build Your Assessments',
      description: "Generate ILO-mapped exams in multiple-choice, essay, or mixed formats. Every item is tagged by Bloom's Taxonomy level and comes with an automated answer key or essay rubric.",
    },
    {
      title: 'Understand Your Class',
      description: 'Connect your gradebook. ATLAS computes weighted scores, identifies which learning outcomes your class is struggling with, and tells you exactly what to do next — by learning outcome, not just by score.',
    },
  ]

  const testimonials = [
    {
      quote: "I used to spend entire weekends preparing for one course. With ATLAS, I had a complete, properly aligned syllabus ready in under 20 minutes. That time went back to my students.",
      author: 'Faculty Member',
      role: 'College of Education',
    },
    {
      quote: "The prescriptive dashboard showed me exactly which topics my class was failing on — by learning outcome, not just by score. I've never had that kind of clarity from any tool before.",
      author: 'Instructor',
      role: 'College of Arts and Sciences',
    },
    {
      quote: "Our department adopted ATLAS mid-semester. Provisioning our faculty was straightforward, and they were generating exams and syllabi on the same day. The onboarding friction was genuinely minimal.",
      author: 'College Head',
      role: 'College of Information',
    },
  ]

  const team = [
    { name: 'Hearty Isabel Delacion', title: 'Co-Founder & CEO', initials: 'HI' },
    { name: 'Jasmin B. Esperida',     title: 'Co-Founder & CEO', initials: 'JE' },
    { name: 'Noe L. Gonzales',        title: 'Co-Founder & CEO', initials: 'NL' },
  ]

  return (
    <div className="min-h-screen bg-white font-sans overflow-x-hidden">

      {/* ── Navbar ── */}
      <nav className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur shadow-sm border-b border-gray-100' : 'bg-white border-b border-gray-100'}`}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3.5 flex items-center justify-between">
          <Link to="/" className="flex items-center">
            <img src={atlasLogo} alt="ATLAS" className="h-9 object-contain" />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6 lg:gap-8">
            {[
              { label: 'HOME', href: '#home' },
              { label: 'FEATURES', href: '#features' },
              { label: 'TESTIMONIALS', href: '#testimonials' },
              { label: 'TEAM', href: '#team' },
            ].map(item => (
              <a
                key={item.label}
                href={item.href}
                className="text-gray-600 hover:text-[#8B0000] text-sm font-semibold tracking-wide transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <button
                onClick={handleGetStarted}
                className="bg-[#8B0000] text-white text-sm font-bold px-5 py-2 rounded hover:bg-[#6B0000] transition-colors"
              >
                Dashboard →
              </button>
            ) : (
              <>
                <Link to={ROUTES.SIGN_IN}>
                  <button className="text-[#8B0000] border border-[#8B0000] text-sm font-bold px-4 py-2 rounded hover:bg-[#8B0000]/5 transition-colors">
                    SIGN IN
                  </button>
                </Link>
                <Link to={ROUTES.SIGN_UP}>
                  <button className="bg-[#8B0000] text-white text-sm font-bold px-4 py-2 rounded hover:bg-[#6B0000] transition-colors">
                    SIGN UP
                  </button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden text-gray-700 hover:text-[#8B0000] p-2 rounded"
          >
            {isMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 pb-4">
            {['HOME', 'FEATURES', 'TESTIMONIALS', 'TEAM'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} onClick={() => setIsMenuOpen(false)}
                className="block py-3 text-gray-700 font-semibold hover:text-[#8B0000] border-b border-gray-50 text-sm">
                {item}
              </a>
            ))}
            <div className="flex gap-3 mt-4">
              <Link to={ROUTES.SIGN_IN} className="flex-1">
                <button className="w-full border border-[#8B0000] text-[#8B0000] font-bold py-2 rounded text-sm">SIGN IN</button>
              </Link>
              <Link to={ROUTES.SIGN_UP} className="flex-1">
                <button className="w-full bg-[#8B0000] text-white font-bold py-2 rounded text-sm">SIGN UP</button>
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ── */}
      <section id="home" className="max-w-7xl mx-auto px-4 md:px-8 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="flex flex-col md:flex-row items-center gap-10 md:gap-8">

          {/* Left */}
          <div className={`w-full md:flex-1 text-center md:text-left transition-all duration-1000 ease-out
            ${heroVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-10'}`}>
            <div className="inline-flex items-center gap-2 bg-[#8B0000]/10 border border-[#8B0000]/20 text-[#8B0000] text-xs font-bold px-3 py-1.5 rounded-full mb-6 tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8B0000] animate-pulse" />
              NOW IN EARLY ACCESS
            </div>
            <h1 className="text-[#8B0000] text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[1.1] mb-6">
              Bring the Passion.<br />
              <span className="italic font-bold">We'll Bring the Platform.</span>
            </h1>
            <p className="text-gray-600 text-base md:text-lg leading-relaxed max-w-lg mx-auto md:mx-0 mb-10">
              The all-in-one instructional engine that turns objectives into aligned modules, balanced exams, and actionable insights — built for Philippine Higher Education.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
              <button
                onClick={handleGetStarted}
                className="bg-[#8B0000] text-white font-bold py-3.5 px-8 rounded border border-[#6B0000] hover:bg-[#6B0000] transition-all shadow-md hover:shadow-lg active:scale-95 text-base"
              >
                Join ATLAS Now →
              </button>
              <a href="#features">
                <button className="bg-white text-gray-800 font-semibold py-3.5 px-8 rounded border border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-all text-base w-full sm:w-auto">
                  See How it Works
                </button>
              </a>
            </div>

            {/* Stats strip */}
            <div className="flex gap-8 justify-center md:justify-start mt-12 pt-8 border-t border-gray-100">
              {[
                { value: 'OBE', label: 'CHED Compliant' },
                { value: '< 20m', label: 'Syllabus Generated' },
                { value: '3-in-1', label: 'Syllabus · Module · Exam' },
              ].map(s => (
                <div key={s.label} className="text-center md:text-left">
                  <p className="text-[#8B0000] text-xl font-extrabold">{s.value}</p>
                  <p className="text-gray-400 text-xs mt-0.5 leading-tight">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right — mascot */}
          <div className={`w-full md:flex-1 flex justify-center md:justify-end transition-all duration-1000 ease-out delay-200
            ${heroVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-10'}`}>
            <div className="relative">
              {/* Glow */}
              <div className="absolute inset-0 bg-[#8B0000]/10 rounded-full blur-3xl scale-110 pointer-events-none" />
              <img
                src={atlasMascot}
                alt="ATLAS Mascot"
                className="relative w-full max-w-[320px] md:max-w-[420px] object-contain drop-shadow-xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="w-full h-px bg-gradient-to-r from-transparent via-[#8B0000]/20 to-transparent" />

      {/* ── Features ── */}
      <section id="features" className="bg-gray-50/70 py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <SectionHeading
            label="How It Works"
            title="Everything Your Course Needs"
            subtitle="From objectives to outcomes — ATLAS handles the full instructional design pipeline so you can focus on teaching."
          />

          <div className="divide-y divide-gray-100">
            {features.map((f, i) => (
              <FeatureRow key={f.title} {...f} reverse={i % 2 !== 0} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="w-full h-px bg-gradient-to-r from-transparent via-[#8B0000]/20 to-transparent" />

      {/* ── Testimonials ── */}
      <section id="testimonials" className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <SectionHeading
            label="Early Access Feedback"
            title="What Educators Are Saying"
            subtitle="Feedback from faculty who participated in our early access and needs assessment phase."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <TestimonialCard key={t.author} {...t} delay={i * 120} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="w-full h-px bg-gradient-to-r from-transparent via-[#8B0000]/20 to-transparent" />

      {/* ── Team ── */}
      <section id="team" className="bg-gray-50/70 py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-4 md:px-8">
          <SectionHeading
            label="The People Behind ATLAS"
            title="Built by Students. Made for Teachers."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
            {team.map((m, i) => (
              <TeamCard key={m.name} {...m} delay={i * 100} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="bg-[#8B0000] py-16 md:py-20 relative overflow-hidden">
        {/* Subtle pattern */}
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

        <div className="max-w-6xl mx-auto px-4 md:px-8 relative">
          <div className="flex flex-col md:flex-row items-center justify-between gap-10">

            <div className="text-center md:text-left">
              <h2 className="text-white text-3xl md:text-4xl font-extrabold mb-4 leading-tight">
                Ready to Transform<br />Your Teaching?
              </h2>
              <p className="text-white/80 text-base mb-8 max-w-md">
                Join educators who are already saving hours every week with ATLAS — your AI-powered instructional design partner.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
                <button
                  onClick={handleGetStarted}
                  className="bg-white text-[#8B0000] font-bold py-3.5 px-8 rounded hover:bg-gray-100 transition-all shadow-md active:scale-95 text-base"
                >
                  Sign Up — It's Free
                </button>
                <Link to={ROUTES.SIGN_IN}>
                  <button className="border border-white/40 text-white font-semibold py-3.5 px-8 rounded hover:bg-white/10 transition-all text-base w-full sm:w-auto">
                    Sign In
                  </button>
                </Link>
              </div>
            </div>

            {/* Mascot CTA */}
            <div className="flex-shrink-0">
              <img
                src={atlasMascot}
                alt="ATLAS Mascot"
                className="w-48 md:w-56 object-contain drop-shadow-xl"
                style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.3))' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-[#1a1a1a] text-white py-10">
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <img src={atlasLogo} alt="ATLAS" className="h-8 object-contain brightness-0 invert opacity-80" />

            <div className="flex gap-6 text-sm text-white/50">
              {['Privacy Policy', 'Terms and Conditions', 'Contact'].map(item => (
                <a key={item} href="#" className="hover:text-white/80 transition-colors">{item}</a>
              ))}
            </div>

            <p className="text-white/40 text-sm">
              © 2026 ATLAS. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}