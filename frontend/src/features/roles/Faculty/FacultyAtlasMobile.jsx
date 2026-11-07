import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined'
import CloseIcon from '@mui/icons-material/Close'
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined'
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined'
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined'
import QRCode from 'qrcode'
import FacultyLayout from './FacultyLayout'
import api from '../../../config/api'
import { StatusNotice } from '../../../components/StatusNotice'
import { GlassCard } from '../../../components/ui'

const PREVIEWS = [
  {
    title: 'Scan exam sheets',
    body: 'Point your phone at a printed Major Examination MCQ sheet. ATLAS reads the answers in the room.',
    icon: CameraAltOutlinedIcon,
  },
  {
    title: 'Review scores on your phone',
    body: 'Check scan results on the device. Scores and answer keys stay in sync with ATLAS Web class records.',
    icon: FactCheckOutlinedIcon,
  },
  {
    title: 'Your courses on the go',
    body: 'Open the same courses you use on ATLAS Web — handy between classes.',
    icon: SchoolOutlinedIcon,
  },
  {
    title: 'Works offline in the room',
    body: 'If the signal drops, scans wait on your phone and continue when you reconnect.',
    icon: StorageOutlinedIcon,
  },
]

const ABOUT_APP = (
  'ATLAS Mobile is the phone companion for ATLAS Web. It is scoped to Major Examinations with '
  + 'multiple-choice (MCQ) sheets only — scan printed papers in the classroom and review results on your phone. '
  + 'Exams, answer keys, and scores stay in sync with ATLAS Web. It is an internal app — not listed on the public app stores.'
)

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

export default function FacultyAtlasMobile() {
  const [release, setRelease] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [slide, setSlide] = useState(0)
  const [updateBannerVisible, setUpdateBannerVisible] = useState(false)

  useEffect(() => {
    let mounted = true
    api.get('/auth/mobile-app/', { atlasCache: false, skipAtlasErrorCard: true })
      .then(({ data }) => {
        if (!mounted) return
        setRelease(data || null)
        setError('')
      })
      .catch(() => {
        if (!mounted) return
        setError('Could not load the ATLAS Mobile page. Try again in a moment.')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [])

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
  const ActiveIcon = activePreview.icon

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
                A new build is ready. Scan the QR code on the right to install it.
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
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.35fr) minmax(300px, 0.85fr)' },
            gridTemplateRows: { xs: 'auto', md: '1fr' },
            gap: 1.5,
          }}
        >
          {/* Left column — stacked cards fill remaining height */}
          <Box
            sx={{
              minHeight: 0,
              display: 'grid',
              gridTemplateRows: {
                xs: 'auto',
                md: whatsNewItems.length ? 'auto minmax(0, 1fr) auto' : 'auto minmax(0, 1fr) auto',
              },
              gap: 1.5,
            }}
          >
            <GlassCard style={{ marginBottom: 0 }}>
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
                  <Typography
                    sx={{
                      mt: 1,
                      color: 'var(--text-secondary)',
                      fontSize: '0.82rem',
                      lineHeight: 1.45,
                      display: { xs: 'block', md: '-webkit-box' },
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: { xs: 'visible', md: 'hidden' },
                    }}
                  >
                    {ABOUT_APP}
                  </Typography>
                  {!available && !loading ? (
                    <Typography sx={{ mt: 0.75, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      The install is not ready yet. Ask your IT team to publish ATLAS Mobile in System Health.
                    </Typography>
                  ) : null}
                </Box>
              </Box>
            </GlassCard>

            <GlassCard fill style={{ height: '100%', marginBottom: 0 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, flex: 1 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '0.84rem', mb: 1, color: 'var(--text-secondary)', flexShrink: 0 }}>
                  App preview
                </Typography>
                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1.25,
                    textAlign: 'center',
                    px: 0.5,
                  }}
                >
                  <Box
                    sx={{
                      width: { xs: 96, md: 'min(120px, 28%)' },
                      aspectRatio: '108 / 168',
                      maxHeight: '48%',
                      borderRadius: '22px',
                      border: '3px solid var(--text-primary)',
                      background: 'linear-gradient(160deg, rgba(226,75,74,0.14), rgba(247,249,252,0.95))',
                      display: 'grid',
                      placeItems: 'center',
                      boxShadow: 'var(--shadow-card)',
                      flexShrink: 1,
                    }}
                  >
                    <ActiveIcon sx={{ fontSize: { xs: 34, md: 42 }, color: 'var(--brand-primary)' }} />
                  </Box>
                  <Box sx={{ maxWidth: 360 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>{activePreview.title}</Typography>
                    <Typography sx={{ mt: 0.4, color: 'var(--text-secondary)', lineHeight: 1.4, fontSize: '0.8rem' }}>
                      {activePreview.body}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 1, flexShrink: 0 }}>
                  {PREVIEWS.map((item, index) => (
                    <button
                      key={item.title}
                      type="button"
                      aria-label={`Show preview ${index + 1}`}
                      onClick={() => setSlide(index)}
                      style={{
                        width: index === slide ? 22 : 8,
                        height: 8,
                        borderRadius: 99,
                        border: 0,
                        cursor: 'pointer',
                        background: index === slide ? 'var(--brand-primary)' : 'var(--border-color)',
                        transition: 'width 200ms, background 200ms',
                      }}
                    />
                  ))}
                </Box>
              </Box>
            </GlassCard>

            <GlassCard style={{ marginBottom: 0 }}>
              {whatsNewItems.length ? (
                <Box sx={{ mb: 1.25 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', mb: 0.5 }}>What’s New</Typography>
                  <Box
                    component="ul"
                    sx={{
                      m: 0,
                      pl: 2,
                      color: 'var(--text-secondary)',
                      fontSize: '0.8rem',
                      lineHeight: 1.45,
                      maxHeight: { md: 52 },
                      overflow: { md: 'auto' },
                    }}
                  >
                    {whatsNewItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </Box>
                </Box>
              ) : null}
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

          {/* Right column — full-height install card */}
          <Box id="atlas-mobile-qr" sx={{ minHeight: 0, height: { xs: 'auto', md: '100%' } }}>
          <GlassCard
            fill
            title="Install on your phone"
            style={{
              height: '100%',
              minHeight: 0,
              marginBottom: 0,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                height: '100%',
                minHeight: 0,
                flex: 1,
                gap: 1.5,
              }}
            >
              {qrDataUrl && available ? (
                <Box
                  component="img"
                  src={qrDataUrl}
                  alt="QR code to install ATLAS Mobile"
                  sx={{
                    width: { xs: 180, md: 'min(220px, 55%)' },
                    height: 'auto',
                    aspectRatio: '1',
                    maxHeight: { md: '38%' },
                    display: 'block',
                    flexShrink: 1,
                  }}
                />
              ) : (
                <Box
                  sx={{
                    width: { xs: 180, md: 'min(220px, 55%)' },
                    aspectRatio: '1',
                    maxHeight: { md: '38%' },
                    borderRadius: 2,
                    background: 'var(--track-bg)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--text-tertiary)',
                    fontSize: '0.78rem',
                    px: 2,
                    textAlign: 'center',
                    flexShrink: 1,
                  }}
                >
                  {loading ? 'Preparing…' : 'QR appears when a build is published'}
                </Box>
              )}
              <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', textAlign: 'center', flexShrink: 0 }}>
                Scan with your phone camera
              </Typography>

              <Box sx={{ width: '100%', flex: 1, minHeight: 0, overflow: { md: 'auto' } }}>
                <Typography sx={{ fontWeight: 800, fontSize: '0.84rem', mb: 0.5 }}>On Android</Typography>
                <Box
                  component="ol"
                  sx={{
                    m: '0 0 12px',
                    pl: 2.1,
                    color: 'var(--text-secondary)',
                    fontSize: '0.8rem',
                    lineHeight: 1.45,
                  }}
                >
                  <li>Open Camera and point it at this QR code.</li>
                  <li>Open the download. Allow installs from this site once if asked.</li>
                  <li>Tap Install, open ATLAS Mobile, and sign in.</li>
                </Box>
                <Typography sx={{ fontWeight: 800, fontSize: '0.84rem', mb: 0.5 }}>On iPhone</Typography>
                <Box
                  component="ol"
                  sx={{
                    m: 0,
                    pl: 2.1,
                    color: 'var(--text-secondary)',
                    fontSize: '0.8rem',
                    lineHeight: 1.45,
                  }}
                >
                  <li>Scan the QR code to save the app file.</li>
                  <li>Open the downloaded file and install it.</li>
                  <li>Open ATLAS Mobile and sign in with your ATLAS account.</li>
                </Box>
              </Box>
            </Box>
          </GlassCard>
          </Box>
        </Box>
      </Box>
    </FacultyLayout>
  )
}
