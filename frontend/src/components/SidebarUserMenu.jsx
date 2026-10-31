// src/components/SidebarUserMenu.jsx
// Bottom account area for the dashboard sidebars.
// Open: theme row, then the name card (opens account settings) and logout.
// Closed: theme icon, profile photo, logout icon. No menu beside the rail.
// The name card opens one centered dialog that combines profile and preferences.

import { useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LogoutIcon from '@mui/icons-material/Logout'
import InstallAppButton from './InstallAppButton'
import { isStandaloneDisplay, subscribeInstallPrompt } from '../utils/pwaInstall'
import { StatusNotice } from './StatusNotice'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
  getGenerationNotificationsEnabled,
  getThemePreference,
  setGenerationNotificationsEnabled,
  setThemePreference,
} from '../utils/userPreferences'

const DIALOG_PAPER_SX = {
  bgcolor: 'var(--shell-menu-bg)',
  color: 'var(--text-primary)',
  backgroundImage: 'none',
  border: '1px solid var(--shell-menu-border)',
  borderRadius: 3,
}
const SECTION_HEADING_SX = {
  m: 0,
  mb: 2,
  p: 0,
  fontSize: '1rem',
  fontWeight: 700,
  lineHeight: '24px',
  color: 'var(--text-primary)',
}
const SWITCH_SX = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--brand-accent)' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: 'var(--brand-primary)' },
}
const PREFERENCE_LABEL_SX = {
  ml: 0,
  mr: 0,
  width: '100%',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 2,
  '& .MuiFormControlLabel-label': { color: 'var(--text-primary)', fontSize: '0.875rem' },
}
const PROFILE_FIELD_SX = {
  '& .MuiOutlinedInput-root': {
    color: 'var(--text-primary)',
    bgcolor: 'var(--input-bg)',
    '& fieldset': { borderColor: 'var(--shell-btn-border)' },
    '&:hover fieldset': { borderColor: 'var(--text-tertiary)' },
    '&.Mui-focused fieldset': { borderColor: 'var(--brand-primary)' },
  },
  '& .MuiInputLabel-root': { color: 'var(--text-secondary)' },
  '& .MuiInputLabel-root.Mui-focused': { color: 'var(--brand-accent)' },
  '& .MuiFormHelperText-root': { color: 'var(--text-tertiary)' },
}

export default function SidebarUserMenu({
  user,
  metaLabel = 'User',
  collapsed = false,
  isMobile = false,
  sidebarCollapsed = false,
  onSidebarCollapsedChange,
  onUpdateProfile,
  onSignOut,
}) {
  const [activeModal, setActiveModal] = useState(null)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [profileForm, setProfileForm] = useState({
    full_name: user?.full_name || user?.name || '',
    picture_url: user?.picture_url || '',
    current_password: '',
    new_password: '',
    confirm_password: '',
  })
  const [profileError, setProfileError] = useState('')
  const [profileNotice, setProfileNotice] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [themePreference, setThemePreferenceState] = useState(getThemePreference)
  const [generationNotificationsEnabled, setGenerationNotificationsEnabledState] = useState(getGenerationNotificationsEnabled)
  const [notificationPreferenceMessage, setNotificationPreferenceMessage] = useState('')
  const [notificationPreferenceBusy, setNotificationPreferenceBusy] = useState(false)
  const [canInstallApp, setCanInstallApp] = useState(false)
  const [appInstalled, setAppInstalled] = useState(() => isStandaloneDisplay())
  // Closed rail: theme icon, profile photo, logout. Open bar keeps the labels.
  const tight = collapsed && !isMobile

  useEffect(() => {
    const syncTheme = () => setThemePreferenceState(getThemePreference())
    window.addEventListener('atlas-theme-change', syncTheme)
    return () => window.removeEventListener('atlas-theme-change', syncTheme)
  }, [])

  useEffect(() => {
    if (isStandaloneDisplay()) {
      setAppInstalled(true)
      setCanInstallApp(false)
      return undefined
    }
    return subscribeInstallPrompt((prompt) => {
      setCanInstallApp(Boolean(prompt))
      setAppInstalled(false)
    })
  }, [])

  async function handleProfileSave(event) {
    event.preventDefault()
    setProfileError('')
    setProfileNotice('')

    const fullName = profileForm.full_name.trim()
    const currentPassword = profileForm.current_password
    const newPassword = profileForm.new_password
    const confirmPassword = profileForm.confirm_password
    const changingPassword = Boolean(currentPassword || newPassword || confirmPassword)

    if (!fullName) {
      setProfileError('Display name is required.')
      return
    }
    if (changingPassword && !currentPassword) {
      setProfileError('Enter your current password to set a new one.')
      return
    }
    if (changingPassword && newPassword.length < 8) {
      setProfileError('New password must be at least 8 characters.')
      return
    }
    if (changingPassword && newPassword !== confirmPassword) {
      setProfileError('New passwords do not match.')
      return
    }
    if (!onUpdateProfile) {
      setProfileError('Profile updates are unavailable right now.')
      return
    }

    const payload = {
      full_name: fullName,
      picture_url: profileForm.picture_url.trim(),
    }
    if (changingPassword) {
      payload.current_password = currentPassword
      payload.new_password = newPassword
    }

    setProfileSaving(true)
    try {
      await onUpdateProfile(payload)
      setProfileForm(current => ({
        ...current,
        current_password: '',
        new_password: '',
        confirm_password: '',
      }))
      setProfileNotice('Account settings saved.')
    } catch (err) {
      const apiErrors = err.response?.data
      setProfileError(
        apiErrors?.detail
        || apiErrors?.current_password?.[0]
        || apiErrors?.new_password?.[0]
        || apiErrors?.picture_url?.[0]
        || apiErrors?.full_name?.[0]
        || err.message
        || 'Could not save profile settings.'
      )
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleNotificationPreferenceChange(event) {
    setNotificationPreferenceBusy(true)
    setNotificationPreferenceMessage('')
    try {
      const result = await setGenerationNotificationsEnabled(event.target.checked)
      setGenerationNotificationsEnabledState(result.enabled)
      if (result.reason === 'denied' || result.reason === 'default') {
        setNotificationPreferenceMessage('Notifications are blocked. Allow them in your browser site settings to enable alerts.')
      } else if (result.reason === 'unsupported') {
        setNotificationPreferenceMessage('This browser does not support desktop notifications.')
      } else if (result.reason === 'storage') {
        setNotificationPreferenceMessage('Could not save this preference in browser storage.')
      } else if (result.enabled) {
        setNotificationPreferenceMessage('Completion notifications are enabled.')
      }
    } finally {
      setNotificationPreferenceBusy(false)
    }
  }

  function openAccount() {
    setProfileForm({
      full_name: user?.full_name || user?.name || '',
      picture_url: user?.picture_url || '',
      current_password: '',
      new_password: '',
      confirm_password: '',
    })
    setProfileError('')
    setProfileNotice('')
    setChangePasswordOpen(false)
    setShowCurrentPassword(false)
    setShowNewPassword(false)
    setShowConfirmPassword(false)
    setGenerationNotificationsEnabledState(getGenerationNotificationsEnabled())
    setNotificationPreferenceMessage('')
    setActiveModal('account')
  }

  const emboss = {
    background: 'var(--shell-chip-bg)',
    border: '1px solid var(--shell-border)',
    boxShadow: 'inset 0 1px 0 var(--shell-emboss-highlight), inset 0 -1px 2px var(--shell-emboss-shade)',
  }
  const ThemeIcon = themePreference === 'light' ? LightModeIcon : DarkModeIcon

  const themeLabel = themePreference === 'light' ? 'Light mode' : 'Dark mode'
  const displayName = user?.name || user?.email?.split('@')[0] || 'User'
  const displayEmail = user?.email || ''
  const avatarInitial = (user?.name || user?.email || 'U')[0].toUpperCase()

  function avatar(size = 32, src = user?.picture_url, alt = '') {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--brand-primary-hover), var(--brand-primary))',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        fontSize: size > 40 ? '1.1rem' : '0.78rem', fontWeight: 800, color: '#fff', flexShrink: 0,
      }}>
        {src
          ? <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : avatarInitial}
      </div>
    )
  }

  const logoutButton = (
    <button
      type="button"
      onClick={() => setConfirmLogout(true)}
      aria-label="Click to Logout"
      title="Click to Logout"
      style={{
        ...emboss,
        width: tight ? '100%' : 42,
        height: 42,
        marginTop: tight ? 4 : 0,
        borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--brand-primary)', cursor: 'pointer', flexShrink: 0,
      }}
    >
      <LogoutIcon sx={{ fontSize: 20 }} />
    </button>
  )

  return (
    <div style={{
      borderTop: '1px solid var(--shell-divider)',
      padding: '8px 8px 12px',
      flexShrink: 0,
    }}>
      <button
        type="button"
        title={tight ? themeLabel : undefined}
        aria-label={themeLabel}
        aria-pressed={themePreference === 'light'}
        onClick={() => setThemePreferenceState(setThemePreference(themePreference === 'light' ? 'dark' : 'light'))}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: tight ? 'center' : 'space-between',
          gap: tight ? 0 : 12, width: '100%',
          height: tight ? 42 : undefined,
          padding: tight ? 0 : '10px 8px',
          margin: '2px 0', border: 'none', borderRadius: 12,
          background: 'transparent', cursor: 'pointer',
          color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)',
          fontSize: '0.875rem', fontWeight: 500,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--shell-hover-bg)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: tight ? 0 : 12 }}>
          <ThemeIcon sx={{ fontSize: 20, color: 'var(--shell-icon)' }} />
          {!tight && themeLabel}
        </span>
        {!tight && (
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: themePreference === 'light' ? 'var(--brand-primary)' : 'var(--text-tertiary)' }}>
            {themePreference === 'light' ? 'On' : 'Off'}
          </span>
        )}
      </button>

      {tight ? (
        <button
          type="button"
          onClick={openAccount}
          aria-label="Account settings"
          title="Account settings"
          style={{
            ...emboss,
            width: '100%',
            height: 42,
            margin: '4px 0',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', padding: 0,
          }}
        >
          {avatar(28)}
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={openAccount}
            aria-label="Account settings"
            style={{
              ...emboss,
              display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0,
              borderRadius: 10, padding: '8px 10px', cursor: 'pointer', textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            {avatar()}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </span>
              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayEmail || metaLabel}
              </span>
            </span>
          </button>
          {logoutButton}
        </div>
      )}
      {tight && logoutButton}

      <Dialog
        open={activeModal === 'account'}
        onClose={() => { if (!profileSaving) setActiveModal(null) }}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { ...DIALOG_PAPER_SX, width: '100%', maxWidth: 760 } }}
      >
        <form id="account-settings-form" onSubmit={handleProfileSave} style={{ display: 'contents' }}>
          <DialogTitle sx={{ fontSize: '1.15rem', fontWeight: 700, lineHeight: '28px', pb: 1.5 }}>
            Account settings
          </DialogTitle>
          <DialogContent dividers sx={{ borderColor: 'var(--shell-divider)', px: 3, py: 2.5 }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
                alignItems: 'start',
              }}
            >
              <Box sx={{ minWidth: 0, pr: { md: 3 } }}>
                <Typography component="h2" sx={SECTION_HEADING_SX}>Profile</Typography>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                  {avatar(56, profileForm.picture_url.trim(), 'Profile preview')}
                  <div style={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, lineHeight: '24px', color: 'var(--text-primary)' }} noWrap>
                      {displayName}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
                      {displayEmail || 'No email available'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'var(--brand-accent)' }}>{metaLabel}</Typography>
                  </div>
                </div>

                <StatusNotice message={profileError} severity="error" />
                <StatusNotice message={profileNotice} severity="success" />

                <TextField
                  label="Display name"
                  value={profileForm.full_name}
                  onChange={event => setProfileForm(form => ({ ...form, full_name: event.target.value }))}
                  inputProps={{ maxLength: 255 }}
                  autoComplete="name"
                  fullWidth
                  size="small"
                  sx={{ ...PROFILE_FIELD_SX, mb: 2 }}
                />

                {!changePasswordOpen ? (
                  <Button
                    type="button"
                    variant="outlined"
                    startIcon={<KeyRound size={16} />}
                    onClick={() => setChangePasswordOpen(true)}
                    sx={{
                      alignSelf: 'flex-start',
                      borderColor: 'var(--shell-btn-border)',
                      bgcolor: 'var(--shell-btn-bg)',
                      color: 'var(--text-primary)',
                      textTransform: 'none',
                      fontWeight: 600,
                      borderRadius: '10px',
                      px: 1.75,
                      py: 1,
                      '&:hover': { borderColor: 'var(--brand-accent)', bgcolor: 'rgba(170,36,35,0.08)' },
                    }}
                  >
                    Change password
                  </Button>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <Typography sx={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.875rem' }}>
                        Change password
                      </Typography>
                      <Button
                        type="button"
                        size="small"
                        onClick={() => {
                          setChangePasswordOpen(false)
                          setShowCurrentPassword(false)
                          setShowNewPassword(false)
                          setShowConfirmPassword(false)
                          setProfileForm(form => ({ ...form, current_password: '', new_password: '', confirm_password: '' }))
                        }}
                        sx={{ color: 'var(--text-secondary)', textTransform: 'none' }}
                      >
                        Cancel
                      </Button>
                    </div>
                    <Stack spacing={1.5}>
                      <TextField
                        label="Current password"
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={profileForm.current_password}
                        onChange={event => setProfileForm(form => ({ ...form, current_password: event.target.value }))}
                        autoComplete="current-password"
                        slotProps={{
                          input: {
                            endAdornment: (
                              <InputAdornment position="end">
                                <IconButton
                                  type="button"
                                  edge="end"
                                  size="small"
                                  aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                                  title={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                                  onClick={() => setShowCurrentPassword(show => !show)}
                                  sx={{ color: 'var(--text-secondary)' }}
                                >
                                  {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </IconButton>
                              </InputAdornment>
                            ),
                          },
                        }}
                        fullWidth size="small" sx={PROFILE_FIELD_SX}
                      />
                      <TextField
                        label="New password"
                        type={showNewPassword ? 'text' : 'password'}
                        value={profileForm.new_password}
                        onChange={event => setProfileForm(form => ({ ...form, new_password: event.target.value }))}
                        autoComplete="new-password"
                        helperText="At least 8 characters."
                        slotProps={{
                          input: {
                            endAdornment: (
                              <InputAdornment position="end">
                                <IconButton
                                  type="button"
                                  edge="end"
                                  size="small"
                                  aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                                  title={showNewPassword ? 'Hide new password' : 'Show new password'}
                                  onClick={() => setShowNewPassword(show => !show)}
                                  sx={{ color: 'var(--text-secondary)' }}
                                >
                                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </IconButton>
                              </InputAdornment>
                            ),
                          },
                        }}
                        fullWidth size="small" sx={PROFILE_FIELD_SX}
                      />
                      <TextField
                        label="Confirm new password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={profileForm.confirm_password}
                        onChange={event => setProfileForm(form => ({ ...form, confirm_password: event.target.value }))}
                        autoComplete="new-password"
                        slotProps={{
                          input: {
                            endAdornment: (
                              <InputAdornment position="end">
                                <IconButton
                                  type="button"
                                  edge="end"
                                  size="small"
                                  aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                                  title={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                                  onClick={() => setShowConfirmPassword(show => !show)}
                                  sx={{ color: 'var(--text-secondary)' }}
                                >
                                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </IconButton>
                              </InputAdornment>
                            ),
                          },
                        }}
                        fullWidth size="small" sx={PROFILE_FIELD_SX}
                      />
                    </Stack>
                  </>
                )}
              </Box>

              <Box
                sx={{
                  minWidth: 0,
                  pl: { md: 3 },
                  pt: { xs: 3, md: 0 },
                  borderLeft: { xs: 'none', md: '1px solid var(--shell-divider)' },
                  borderTop: { xs: '1px solid var(--shell-divider)', md: 'none' },
                }}
              >
                <Typography component="h2" sx={SECTION_HEADING_SX}>Preferences</Typography>
                <FormControlLabel
                  sx={PREFERENCE_LABEL_SX}
                  label="Notifications"
                  labelPlacement="start"
                  control={(
                    <Switch
                      checked={generationNotificationsEnabled}
                      onChange={handleNotificationPreferenceChange}
                      disabled={notificationPreferenceBusy || typeof window === 'undefined' || !('Notification' in window)}
                      sx={SWITCH_SX}
                    />
                  )}
                />
                <Typography variant="caption" sx={{ color: 'var(--text-tertiary)', display: 'block', mt: 0.5 }}>
                  Notify when syllabus, module, or assessment generation finishes.
                </Typography>
                <StatusNotice
                  message={notificationPreferenceMessage}
                  severity={generationNotificationsEnabled ? 'success' : 'info'}
                />
                <Divider sx={{ borderColor: 'var(--shell-divider)', mt: 1.5 }} />
                <FormControlLabel
                  sx={{ ...PREFERENCE_LABEL_SX, mt: 1 }}
                  label="Keep sidebar collapsed"
                  labelPlacement="start"
                  control={(
                    <Switch
                      checked={sidebarCollapsed}
                      onChange={event => onSidebarCollapsedChange?.(event.target.checked)}
                      disabled={isMobile || !onSidebarCollapsedChange}
                      sx={SWITCH_SX}
                    />
                  )}
                />
                <Typography variant="caption" sx={{ color: 'var(--text-tertiary)', display: 'block', mt: 0.5 }}>
                  Remember the sidebar width for this account across dashboard pages.
                </Typography>
                {!appInstalled && (
                  <>
                    <Divider sx={{ borderColor: 'var(--shell-divider)', mt: 1.5 }} />
                    <div style={{ padding: '14px 0 4px' }}>
                      <Typography variant="caption" sx={{ color: 'var(--text-secondary)', display: 'block', mb: 1, fontWeight: 700, letterSpacing: '0.04em' }}>
                        Device
                      </Typography>
                      {canInstallApp ? (
                        <InstallAppButton
                          fullWidth
                          label="Install ATLAS on this device"
                          style={{
                            padding: '0.65rem 1rem',
                            fontSize: '0.85rem',
                            borderRadius: 10,
                            background: 'var(--shell-btn-bg)',
                            border: '1px solid var(--shell-btn-border)',
                            color: 'var(--text-primary)',
                            fontWeight: 600,
                          }}
                        />
                      ) : (
                        <Typography variant="caption" sx={{ color: 'var(--text-tertiary)', display: 'block' }}>
                          On Chrome or Edge, an Install button appears when ATLAS is installable. On iPhone or iPad, use Share, then Add to Home Screen.
                        </Typography>
                      )}
                    </div>
                  </>
                )}
              </Box>
            </Box>
          </DialogContent>
          <DialogActions
            sx={{
              px: 3,
              py: 2,
              gap: 2.5,
              alignItems: 'center',
              '& > :not(style) ~ :not(style)': { ml: 0 },
            }}
          >
            <Button
              type="button"
              onClick={() => setActiveModal(null)}
              disabled={profileSaving}
              sx={{ color: 'var(--text-secondary)', textTransform: 'none', minHeight: 40, px: 1.5 }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={profileSaving}
              startIcon={profileSaving ? <CircularProgress size={14} color="inherit" /> : null}
              sx={{
                bgcolor: 'var(--brand-primary)',
                '&:hover': { bgcolor: 'var(--brand-primary-hover)' },
                textTransform: 'none',
                fontWeight: 700,
                minHeight: 40,
                px: 2.5,
                boxShadow: 'none',
              }}
            >
              {profileSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: DIALOG_PAPER_SX }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '1rem', fontWeight: 700 }}>
          <LogoutIcon sx={{ fontSize: 18, color: 'var(--brand-primary)' }} />
          Sign out?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            You will leave ATLAS and need to sign in again.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setConfirmLogout(false)} sx={{ color: 'var(--text-secondary)', textTransform: 'none' }}>
            Stay signed in
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setConfirmLogout(false)
              onSignOut?.()
            }}
            sx={{ bgcolor: 'var(--brand-primary)', '&:hover': { bgcolor: 'var(--brand-primary-hover)' }, textTransform: 'none', fontWeight: 700 }}
          >
            Sign out
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
