// src/components/SidebarUserMenu.jsx
// Bottom-left account area for the dashboard sidebars: the user chip plus the
// profile menu that opens above it.
//
// Extracted verbatim from components/dashboardLayout.jsx so the faculty
// workspace renders it identically. Do not restyle one copy — change this file
// and both sidebars follow.

import { useState } from 'react'
import { Eye, EyeOff, KeyRound, LogOut, Settings, UserRound } from 'lucide-react'
import Alert from '@mui/material/Alert'
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
  bgcolor: '#18181E',
  color: '#F0F0F2',
  backgroundImage: 'none',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 3,
}
const PROFILE_FIELD_SX = {
  '& .MuiOutlinedInput-root': {
    color: '#F0F0F2',
    bgcolor: '#111318',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.24)' },
    '&.Mui-focused fieldset': { borderColor: '#16A34A' },
  },
  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.58)' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#86EFAC' },
  '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.48)' },
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
  const [open, setOpen] = useState(false)
  const [activeModal, setActiveModal] = useState(null)
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
  // Collapsed sidebars show only the avatar, so it centres and tightens up.
  const tight = collapsed && !isMobile

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
      setProfileNotice('Profile settings saved.')
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

  function handleThemePreferenceChange(event) {
    const nextTheme = event.target.checked ? 'light' : 'dark'
    setThemePreferenceState(setThemePreference(nextTheme))
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

  const itemStyle = {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '10px 14px', color: 'var(--text-primary)',
    fontSize: '0.85rem', fontFamily: 'var(--font-sans)', fontWeight: 500,
    transition: 'background 150ms',
  }
  const enter = e => { e.currentTarget.style.background = 'var(--shell-hover-bg)' }
  const leave = e => { e.currentTarget.style.background = 'none' }

  return (
    <div style={{
      borderTop: '1px solid var(--shell-divider)',
      padding: tight ? '12px 8px' : '12px 16px',
      flexShrink: 0,
      position: 'relative',
    }}>
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', background: 'var(--shell-chip-bg)',
          border: '1px solid var(--shell-border)', borderRadius: 12,
          padding: tight ? '8px' : '8px 12px',
          cursor: 'pointer', transition: 'all 200ms', justifyContent: tight ? 'center' : 'flex-start',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--shell-chip-hover-bg)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--shell-chip-bg)'}
      >
        {/* Avatar */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg, #15803D, #16A34A)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          fontSize: '0.78rem', fontWeight: 800, color: '#fff', flexShrink: 0,
        }}>
          {user?.picture_url
            ? <img src={user.picture_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : (user?.name || user?.email || 'U')[0].toUpperCase()}
        </div>
        {!tight && (
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name || user?.email?.split('@')[0] || 'User'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email || metaLabel}
            </div>
          </div>
        )}
      </button>

      {/* Profile menu */}
      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: 8, right: 8,
          // A collapsed rail is far narrower than this menu needs, so let it
          // overhang instead of crushing the labels.
          minWidth: tight ? 200 : undefined,
          background: 'var(--shell-menu-bg)', border: '1px solid var(--shell-menu-border)',
          borderRadius: 14, overflow: 'hidden',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          zIndex: 10,
        }}>
          {[
            { label: 'Profile Settings', modal: 'profile', Icon: UserRound, iconColor: '#A78BFA' },
            { label: 'Preferences', modal: 'preferences', Icon: Settings, iconColor: 'var(--shell-icon-strong)' },
          ].map(({ label, modal, Icon, iconColor }) => (
            <button
              type="button"
              key={label}
              style={itemStyle}
              onClick={() => {
                if (modal === 'profile') {
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
                } else if (modal === 'preferences') {
                  setThemePreferenceState(getThemePreference())
                  setGenerationNotificationsEnabledState(getGenerationNotificationsEnabled())
                  setNotificationPreferenceMessage('')
                }
                setOpen(false)
                setActiveModal(modal)
              }}
              onMouseEnter={enter}
              onMouseLeave={leave}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, color: iconColor, flexShrink: 0 }}>
                <Icon size={18} strokeWidth={2.25} aria-hidden="true" />
              </span>
              {label}
            </button>
          ))}
          <div style={{ height: 1, background: 'var(--shell-divider)', margin: '4px 0' }} />
          <button
            type="button"
            onClick={onSignOut}
            style={{ ...itemStyle, color: 'var(--brand-accent)', fontWeight: 600 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,80,80,0.08)' }}
            onMouseLeave={leave}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, color: '#F59E0B', flexShrink: 0 }}>
              <LogOut size={18} strokeWidth={2.25} aria-hidden="true" />
            </span>
            Sign Out
          </button>
        </div>
      )}

      <Dialog
        open={Boolean(activeModal)}
        onClose={() => setActiveModal(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: DIALOG_PAPER_SX }}
      >
        {activeModal === 'profile' ? (
          <>
            <form id="profile-settings-form" onSubmit={handleProfileSave} style={{ display: 'contents' }}>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '1rem', fontWeight: 700 }}>
              <UserRound size={18} color="#A78BFA" />
              Profile Settings
            </DialogTitle>
            <DialogContent dividers sx={{ borderColor: 'var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                  background: 'linear-gradient(135deg, #15803D, #16A34A)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 800, fontSize: '1.1rem',
                }}>
                  {profileForm.picture_url.trim()
                    ? <img src={profileForm.picture_url} alt="Profile preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (user?.name || user?.email || 'U')[0].toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, color: '#F0F0F2' }} noWrap>
                    {user?.name || user?.email?.split('@')[0] || 'User'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)', overflowWrap: 'anywhere' }}>
                    {user?.email || 'No email available'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#86EFAC' }}>{metaLabel}</Typography>
                </div>
              </div>

              {profileError && <Alert severity="error" sx={{ mb: 2 }}>{profileError}</Alert>}
              {profileNotice && <Alert severity="success" sx={{ mb: 2 }}>{profileNotice}</Alert>}

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
              <TextField
                label="Display image URL"
                type="url"
                value={profileForm.picture_url}
                onChange={event => setProfileForm(form => ({ ...form, picture_url: event.target.value }))}
                inputProps={{ maxLength: 500 }}
                placeholder="https://example.com/photo.jpg"
                helperText="Use a public image URL. Leave blank to use your initials."
                fullWidth
                size="small"
                sx={{ ...PROFILE_FIELD_SX, mb: 2 }}
              />

              <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 1.5 }} />
              {!changePasswordOpen ? (
                <Button
                  type="button"
                  variant="outlined"
                  startIcon={<KeyRound size={16} />}
                  onClick={() => setChangePasswordOpen(true)}
                  sx={{ borderColor: 'var(--shell-btn-border)', color: 'var(--text-primary)', textTransform: 'none', '&:hover': { borderColor: 'var(--brand-accent)', bgcolor: 'rgba(22,163,74,0.08)' } }}
                >
                  Change password
                </Button>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 700 }}>
                      CHANGE PASSWORD
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
                              sx={{ color: 'rgba(255,255,255,0.58)' }}
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
                              sx={{ color: 'rgba(255,255,255,0.58)' }}
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
                              sx={{ color: 'rgba(255,255,255,0.58)' }}
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
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button type="button" onClick={() => setActiveModal(null)} disabled={profileSaving} sx={{ color: 'var(--text-secondary)', textTransform: 'none' }}>Cancel</Button>
              <Button
                type="submit"
                variant="contained"
                disabled={profileSaving}
                startIcon={profileSaving ? <CircularProgress size={14} color="inherit" /> : null}
                sx={{ bgcolor: '#15803D', '&:hover': { bgcolor: '#14532D' }, textTransform: 'none', fontWeight: 700 }}
              >
                {profileSaving ? 'Saving…' : 'Save Profile'}
              </Button>
            </DialogActions>
            </form>
          </>
        ) : (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '1rem', fontWeight: 700 }}>
              <Settings size={18} />
              Preferences
            </DialogTitle>
            <DialogContent dividers sx={{ borderColor: 'var(--border-color)' }}>
              <div style={{ padding: '4px 0 14px' }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', display: 'block', mb: 0.5 }}>
                  APPEARANCE
                </Typography>
                <FormControlLabel
                  sx={{ ml: 0, mr: 0, width: '100%', justifyContent: 'space-between', '& .MuiFormControlLabel-label': { color: '#F0F0F2', fontSize: '0.85rem' } }}
                  label="Light mode"
                  labelPlacement="start"
                  control={(
                    <Switch
                      checked={themePreference === 'light'}
                      onChange={handleThemePreferenceChange}
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': { color: '#86EFAC' },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#15803D' },
                      }}
                    />
                  )}
                />
              </div>
              <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
              <FormControlLabel
                sx={{ mt: 1, ml: 0, mr: 0, width: '100%', justifyContent: 'space-between', '& .MuiFormControlLabel-label': { color: '#F0F0F2', fontSize: '0.85rem' } }}
                label="Generation notifications"
                labelPlacement="start"
                control={(
                  <Switch
                    checked={generationNotificationsEnabled}
                    onChange={handleNotificationPreferenceChange}
                    disabled={notificationPreferenceBusy || typeof window === 'undefined' || !('Notification' in window)}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': { color: '#86EFAC' },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#15803D' },
                    }}
                  />
                )}
              />
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', display: 'block', mt: 0.5 }}>
                Notify when syllabus, module, or assessment generation finishes.
              </Typography>
              {notificationPreferenceMessage && (
                <Alert severity={generationNotificationsEnabled ? 'success' : 'info'} sx={{ mt: 1.25, fontSize: '0.76rem' }}>
                  {notificationPreferenceMessage}
                </Alert>
              )}
              <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mt: 1.5 }} />
              <FormControlLabel
                sx={{ mt: 1, ml: 0, mr: 0, width: '100%', justifyContent: 'space-between', '& .MuiFormControlLabel-label': { color: '#F0F0F2', fontSize: '0.85rem' } }}
                label="Keep sidebar collapsed"
                labelPlacement="start"
                control={(
                  <Switch
                    checked={sidebarCollapsed}
                    onChange={event => onSidebarCollapsedChange?.(event.target.checked)}
                    disabled={isMobile || !onSidebarCollapsedChange}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': { color: '#86EFAC' },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#15803D' },
                    }}
                  />
                )}
              />
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', display: 'block', mt: 0.5 }}>
                Remember the sidebar width for this account across dashboard pages.
              </Typography>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button onClick={() => setActiveModal(null)} sx={{ color: 'var(--brand-accent)', textTransform: 'none' }}>Done</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </div>
  )
}
