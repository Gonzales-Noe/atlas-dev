import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import DownloadIcon from '@mui/icons-material/Download'
import QrCode2Icon from '@mui/icons-material/QrCode2'
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined'
import CloudSyncOutlinedIcon from '@mui/icons-material/CloudSyncOutlined'
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined'
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined'
import QRCode from 'qrcode'
import FacultyLayout from './FacultyLayout'
import api from '../../../config/api'
import { StatusNotice } from '../../../components/StatusNotice'
import { GlassCard, PageHeader, PrimaryBtn, OutlineBtn } from '../../../components/ui'

const PREVIEWS = [
  {
    title: 'Scan exam sheets',
    body: 'Point your phone at a printed bubble sheet. ATLAS reads the answers in the room.',
    icon: CameraAltOutlinedIcon,
  },
  {
    title: 'Scores sync to class records',
    body: 'After a scan, scores move to your course record when you are online.',
    icon: CloudSyncOutlinedIcon,
  },
  {
    title: 'Your courses on the go',
    body: 'Open the same courses you use on ATLAS Web — handy between classes.',
    icon: SchoolOutlinedIcon,
  },
  {
    title: 'Works offline in the room',
    body: 'If the signal drops, scans wait on your phone and upload when you reconnect.',
    icon: StorageOutlinedIcon,
  },
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

export default function FacultyAtlasMobile() {
  const [release, setRelease] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [slide, setSlide] = useState(0)

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
        setError('Could not load the ATLAS Mobile download page. Try again in a moment.')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [])

  const downloadUrl = useMemo(() => {
    if (release?.download_url) return release.download_url
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/api/auth/mobile-app/download/`
  }, [release])

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

  return (
    <FacultyLayout>
      <Box sx={{ maxWidth: 920, mx: 'auto', pb: 6 }}>
        <PageHeader
          title="ATLAS Mobile"
          subtitle="Install the campus phone app to scan exams and keep scores with your courses."
        />

        <StatusNotice message={error} severity="error" />

        {available && release?.release_notes ? (
          <Box
            sx={{
              mb: 2.5,
              p: '14px 16px',
              borderRadius: 3,
              border: '1px solid rgba(226,75,74,0.35)',
              background: 'rgba(226,75,74,0.08)',
            }}
          >
            <Typography sx={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--brand-primary)' }}>
              Update available — {versionLabel}
            </Typography>
            <Typography sx={{ mt: 0.5, color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.45 }}>
              {release.release_notes}
            </Typography>
          </Box>
        ) : null}

        <GlassCard style={{ marginBottom: 20 }}>
          <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap', alignItems: 'center' }}>
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
                Internal campus app · {versionLabel}
                {release?.file_size_label ? ` · ${release.file_size_label}` : ''}
              </Typography>
              {release?.published_at ? (
                <Typography sx={{ color: 'var(--text-tertiary)', fontSize: '0.78rem', mt: 0.5 }}>
                  Updated {formatPublished(release.published_at)}
                </Typography>
              ) : null}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.75 }}>
                <PrimaryBtn
                  disabled={!available || loading}
                  onClick={() => {
                    if (downloadUrl) window.location.assign(downloadUrl)
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  <DownloadIcon sx={{ fontSize: 18 }} />
                  Download ATLAS Mobile
                </PrimaryBtn>
                <OutlineBtn
                  disabled={!available}
                  onClick={() => {
                    const el = document.getElementById('atlas-mobile-qr')
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  <QrCode2Icon sx={{ fontSize: 18 }} />
                  Scan QR on your phone
                </OutlineBtn>
              </Box>
              {!available && !loading ? (
                <Typography sx={{ mt: 1.25, color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                  The download is not ready yet. Ask your IT team to publish ATLAS Mobile in System Health.
                </Typography>
              ) : null}
            </Box>
          </Box>
        </GlassCard>

        <GlassCard title="App preview" style={{ marginBottom: 20 }}>
          <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: 3, minHeight: 220 }}>
            {PREVIEWS.map((item, index) => {
              const Icon = item.icon
              const active = index === slide
              return (
                <Box
                  key={item.title}
                  sx={{
                    display: active ? 'grid' : 'none',
                    gridTemplateColumns: { xs: '1fr', sm: '140px 1fr' },
                    gap: 2,
                    alignItems: 'center',
                    p: { xs: 1, sm: 1.5 },
                  }}
                >
                  <Box
                    sx={{
                      width: { xs: 120, sm: 140 },
                      height: { xs: 200, sm: 220 },
                      mx: { xs: 'auto', sm: 0 },
                      borderRadius: '28px',
                      border: '3px solid var(--text-primary)',
                      background: 'linear-gradient(160deg, rgba(226,75,74,0.14), rgba(247,249,252,0.95))',
                      display: 'grid',
                      placeItems: 'center',
                      boxShadow: 'var(--shadow-card)',
                    }}
                  >
                    <Icon sx={{ fontSize: 48, color: 'var(--brand-primary)' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: '1.15rem' }}>{item.title}</Typography>
                    <Typography sx={{ mt: 1, color: 'var(--text-secondary)', lineHeight: 1.5, fontSize: '0.95rem' }}>
                      {item.body}
                    </Typography>
                  </Box>
                </Box>
              )
            })}
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 1.5 }}>
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
        </GlassCard>

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
                alt="QR code to download ATLAS Mobile"
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
                {loading ? 'Preparing…' : 'QR appears when a download is published'}
              </Box>
            )}
            <Typography sx={{ mt: 1, fontWeight: 700, fontSize: '0.84rem' }}>
              Scan with your phone camera
            </Typography>
          </GlassCard>

          <GlassCard title="How to install">
            <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', mb: 0.75 }}>On Android</Typography>
            <ol style={{ margin: '0 0 14px', paddingLeft: 18, color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.55 }}>
              <li>Open your Camera and point it at the QR code (or tap Download on this phone).</li>
              <li>Open the download. If asked, allow installs from this site once.</li>
              <li>Tap Install, then Open ATLAS Mobile and sign in with your ATLAS account.</li>
            </ol>
            <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', mb: 0.75 }}>On iPhone</Typography>
            <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.55 }}>
              <li>Scan the QR code or tap Download to save the app file on your phone.</li>
              <li>Open the downloaded file and install it manually.</li>
              <li>Open ATLAS Mobile and sign in with your ATLAS account.</li>
            </ol>
          </GlassCard>
        </Box>

        <GlassCard title="About this app" style={{ marginBottom: 20 }}>
          <Typography sx={{ m: 0, color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.55 }}>
            ATLAS Mobile is the phone companion for ATLAS Web. Use it to scan printed exams in the classroom,
            send scores to your class record, and check your courses when you are away from a computer.
            It is an internal campus tool — not listed on the public app stores.
          </Typography>
        </GlassCard>

        <GlassCard title="Requirements & permissions">
          <Box component="ul" sx={{ m: 0, pl: 2.25, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
            <li>Works on Android 9+ phones, and on iPhones that can open the downloaded installer</li>
            <li>
              Storage needed:
              {' '}
              {release?.file_size_label || 'about 100 MB'}
            </li>
            <li>Camera — only to scan exam sheets</li>
            <li>Internet — to sign in and sync scores when you are online</li>
          </Box>
        </GlassCard>
      </Box>
    </FacultyLayout>
  )
}
