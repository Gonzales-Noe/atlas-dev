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
        <Box sx={{ flexShrink: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1.35rem', letterSpacing: '-0.02em', lineHeight: 1.2, m: 0 }}>
            ATLAS Mobile
          </Typography>
          <Typography sx={{ mt: 0.25, color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.4 }}>
            Install the internal phone app for Major Examination MCQ scanning.
          </Typography>
        </Box>

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
            gridTemplateRows: { xs: 'auto', md: 'minmax(0, 1.35fr) auto' },
            gap: 1.5,
          }}
        >
          {/* Store-style ATLAS preview banner */}
          <Box
            sx={{
              position: 'relative',
              minHeight: { xs: 520, md: 0 },
              borderRadius: '20px',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-card)',
              overflow: 'hidden',
              background: 'linear-gradient(135deg, rgba(18,14,16,0.98) 0%, rgba(28,14,16,0.96) 55%, rgba(40,16,18,0.98) 100%)',
              'body.atlas-light &': {
                background: 'linear-gradient(135deg, #FFFFFF 0%, #FFF9F9 45%, #F8EEEE 100%)',
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
                  radial-gradient(circle at 22% 48%, rgba(226,75,74,0.14) 0 90px, transparent 91px),
                  radial-gradient(circle at 22% 48%, rgba(170,36,35,0.10) 0 160px, transparent 161px),
                  radial-gradient(circle at 22% 48%, rgba(226,75,74,0.07) 0 240px, transparent 241px),
                  radial-gradient(circle at 86% 78%, rgba(226,75,74,0.18) 0 70px, transparent 71px)
                `,
                'body.atlas-light &': {
                  backgroundImage: `
                    radial-gradient(circle at 22% 48%, rgba(226,75,74,0.08) 0 90px, transparent 91px),
                    radial-gradient(circle at 22% 48%, rgba(170,36,35,0.06) 0 160px, transparent 161px),
                    radial-gradient(circle at 22% 48%, rgba(226,75,74,0.05) 0 240px, transparent 241px),
                    radial-gradient(circle at 86% 78%, rgba(243,180,179,0.35) 0 80px, transparent 81px)
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
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.05fr) minmax(0, 0.95fr)' },
                gap: { xs: 2, md: 1 },
                alignItems: 'center',
                px: { xs: 2, md: 3 },
                py: { xs: 2.5, md: 2 },
              }}
            >
              <Box sx={{ textAlign: { xs: 'center', md: 'left' }, maxWidth: 520, mx: { xs: 'auto', md: 0 } }}>
                <Box
                  component="img"
                  src="/mobile/ATLAS_Mobile_Logo.png"
                  alt=""
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: 2.5,
                    objectFit: 'cover',
                    border: '1px solid var(--border-color)',
                    mb: 1.5,
                    boxShadow: '0 8px 24px rgba(170,36,35,0.25)',
                  }}
                />
                <Typography sx={{ fontWeight: 800, fontSize: { xs: '1rem', md: '1.05rem' }, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                  Scan Major Exam sheets anywhere
                </Typography>
                <Typography sx={{ mt: 0.4, fontWeight: 700, fontSize: { xs: '0.92rem', md: '0.98rem' }, color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                  Your phone companion for ATLAS Web classroom grading
                </Typography>
                <Typography
                  sx={{
                    mt: 1.25,
                    fontWeight: 900,
                    fontSize: { xs: '2rem', md: '2.45rem' },
                    letterSpacing: '-0.03em',
                    lineHeight: 0.95,
                    color: 'var(--brand-accent)',
                    'body.atlas-light &': { color: 'var(--brand-primary)' },
                  }}
                >
                  ATLAS
                  {' '}
                  <Box component="span" sx={{ color: 'var(--text-primary)' }}>MOBILE</Box>
                </Typography>
                <Typography
                  sx={{
                    mt: 1.5,
                    color: 'var(--text-secondary)',
                    fontSize: '0.84rem',
                    lineHeight: 1.55,
                    maxWidth: 420,
                    mx: { xs: 'auto', md: 0 },
                  }}
                >
                  Grade printed MCQ Major Examinations in the room, review scores on your phone,
                  and keep exams in sync with ATLAS Web — even when the signal drops.
                </Typography>
                <Typography
                  sx={{
                    mt: 1.25,
                    fontWeight: 800,
                    fontSize: '0.86rem',
                    color: 'var(--brand-accent)',
                    'body.atlas-light &': { color: 'var(--brand-primary)' },
                  }}
                >
                  {activePreview.title}
                </Typography>
                <Typography sx={{ mt: 0.35, color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.4 }}>
                  {activePreview.body}
                </Typography>
              </Box>

              <Box
                sx={{
                  position: 'relative',
                  height: { xs: 360, md: '100%' },
                  minHeight: { md: 0 },
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  pb: { xs: 1, md: 1.5 },
                }}
              >
                <IconButton
                  aria-label="Previous preview"
                  onClick={() => setSlide((current) => (current - 1 + PREVIEWS.length) % PREVIEWS.length)}
                  sx={{
                    position: 'absolute',
                    left: { xs: 0, md: 8 },
                    top: '42%',
                    zIndex: 3,
                    width: 34,
                    height: 34,
                    bgcolor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--brand-accent)',
                    '&:hover': { bgcolor: 'var(--bg-header)' },
                    'body.atlas-light &': {
                      bgcolor: 'rgba(255,255,255,0.9)',
                      color: 'var(--brand-primary)',
                      '&:hover': { bgcolor: '#fff' },
                    },
                  }}
                >
                  <ChevronLeftIcon fontSize="small" />
                </IconButton>

                {/* Back phone */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: { xs: '12%', md: '18%' },
                    bottom: { xs: 36, md: 44 },
                    width: { xs: 118, md: 'min(150px, 34%)' },
                    aspectRatio: '908 / 2048',
                    transform: 'rotate(-8deg)',
                    borderRadius: '24px',
                    p: '5px',
                    background: 'linear-gradient(160deg, #3A3A40, #141416)',
                    boxShadow: '0 16px 36px rgba(0,0,0,0.35)',
                    opacity: 0.88,
                    zIndex: 1,
                  }}
                >
                  <Box sx={{ width: '100%', height: '100%', borderRadius: '19px', overflow: 'hidden', bgcolor: '#0B0B0B' }}>
                    <Box
                      component="img"
                      src={PREVIEWS[0].image}
                      alt=""
                      sx={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
                    />
                  </Box>
                </Box>

                {/* Front phone on pedestal */}
                <Box sx={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <Box
                    sx={{
                      width: { xs: 148, md: 'min(190px, 42%)' },
                      aspectRatio: '908 / 2048',
                      maxHeight: { xs: 300, md: '78%' },
                      transform: 'rotate(7deg)',
                      borderRadius: '28px',
                      p: '6px',
                      background: 'linear-gradient(160deg, #3A3A40, #141416)',
                      boxShadow: '0 22px 44px rgba(0,0,0,0.42), 0 2px 0 rgba(255,255,255,0.1) inset',
                      'body.atlas-light &': {
                        boxShadow: '0 22px 44px rgba(63,10,10,0.22), 0 2px 0 rgba(255,255,255,0.12) inset',
                      },
                    }}
                  >
                    <Box sx={{ position: 'relative', width: '100%', height: '100%', borderRadius: '22px', overflow: 'hidden', bgcolor: '#0B0B0B' }}>
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 7,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: '34%',
                          height: 8,
                          borderRadius: 99,
                          bgcolor: '#000',
                          zIndex: 2,
                        }}
                      />
                      <Box
                        component="img"
                        src={activePreview.image}
                        alt={activePreview.title}
                        sx={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
                      />
                    </Box>
                  </Box>
                  <Box
                    aria-hidden
                    sx={{
                      mt: -0.5,
                      width: { xs: 150, md: 180 },
                      height: 18,
                      borderRadius: '50%',
                      background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, transparent 70%)',
                      'body.atlas-light &': {
                        background: 'radial-gradient(ellipse at center, rgba(63,10,10,0.28) 0%, transparent 70%)',
                      },
                    }}
                  />
                </Box>

                <IconButton
                  aria-label="Next preview"
                  onClick={() => setSlide((current) => (current + 1) % PREVIEWS.length)}
                  sx={{
                    position: 'absolute',
                    right: { xs: 0, md: 8 },
                    top: '42%',
                    zIndex: 3,
                    width: 34,
                    height: 34,
                    bgcolor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--brand-accent)',
                    '&:hover': { bgcolor: 'var(--bg-header)' },
                    'body.atlas-light &': {
                      bgcolor: 'rgba(255,255,255,0.9)',
                      color: 'var(--brand-primary)',
                      '&:hover': { bgcolor: '#fff' },
                    },
                  }}
                >
                  <ChevronRightIcon fontSize="small" />
                </IconButton>

                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 6,
                    left: 0,
                    right: 0,
                    display: 'flex',
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                    gap: 0.65,
                    zIndex: 3,
                  }}
                >
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

          {/* Detail cards under the banner */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1.2fr 1fr' },
              gap: 1.5,
              minHeight: 0,
            }}
          >
            <GlassCard style={{ marginBottom: 0 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.1 }}>
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
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                      <Box sx={{ minWidth: 0 }}>
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
                      </Box>
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
                    </Box>
                    {!available && !loading ? (
                      <Typography sx={{ mt: 0.6, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                        The install is not ready yet. Ask your IT team to publish ATLAS Mobile in System Health.
                      </Typography>
                    ) : null}
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
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

            <GlassCard title="Description" style={{ marginBottom: 0 }}>
              <Typography sx={{ m: 0, mb: 1.1, color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                {ABOUT_APP}
              </Typography>
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
                  columnGap: 1.5,
                  rowGap: 0.25,
                }}
              >
                {CORE_FEATURES.map((feature) => (
                  <Box component="li" key={feature} sx={{ display: 'list-item' }}>
                    {feature}
                  </Box>
                ))}
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
