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
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.2fr) minmax(280px, 0.9fr)' },
            gridTemplateRows: { xs: 'auto', md: '1fr' },
            gap: 1.5,
          }}
        >
          {/* Left column */}
          <Box
            sx={{
              minHeight: 0,
              display: 'grid',
              gridTemplateRows: { xs: 'auto', md: 'auto minmax(0, 1fr) auto' },
              gap: 1.5,
            }}
          >
            <GlassCard style={{ marginBottom: 0 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  <Box
                    component="img"
                    src="/mobile/ATLAS_Mobile_Logo.png"
                    alt="ATLAS Mobile"
                    sx={{
                      width: 72,
                      height: 72,
                      borderRadius: 2.5,
                      objectFit: 'cover',
                      border: '1px solid var(--border-color)',
                      flexShrink: 0,
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', lineHeight: 1.2 }}>
                          ATLAS Mobile
                        </Typography>
                        <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.84rem', mt: 0.35 }}>
                          Internal app · {versionLabel}
                          {release?.file_size_label ? ` · ${release.file_size_label}` : ''}
                        </Typography>
                        {release?.published_at ? (
                          <Typography sx={{ color: 'var(--text-tertiary)', fontSize: '0.74rem', mt: 0.35 }}>
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
                      <Typography sx={{ mt: 0.75, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
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

            <GlassCard
              fill
              title="Description"
              style={{ height: '100%', minHeight: 0, marginBottom: 0 }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%', minHeight: 0, flex: 1 }}>
                <Typography
                  sx={{
                    m: 0,
                    color: 'var(--text-secondary)',
                    fontSize: '0.9rem',
                    lineHeight: 1.55,
                  }}
                >
                  {ABOUT_APP}
                </Typography>
                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', mb: 0.65 }}>
                    Features
                  </Typography>
                  <Box
                    component="ul"
                    sx={{
                      m: 0,
                      pl: 2.5,
                      color: 'var(--text-primary)',
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      lineHeight: 1.55,
                      listStyleType: 'disc',
                      listStylePosition: 'outside',
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                      columnGap: 2,
                      rowGap: 0.35,
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

            <GlassCard style={{ marginBottom: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', mb: 0.5 }}>
                Requirements & permissions
              </Typography>
              <Box
                component="ul"
                sx={{
                  m: 0,
                  pl: 2,
                  color: 'var(--text-secondary)',
                  fontSize: '0.8rem',
                  lineHeight: 1.45,
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  columnGap: 2,
                  rowGap: 0.25,
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

          {/* Right column — App Store–style marketing mockup carousel */}
          <Box
            sx={{
              height: { xs: 'auto', md: '100%' },
              minHeight: { xs: 520, md: 0 },
              borderRadius: '20px',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-card)',
              overflow: 'hidden',
              backdropFilter: 'blur(16px)',
            }}
          >
            <Box
              sx={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                height: '100%',
                minHeight: 0,
                px: { xs: 1.5, md: 2 },
                pt: { xs: 1.5, md: 2 },
                pb: 1.25,
                overflow: 'hidden',
                background: 'linear-gradient(180deg, #FFFFFF 0%, #FFF8F8 55%, #FCEDED 100%)',
              }}
            >
              {/* Soft brand circles like the store mockup backdrop */}
              <Box
                aria-hidden
                sx={{
                  pointerEvents: 'none',
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: `
                    radial-gradient(circle at 12% 88%, rgba(226,75,74,0.16) 0 42px, transparent 43px),
                    radial-gradient(circle at 28% 96%, rgba(170,36,35,0.12) 0 28px, transparent 29px),
                    radial-gradient(circle at 88% 92%, rgba(226,75,74,0.18) 0 56px, transparent 57px),
                    radial-gradient(circle at 72% 98%, rgba(170,36,35,0.10) 0 34px, transparent 35px),
                    radial-gradient(circle at 50% 100%, rgba(243,180,179,0.35) 0 70px, transparent 71px)
                  `,
                }}
              />

              <Typography
                sx={{
                  position: 'relative',
                  zIndex: 1,
                  flexShrink: 0,
                  fontWeight: 800,
                  fontSize: { xs: '1.05rem', md: '1.15rem' },
                  color: 'var(--brand-primary)',
                  letterSpacing: '-0.02em',
                  textAlign: 'center',
                  lineHeight: 1.2,
                  mb: 0.75,
                }}
              >
                {activePreview.title}
              </Typography>

              <Box
                sx={{
                  position: 'relative',
                  zIndex: 1,
                  flex: 1,
                  minHeight: 0,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconButton
                  aria-label="Previous preview"
                  onClick={() => setSlide((current) => (current - 1 + PREVIEWS.length) % PREVIEWS.length)}
                  sx={{
                    position: 'absolute',
                    left: { xs: -4, md: 0 },
                    zIndex: 2,
                    width: 36,
                    height: 36,
                    bgcolor: 'rgba(255,255,255,0.88)',
                    border: '1px solid rgba(170,36,35,0.18)',
                    boxShadow: '0 4px 14px rgba(63,10,10,0.12)',
                    color: 'var(--brand-primary)',
                    '&:hover': { bgcolor: '#fff' },
                  }}
                >
                  <ChevronLeftIcon />
                </IconButton>

                <Box
                  sx={{
                    width: { xs: 150, md: 'min(200px, 62%)' },
                    aspectRatio: '908 / 2048',
                    maxHeight: '100%',
                    borderRadius: '28px',
                    p: '7px',
                    background: 'linear-gradient(160deg, #2A2A2A, #111111)',
                    boxShadow: '0 18px 40px rgba(63,10,10,0.22), 0 2px 0 rgba(255,255,255,0.12) inset',
                    flexShrink: 1,
                  }}
                >
                  <Box
                    sx={{
                      position: 'relative',
                      width: '100%',
                      height: '100%',
                      borderRadius: '22px',
                      overflow: 'hidden',
                      background: '#0B0B0B',
                    }}
                  >
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

                <IconButton
                  aria-label="Next preview"
                  onClick={() => setSlide((current) => (current + 1) % PREVIEWS.length)}
                  sx={{
                    position: 'absolute',
                    right: { xs: -4, md: 0 },
                    zIndex: 2,
                    width: 36,
                    height: 36,
                    bgcolor: 'rgba(255,255,255,0.88)',
                    border: '1px solid rgba(170,36,35,0.18)',
                    boxShadow: '0 4px 14px rgba(63,10,10,0.12)',
                    color: 'var(--brand-primary)',
                    '&:hover': { bgcolor: '#fff' },
                  }}
                >
                  <ChevronRightIcon />
                </IconButton>
              </Box>

              <Typography
                sx={{
                  position: 'relative',
                  zIndex: 1,
                  mt: 1,
                  mb: 0.75,
                  maxWidth: 280,
                  color: 'var(--text-secondary)',
                  fontSize: '0.78rem',
                  lineHeight: 1.4,
                  textAlign: 'center',
                  flexShrink: 0,
                }}
              >
                {activePreview.body}
              </Typography>

              <Box
                sx={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'flex',
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  gap: 0.7,
                  flexShrink: 0,
                }}
              >
                {PREVIEWS.map((item, index) => (
                  <button
                    key={item.title}
                    type="button"
                    aria-label={`Show preview: ${item.title}`}
                    onClick={() => setSlide(index)}
                    style={{
                      width: index === slide ? 18 : 7,
                      height: 7,
                      borderRadius: 99,
                      border: 0,
                      cursor: 'pointer',
                      background: index === slide ? 'var(--brand-primary)' : 'rgba(170,36,35,0.22)',
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
