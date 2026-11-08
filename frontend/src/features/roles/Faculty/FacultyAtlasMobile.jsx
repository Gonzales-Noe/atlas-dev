import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import Typography from '@mui/material/Typography'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import CloseIcon from '@mui/icons-material/Close'
import NewReleasesOutlinedIcon from '@mui/icons-material/NewReleasesOutlined'
import QrCode2OutlinedIcon from '@mui/icons-material/QrCode2Outlined'
import Dialog from '@mui/material/Dialog'
import QRCode from 'qrcode'
import FacultyLayout from './FacultyLayout'
import api from '../../../config/api'
import { StatusNotice } from '../../../components/StatusNotice'
import { GlassCard } from '../../../components/ui'

const MOBILE_RELEASE_REFRESH = 'atlas-mobile-release-refresh'

const PREVIEWS = [
  {
    title: 'Get Started',
    body: 'Welcome to ATLAS Mobile — scan Major Exam MCQ sheets in class.',
    image: '/mobile/previews/00-landing.jpg',
  },
  {
    title: 'Sign In',
    body: 'Faculty access with your ATLAS account or Google.',
    image: '/mobile/previews/01-login.jpg',
  },
  {
    title: 'Home & Scan',
    body: 'Open your course and start Scan Exam Sheets in one tap.',
    image: '/mobile/previews/02-home.jpg',
  },
  {
    title: 'Live Scanner',
    body: 'Lock onto a printed bubble sheet and capture answers in the room.',
    image: '/mobile/previews/03-scanner.jpg',
  },
  {
    title: 'Instant Score',
    body: 'See student ID, score, and marked answers right after the scan.',
    image: '/mobile/previews/04-score-result.jpg',
  },
  {
    title: 'Course Scores',
    body: 'Track section progress and scanned scores on the roster.',
    image: '/mobile/previews/05-course-scores.jpg',
  },
  {
    title: 'Assessment Analytics',
    body: 'Pass rate, mean score, and distribution for the class.',
    image: '/mobile/previews/06-reports.jpg',
  },
  {
    title: 'Major Exams',
    body: 'Create and open major examinations from one hub.',
    image: '/mobile/previews/07-major-exams.jpg',
  },
  {
    title: 'Works Offline',
    body: 'Keep scanning when the room has no signal — sync later.',
    image: '/mobile/previews/08-offline.jpg',
  },
  {
    title: 'Scan Detail',
    body: 'Review flagged items, blanks, and double marks per paper.',
    image: '/mobile/previews/09-scan-detail.jpg',
  },
]

const ABOUT_APP = (
  'ATLAS Mobile is the phone companion for ATLAS Web. It is scoped to Major Examinations with '
  + 'multiple-choice (MCQ) sheets only — scan printed papers in the classroom and review results on your phone. '
  + 'Exams, answer keys, and scores stay in sync with ATLAS Web. It is an internal app — not listed on the public app stores.'
)

const CORE_FEATURES = [
  'Scan MCQ sheets',
  'Review scores',
  'Sync with Web',
  'Works offline',
  'In-App Assessment Analytics',
  'Create Major exams',
]

function formatPublished(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function updateDismissKey(versionName) {
  return `atlas-mobile-update-dismissed:${versionName || 'unknown'}`
}

function parseReleaseNotes(notes) {
  return String(notes || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean)
}

const pillBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-elevated, var(--bg-card))',
  color: 'var(--text-primary)',
  borderRadius: 999,
  padding: '6px 12px',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '0.78rem',
  lineHeight: 1,
  flexShrink: 0,
}

export default function FacultyAtlasMobile() {
  const location = useLocation()
  const [release, setRelease] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [slide, setSlide] = useState(0)
  const [updateBannerVisible, setUpdateBannerVisible] = useState(false)
  const [whatsNewAnchor, setWhatsNewAnchor] = useState(null)
  const [installOpen, setInstallOpen] = useState(false)

  const loadRelease = useCallback((opts = {}) => {
    const quiet = Boolean(opts.quiet)
    if (!quiet) setLoading(true)
    return api.get('/auth/mobile-app/', { atlasCache: false, skipAtlasErrorCard: true })
      .then(({ data }) => {
        setRelease(data || null)
        setError('')
        return data
      })
      .catch(() => {
        if (!quiet) setError('Could not load the ATLAS Mobile page. Try again in a moment.')
      })
      .finally(() => {
        if (!quiet) setLoading(false)
      })
  }, [])

  useEffect(() => {
    loadRelease()
  }, [loadRelease, location.search])

  useEffect(() => {
    const refreshQuietly = () => { loadRelease({ quiet: true }) }
    const timer = window.setInterval(refreshQuietly, 15000)
    const onFocus = () => refreshQuietly()
    const onRefresh = () => refreshQuietly()
    window.addEventListener('focus', onFocus)
    window.addEventListener(MOBILE_RELEASE_REFRESH, onRefresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener(MOBILE_RELEASE_REFRESH, onRefresh)
    }
  }, [loadRelease])

  useEffect(() => {
    if (!release?.available || !release?.release_notes || !release?.version_name) {
      setUpdateBannerVisible(false)
      return
    }
    try {
      const dismissed = window.localStorage.getItem(updateDismissKey(release.version_name)) === '1'
      setUpdateBannerVisible(!dismissed)
    } catch {
      setUpdateBannerVisible(true)
    }
  }, [release])

  const downloadUrl = useMemo(() => {
    if (release?.download_url) return release.download_url
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/api/auth/mobile-app/download/`
  }, [release])

  const whatsNewItems = useMemo(
    () => parseReleaseNotes(release?.release_notes),
    [release?.release_notes],
  )

  useEffect(() => {
    if (!release?.available || !downloadUrl) {
      setQrDataUrl('')
      return undefined
    }
    let cancelled = false
    QRCode.toDataURL(downloadUrl, {
      width: 220,
      margin: 1,
      color: { dark: '#1A1A1A', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('')
      })
    return () => { cancelled = true }
  }, [downloadUrl, release?.available])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSlide((current) => (current + 1) % PREVIEWS.length)
    }, 4500)
    return () => window.clearInterval(timer)
  }, [])

  const available = Boolean(release?.available)
  const versionLabel = release?.version_name ? `Version ${release.version_name}` : 'Not published yet'
  const activePreview = PREVIEWS[slide]
  const prevPreview = PREVIEWS[(slide + PREVIEWS.length - 1) % PREVIEWS.length]
  const nextPreview = PREVIEWS[(slide + 1) % PREVIEWS.length]
  const whatsNewOpen = Boolean(whatsNewAnchor)

  function dismissUpdateBanner() {
    if (release?.version_name) {
      try {
        window.localStorage.setItem(updateDismissKey(release.version_name), '1')
      } catch {
        // Ignore storage failures; banner still closes for this visit.
      }
    }
    setUpdateBannerVisible(false)
  }

  return (
    <FacultyLayout>
      <Box
        sx={{
          height: { xs: 'auto', md: 'calc(100vh - 60px - var(--atlas-titlebar-h, 0px) - 56px)' },
          minHeight: { xs: 'auto', md: 0 },
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
          overflow: { xs: 'visible', md: 'hidden' },
        }}
      >
        <StatusNotice message={error} severity="error" />

        {updateBannerVisible ? (
          <Box
            sx={{
              flexShrink: 0,
              p: '10px 14px',
              borderRadius: 2.5,
              border: '1px solid rgba(226,75,74,0.35)',
              background: 'rgba(226,75,74,0.08)',
              display: 'flex',
              gap: 1,
              alignItems: 'center',
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.86rem', color: 'var(--brand-primary)' }}>
                Update available — {versionLabel}
              </Typography>
              <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.35 }}>
                A new build is ready. Open How to Install to scan the QR code, or check What’s New for details.
              </Typography>
            </Box>
            <IconButton
              aria-label="Dismiss update notice"
              onClick={dismissUpdateBanner}
              size="small"
              sx={{ color: 'var(--text-secondary)' }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        ) : null}

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 0.95fr) minmax(0, 1.35fr)' },
            gridTemplateRows: { xs: 'auto', md: '1fr' },
            gap: 1.5,
          }}
        >
          {/* Column 1 — info cards */}
          <Box
            sx={{
              minHeight: 0,
              display: 'grid',
              gridTemplateRows: { xs: 'auto', md: 'auto minmax(0, 1fr) auto' },
              gap: 1.25,
            }}
          >
            <GlassCard style={{ marginBottom: 0 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                  <Box
                    component="img"
                    src="/mobile/ATLAS_Mobile_Logo.png"
                    alt="ATLAS Mobile"
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: 2,
                      objectFit: 'cover',
                      border: '1px solid var(--border-color)',
                      flexShrink: 0,
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.2 }}>
                      ATLAS Mobile
                    </Typography>
                    <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.78rem', mt: 0.3 }}>
                      Internal app · {versionLabel}
                      {release?.file_size_label ? ` · ${release.file_size_label}` : ''}
                    </Typography>
                    {release?.published_at ? (
                      <Typography sx={{ color: 'var(--text-tertiary)', fontSize: '0.72rem', mt: 0.25 }}>
                        Updated {formatPublished(release.published_at)}
                      </Typography>
                    ) : null}
                    {!available && !loading ? (
                      <Typography sx={{ mt: 0.5, color: 'var(--text-secondary)', fontSize: '0.76rem' }}>
                        Not published yet — ask IT to publish in System Health.
                      </Typography>
                    ) : null}
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
                  {whatsNewItems.length ? (
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      aria-expanded={whatsNewOpen}
                      onClick={(event) => setWhatsNewAnchor(event.currentTarget)}
                      style={pillBtnStyle}
                    >
                      <NewReleasesOutlinedIcon sx={{ fontSize: 16, color: 'var(--brand-primary)' }} />
                      What’s New
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={installOpen}
                    onClick={() => setInstallOpen(true)}
                    style={pillBtnStyle}
                  >
                    <QrCode2OutlinedIcon sx={{ fontSize: 16, color: 'var(--brand-primary)' }} />
                    How to Install
                  </button>
                </Box>
              </Box>
            </GlassCard>

            <GlassCard fill title="Description" style={{ height: '100%', minHeight: 0, marginBottom: 0 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.1, height: '100%', minHeight: 0, flex: 1 }}>
                <Typography sx={{ m: 0, color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                  {ABOUT_APP}
                </Typography>
                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.84rem', mb: 0.5 }}>Features</Typography>
                  <Box
                    component="ul"
                    sx={{
                      m: 0,
                      pl: 2.25,
                      color: 'var(--text-primary)',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      lineHeight: 1.45,
                      listStyleType: 'disc',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      columnGap: 1.25,
                      rowGap: 0.25,
                    }}
                  >
                    {CORE_FEATURES.map((feature) => (
                      <Box component="li" key={feature} sx={{ display: 'list-item' }}>
                        {feature}
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>
            </GlassCard>

            <GlassCard title="Requirements" style={{ marginBottom: 0 }}>
              <Box
                component="ul"
                sx={{
                  m: 0,
                  pl: 2.1,
                  color: 'var(--text-secondary)',
                  fontSize: '0.8rem',
                  lineHeight: 1.5,
                }}
              >
                <li>Android 9+ / iPhone installer support</li>
                <li>
                  Storage:
                  {' '}
                  {release?.file_size_label || 'about 50 MB'}
                </li>
                <li>Camera — scan Major Exam MCQ sheets</li>
                <li>Internet — sign in & update exams online</li>
              </Box>
            </GlassCard>
          </Box>

          {/* Column 2 — preview card */}
          <Box
            sx={{
              position: 'relative',
              height: { xs: 'auto', md: '100%' },
              minHeight: { xs: 520, md: 0 },
              borderRadius: '22px',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-card)',
              overflow: 'hidden',
              background: 'radial-gradient(120% 80% at 50% 18%, rgba(226,75,74,0.18) 0%, transparent 46%), linear-gradient(180deg, #121014 0%, #1A1012 55%, #241014 100%)',
              'body.atlas-light &': {
                background: 'radial-gradient(120% 80% at 50% 18%, rgba(226,75,74,0.10) 0%, transparent 46%), linear-gradient(180deg, #FFFFFF 0%, #FFF7F7 55%, #F7EAEA 100%)',
              },
            }}
          >
            <Box
              aria-hidden
              sx={{
                pointerEvents: 'none',
                position: 'absolute',
                inset: 0,
                backgroundImage: `
                  radial-gradient(circle at 50% 28%, transparent 0 70px, rgba(226,75,74,0.14) 71px 72px, transparent 73px),
                  radial-gradient(circle at 50% 28%, transparent 0 120px, rgba(226,75,74,0.10) 121px 122px, transparent 123px),
                  radial-gradient(circle at 50% 28%, transparent 0 175px, rgba(170,36,35,0.08) 176px 177px, transparent 178px),
                  radial-gradient(ellipse at 50% 100%, rgba(226,75,74,0.22) 0 100px, transparent 101px)
                `,
                'body.atlas-light &': {
                  backgroundImage: `
                    radial-gradient(circle at 50% 28%, transparent 0 70px, rgba(226,75,74,0.11) 71px 72px, transparent 73px),
                    radial-gradient(circle at 50% 28%, transparent 0 120px, rgba(226,75,74,0.08) 121px 122px, transparent 123px),
                    radial-gradient(circle at 50% 28%, transparent 0 175px, rgba(170,36,35,0.06) 176px 177px, transparent 178px),
                    radial-gradient(ellipse at 50% 100%, rgba(243,180,179,0.4) 0 110px, transparent 111px)
                  `,
                },
              }}
            />

            <Box
              sx={{
                position: 'relative',
                zIndex: 1,
                height: '100%',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                px: 2,
                pt: 2.25,
                pb: 1.5,
              }}
            >
              <Typography
                sx={{
                  mb: 0.5,
                  fontWeight: 800,
                  fontSize: { xs: '1.2rem', md: '1.35rem' },
                  textAlign: 'center',
                  color: 'var(--brand-accent)',
                  'body.atlas-light &': { color: 'var(--brand-primary)' },
                  flexShrink: 0,
                  lineHeight: 1.2,
                }}
              >
                {activePreview.title}
              </Typography>

              <Box
                sx={{
                  position: 'relative',
                  flex: 1,
                  minHeight: 0,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: { xs: 0.5, md: 0.75 },
                  px: { xs: 4.5, md: 5.5 },
                  perspective: '1100px',
                  transformStyle: 'preserve-3d',
                }}
              >
                {/* Spotlight behind the active phone */}
                <Box
                  aria-hidden
                  sx={{
                    pointerEvents: 'none',
                    position: 'absolute',
                    left: '50%',
                    top: '46%',
                    transform: 'translate(-50%, -50%)',
                    width: { xs: 240, md: 300 },
                    height: { xs: 340, md: 420 },
                    borderRadius: '50%',
                    background: 'radial-gradient(ellipse at center, rgba(226,75,74,0.38) 0%, rgba(226,75,74,0.14) 42%, transparent 72%)',
                    filter: 'blur(2px)',
                    zIndex: 0,
                    transition: 'opacity 380ms ease',
                    'body.atlas-light &': {
                      background: 'radial-gradient(ellipse at center, rgba(226,75,74,0.24) 0%, rgba(243,180,179,0.3) 40%, transparent 72%)',
                    },
                  }}
                />

                <IconButton
                  aria-label="Previous preview"
                  onClick={() => setSlide((current) => (current - 1 + PREVIEWS.length) % PREVIEWS.length)}
                  sx={{
                    position: 'absolute',
                    left: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 5,
                    width: 36,
                    height: 36,
                    bgcolor: 'rgba(255,255,255,0.08)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--brand-accent)',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.14)' },
                    'body.atlas-light &': {
                      bgcolor: 'rgba(255,255,255,0.92)',
                      color: 'var(--brand-primary)',
                      boxShadow: '0 6px 18px rgba(63,10,10,0.12)',
                      '&:hover': { bgcolor: '#fff' },
                    },
                  }}
                >
                  <ChevronLeftIcon fontSize="small" />
                </IconButton>

                {/* Stable keys so each phone morphs small/dim → big/bright without remount pulse */}
                {[
                  { item: prevPreview, offset: -1 },
                  { item: activePreview, offset: 0 },
                  { item: nextPreview, offset: 1 },
                ].map(({ item, offset }) => {
                  const active = offset === 0
                  const sideTilt = offset < 0
                    ? 'rotateY(26deg) rotateZ(-4deg) scale(0.84) translateY(12px) translateX(4px)'
                    : 'rotateY(-26deg) rotateZ(4deg) scale(0.84) translateY(12px) translateX(-4px)'
                  const hoverTilt = offset < 0
                    ? 'rotateY(18deg) rotateZ(-3deg) scale(0.9) translateY(8px) translateX(2px)'
                    : 'rotateY(-18deg) rotateZ(3deg) scale(0.9) translateY(8px) translateX(-2px)'

                  return (
                    <Box
                      key={item.title}
                      onClick={active ? undefined : () => {
                        if (offset < 0) setSlide((current) => (current - 1 + PREVIEWS.length) % PREVIEWS.length)
                        else setSlide((current) => (current + 1) % PREVIEWS.length)
                      }}
                      sx={{
                        position: 'relative',
                        width: active
                          ? { xs: 172, md: 'min(228px, 50%)' }
                          : { xs: 86, md: 'min(116px, 23%)' },
                        aspectRatio: '908 / 2048',
                        maxHeight: active ? '94%' : '56%',
                        borderRadius: active ? '30px' : '20px',
                        p: active ? '7px' : '3px',
                        transformOrigin: active ? 'center center' : (offset < 0 ? 'right center' : 'left center'),
                        background: active
                          ? 'linear-gradient(160deg, #4A4A52, #16161A)'
                          : 'linear-gradient(160deg, #2A2A30, #0E0E12)',
                        boxShadow: active
                          ? '0 0 0 1px rgba(226,75,74,0.4), 0 0 40px rgba(226,75,74,0.32), 0 28px 48px rgba(0,0,0,0.45), 0 2px 0 rgba(255,255,255,0.14) inset'
                          : '0 10px 20px rgba(0,0,0,0.28)',
                        opacity: active ? 1 : 0.36,
                        filter: active ? 'brightness(1.1) saturate(1.08)' : 'brightness(0.58) saturate(0.5)',
                        transform: active
                          ? 'rotateY(0deg) rotateZ(0deg) scale(1) translateY(-8px)'
                          : sideTilt,
                        transformStyle: 'preserve-3d',
                        transition: [
                          'width 560ms cubic-bezier(0.4, 0, 0.2, 1)',
                          'max-height 560ms cubic-bezier(0.4, 0, 0.2, 1)',
                          'padding 560ms cubic-bezier(0.4, 0, 0.2, 1)',
                          'border-radius 560ms cubic-bezier(0.4, 0, 0.2, 1)',
                          'opacity 560ms cubic-bezier(0.4, 0, 0.2, 1)',
                          'transform 560ms cubic-bezier(0.4, 0, 0.2, 1)',
                          'filter 560ms cubic-bezier(0.4, 0, 0.2, 1)',
                          'box-shadow 560ms cubic-bezier(0.4, 0, 0.2, 1)',
                          'background 560ms cubic-bezier(0.4, 0, 0.2, 1)',
                        ].join(', '),
                        cursor: active ? 'default' : 'pointer',
                        flexShrink: 1,
                        zIndex: active ? 3 : 1,
                        willChange: 'transform, opacity, filter, width',
                        '&:hover': active ? undefined : {
                          opacity: 0.55,
                          filter: 'brightness(0.75) saturate(0.7)',
                          transform: hoverTilt,
                        },
                        'body.atlas-light &': {
                          boxShadow: active
                            ? '0 0 0 1px rgba(170,36,35,0.3), 0 0 36px rgba(226,75,74,0.24), 0 28px 48px rgba(63,10,10,0.22), 0 2px 0 rgba(255,255,255,0.16) inset'
                            : '0 10px 18px rgba(63,10,10,0.12)',
                        },
                      }}
                    >
                      <Box
                        sx={{
                          position: 'relative',
                          width: '100%',
                          height: '100%',
                          borderRadius: active ? '23px' : '17px',
                          overflow: 'hidden',
                          bgcolor: '#0B0B0B',
                          transition: 'border-radius 560ms cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      >
                        <Box
                          sx={{
                            position: 'absolute',
                            top: 8,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '34%',
                            height: 8,
                            borderRadius: 99,
                            bgcolor: '#000',
                            zIndex: 2,
                            opacity: active ? 1 : 0,
                            transition: 'opacity 560ms cubic-bezier(0.4, 0, 0.2, 1)',
                          }}
                        />
                        <Box
                          component="img"
                          src={item.image}
                          alt={item.title}
                          sx={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            objectPosition: 'top center',
                            display: 'block',
                          }}
                        />
                      </Box>
                    </Box>
                  )
                })}

                <IconButton
                  aria-label="Next preview"
                  onClick={() => setSlide((current) => (current + 1) % PREVIEWS.length)}
                  sx={{
                    position: 'absolute',
                    right: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 5,
                    width: 36,
                    height: 36,
                    bgcolor: 'rgba(255,255,255,0.08)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--brand-accent)',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.14)' },
                    'body.atlas-light &': {
                      bgcolor: 'rgba(255,255,255,0.92)',
                      color: 'var(--brand-primary)',
                      boxShadow: '0 6px 18px rgba(63,10,10,0.12)',
                      '&:hover': { bgcolor: '#fff' },
                    },
                  }}
                >
                  <ChevronRightIcon fontSize="small" />
                </IconButton>
              </Box>

              <Typography
                sx={{
                  mt: 1,
                  mb: 0.85,
                  maxWidth: 360,
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: { xs: '0.9rem', md: '0.95rem' },
                  lineHeight: 1.45,
                  flexShrink: 0,
                }}
              >
                {activePreview.body}
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 0.65, flexShrink: 0 }}>
                {PREVIEWS.map((item, index) => (
                  <button
                    key={item.title}
                    type="button"
                    aria-label={`Show preview: ${item.title}`}
                    onClick={() => setSlide(index)}
                    style={{
                      width: index === slide ? 16 : 6,
                      height: 6,
                      borderRadius: 99,
                      border: 0,
                      cursor: 'pointer',
                      background: index === slide ? 'var(--brand-accent)' : 'rgba(226,75,74,0.28)',
                      transition: 'width 200ms, background 200ms',
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>

      <Popover
        open={whatsNewOpen}
        anchorEl={whatsNewAnchor}
        onClose={() => setWhatsNewAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              width: 340,
              maxWidth: 'calc(100vw - 32px)',
              borderRadius: 3,
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-card)',
              background: 'var(--bg-card)',
              overflow: 'hidden',
            },
          },
        }}
      >
        <Box sx={{ p: '14px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>What’s New</Typography>
          <IconButton
            aria-label="Close What’s New"
            size="small"
            onClick={() => setWhatsNewAnchor(null)}
            sx={{ color: 'var(--text-secondary)' }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box
          component="ul"
          sx={{
            m: 0,
            px: 2.5,
            pb: 2,
            pl: 3.5,
            maxHeight: 280,
            overflowY: 'auto',
            color: 'var(--text-secondary)',
            fontSize: '0.84rem',
            lineHeight: 1.55,
            listStyleType: 'disc',
            listStylePosition: 'outside',
          }}
        >
          {whatsNewItems.map((item, index) => (
            <Box
              component="li"
              key={`${index}-${item.slice(0, 40)}`}
              sx={{ mb: 0.85, display: 'list-item', pl: 0.25 }}
            >
              {item}
            </Box>
          ))}
        </Box>
      </Popover>

      <Dialog
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          id: 'atlas-mobile-qr',
          sx: {
            borderRadius: 3,
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-card)',
            background: 'var(--bg-card)',
            m: 2,
          },
        }}
      >
        <Box sx={{ p: '16px 18px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1.05rem' }}>How to Install</Typography>
          <IconButton
            aria-label="Close How to Install"
            size="small"
            onClick={() => setInstallOpen(false)}
            sx={{ color: 'var(--text-secondary)' }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box
          sx={{
            px: 2.25,
            pb: 2.5,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr' },
            gap: 2.25,
            alignItems: 'start',
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}>
            {qrDataUrl && available ? (
              <Box
                component="img"
                src={qrDataUrl}
                alt="QR code to install ATLAS Mobile"
                sx={{ width: 180, height: 180, display: 'block' }}
              />
            ) : (
              <Box
                sx={{
                  width: 180,
                  height: 180,
                  borderRadius: 2,
                  background: 'var(--track-bg)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--text-tertiary)',
                  fontSize: '0.78rem',
                  px: 2,
                  textAlign: 'center',
                }}
              >
                {loading ? 'Preparing…' : 'QR appears when a build is published'}
              </Box>
            )}
            <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', textAlign: 'center' }}>
              Scan with your phone camera
            </Typography>
          </Box>

          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', mb: 0.5 }}>On Android</Typography>
            <Box
              component="ol"
              sx={{
                m: '0 0 14px',
                pl: 2.25,
                color: 'var(--text-secondary)',
                fontSize: '0.84rem',
                lineHeight: 1.5,
              }}
            >
              <li>Open Camera and point it at this QR code.</li>
              <li>Open the download. Allow installs from this site once if asked.</li>
              <li>Tap Install, open ATLAS Mobile, and sign in.</li>
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', mb: 0.5 }}>On iPhone</Typography>
            <Box
              component="ol"
              sx={{
                m: 0,
                pl: 2.25,
                color: 'var(--text-secondary)',
                fontSize: '0.84rem',
                lineHeight: 1.5,
              }}
            >
              <li>Scan the QR code to save the app file.</li>
              <li>Open the downloaded file and install it.</li>
              <li>Open ATLAS Mobile and sign in with your ATLAS account.</li>
            </Box>
          </Box>
        </Box>
      </Dialog>
    </FacultyLayout>
  )
}
