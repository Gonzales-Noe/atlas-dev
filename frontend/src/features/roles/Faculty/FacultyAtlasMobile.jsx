import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined'
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined'
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined'
import QRCode from 'qrcode'
import FacultyLayout from './FacultyLayout'
import api from '../../../config/api'
import { StatusNotice } from '../../../components/StatusNotice'
import { GlassCard, PageHeader } from '../../../components/ui'

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
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
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
      <Box sx={{ maxWidth: 920, mx: 'auto', pb: 6 }}>
        <PageHeader
          title="ATLAS Mobile"
          subtitle="Install the internal phone app for Major Examination MCQ scanning."
        />

        <StatusNotice message={error} severity="error" />

        {updateBannerVisible ? (
          <Box
            sx={{
              mb: 2.5,
              p: '14px 16px',
              borderRadius: 3,
              border: '1px solid rgba(226,75,74,0.35)',
              background: 'rgba(226,75,74,0.08)',
              display: 'flex',
              gap: 1,
              alignItems: 'flex-start',
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--brand-primary)' }}>
                Update available — {versionLabel}
              </Typography>
              <Typography sx={{ mt: 0.5, color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.45 }}>
                A new build is ready. Open What’s New below, then scan the QR code to install it on your phone.
              </Typography>
            </Box>
            <IconButton
              aria-label="Dismiss update notice"
              onClick={dismissUpdateBanner}
              size="small"
              sx={{ color: 'var(--text-secondary)', mt: -0.5 }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        ) : null}

        <GlassCard style={{ marginBottom: 20 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr minmax(220px, 280px)' },
              gap: 2.5,
              alignItems: 'center',
            }}
          >
            <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <Box
                component="img"
                src="/mobile/ATLAS_Mobile_Logo.png"
                alt="ATLAS Mobile"
                sx={{
                  width: 88,
                  height: 88,
                  borderRadius: 3,
                  objectFit: 'cover',
                  border: '1px solid var(--border-color)',
                  flexShrink: 0,
                }}
              />
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '1.45rem', lineHeight: 1.2 }}>
                  ATLAS Mobile
                </Typography>
                <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.9rem', mt: 0.5 }}>
                  Internal app · {versionLabel}
                  {release?.file_size_label ? ` · ${release.file_size_label}` : ''}
                </Typography>
                {release?.published_at ? (
                  <Typography sx={{ color: 'var(--text-tertiary)', fontSize: '0.78rem', mt: 0.5 }}>
                    Updated {formatPublished(release.published_at)}
                  </Typography>
                ) : null}
                <Typography sx={{ mt: 1.75, m: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55 }}>
                  {ABOUT_APP}
                </Typography>
                {!available && !loading ? (
                  <Typography sx={{ mt: 1.25, color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                    The install is not ready yet. Ask your IT team to publish ATLAS Mobile in System Health.
                  </Typography>
                ) : null}
              </Box>
            </Box>

            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.84rem', mb: 1, color: 'var(--text-secondary)' }}>
                App preview
              </Typography>
              <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: 3, minHeight: 200 }}>
                {PREVIEWS.map((item, index) => {
                  const Icon = item.icon
                  const active = index === slide
                  return (
                    <Box
                      key={item.title}
                      sx={{
                        display: active ? 'flex' : 'none',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 1.25,
                        textAlign: 'center',
                        px: 0.5,
                      }}
                    >
                      <Box
                        sx={{
                          width: 108,
                          height: 168,
                          borderRadius: '22px',
                          border: '3px solid var(--text-primary)',
                          background: 'linear-gradient(160deg, rgba(226,75,74,0.14), rgba(247,249,252,0.95))',
                          display: 'grid',
                          placeItems: 'center',
                          boxShadow: 'var(--shadow-card)',
                        }}
                      >
                        <Icon sx={{ fontSize: 40, color: 'var(--brand-primary)' }} />
                      </Box>
                      <Box>
                        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>{item.title}</Typography>
                        <Typography sx={{ mt: 0.5, color: 'var(--text-secondary)', lineHeight: 1.45, fontSize: '0.8rem' }}>
                          {item.body}
                        </Typography>
                      </Box>
                    </Box>
                  )
                })}
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 1.25 }}>
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
          </Box>
        </GlassCard>

        {whatsNewItems.length ? (
          <GlassCard style={{ marginBottom: 20, paddingTop: 8, paddingBottom: 8 }}>
            <button
              type="button"
              onClick={() => setWhatsNewOpen((open) => !open)}
              aria-expanded={whatsNewOpen}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                border: 0,
                background: 'transparent',
                cursor: 'pointer',
                padding: '6px 0',
                color: 'inherit',
                textAlign: 'left',
              }}
            >
              <Typography sx={{ fontWeight: 800, fontSize: '1rem' }}>What’s New</Typography>
              <ExpandMoreIcon
                sx={{
                  color: 'var(--text-secondary)',
                  transform: whatsNewOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 180ms',
                }}
              />
            </button>
            <Collapse in={whatsNewOpen}>
              <Box
                component="ul"
                sx={{ m: 0, mt: 0.5, mb: 1, pl: 2.25, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}
              >
                {whatsNewItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </Box>
            </Collapse>
          </GlassCard>
        ) : null}

        <Box
          id="atlas-mobile-qr"
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '220px 1fr' },
            gap: 2,
            mb: 2.5,
          }}
        >
          <GlassCard style={{ textAlign: 'center' }}>
            {qrDataUrl && available ? (
              <Box
                component="img"
                src={qrDataUrl}
                alt="QR code to install ATLAS Mobile"
                sx={{ width: 180, height: 180, mx: 'auto', display: 'block' }}
              />
            ) : (
              <Box sx={{
                width: 180,
                height: 180,
                mx: 'auto',
                borderRadius: 2,
                background: 'var(--track-bg)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--text-tertiary)',
                fontSize: '0.8rem',
                px: 2,
              }}
              >
                {loading ? 'Preparing…' : 'QR appears when a build is published'}
              </Box>
            )}
            <Typography sx={{ mt: 1, fontWeight: 700, fontSize: '0.84rem' }}>
              Scan with your phone camera
            </Typography>
          </GlassCard>

          <GlassCard title="How to install">
            <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', mb: 0.75 }}>On Android</Typography>
            <ol style={{ margin: '0 0 14px', paddingLeft: 18, color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.55 }}>
              <li>Open your Camera and point it at the QR code on this page.</li>
              <li>Open the download. If asked, allow installs from this site once.</li>
              <li>Tap Install, then Open ATLAS Mobile and sign in with your ATLAS account.</li>
            </ol>
            <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', mb: 0.75 }}>On iPhone</Typography>
            <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.55 }}>
              <li>Scan the QR code to save the app file on your phone.</li>
              <li>Open the downloaded file and install it manually.</li>
              <li>Open ATLAS Mobile and sign in with your ATLAS account.</li>
            </ol>
          </GlassCard>
        </Box>

        <GlassCard title="Requirements & permissions">
          <Box component="ul" sx={{ m: 0, pl: 2.25, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
            <li>Works on Android 9+ phones, and on iPhones that can open the downloaded installer</li>
            <li>
              Storage needed:
              {' '}
              {release?.file_size_label || 'about 50 MB'}
            </li>
            <li>Camera — only to scan Major Examination MCQ sheets</li>
            <li>Internet — to sign in and update exam copies when you are online</li>
          </Box>
        </GlassCard>
      </Box>
    </FacultyLayout>
  )
}
