// Guided walkthrough for the faculty workspace.
// Navigates only the steps that matter, and shows sample generated output
// inside the TOS step so faculty know what the result looks like.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import IconButton from '@mui/material/IconButton'

const MAROON = 'var(--brand-primary)'

function SampleTos() {
  const rows = [
    { topic: 'Week 1 — Course orientation and core concepts', hours: 3, weight: 18.8, remember: 50, understand: 50 },
    { topic: 'Week 2 — Data models and relationships', hours: 4, weight: 25.0, remember: 50, understand: 50 },
    { topic: 'Week 3 — Normalization workshop', hours: 3, weight: 18.8, remember: 40, understand: 60 },
  ]
  return (
    <Box sx={{ mt: 1, border: '1px solid var(--workspace-border)', borderRadius: 1.25, overflow: 'hidden' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.62rem' }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--workspace-bg)' }}>
            <th style={{ padding: '4px 6px', textAlign: 'left', borderBottom: '1px solid var(--workspace-border)' }}>Topic</th>
            <th style={{ padding: '4px 6px', borderBottom: '1px solid var(--workspace-border)' }}>Hrs</th>
            <th style={{ padding: '4px 6px', borderBottom: '1px solid var(--workspace-border)' }}>Wt%</th>
            <th style={{ padding: '4px 6px', borderBottom: '1px solid var(--workspace-border)', color: MAROON }}>Rem</th>
            <th style={{ padding: '4px 6px', borderBottom: '1px solid var(--workspace-border)', color: MAROON }}>Und</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.topic} style={{ borderBottom: '1px solid var(--workspace-border)' }}>
              <td style={{ padding: '4px 6px', textAlign: 'left' }}>{row.topic}</td>
              <td style={{ padding: '4px 6px', textAlign: 'center' }}>{row.hours}</td>
              <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700, color: MAROON }}>{row.weight}%</td>
              <td style={{ padding: '4px 6px', textAlign: 'center' }}>{row.remember}%</td>
              <td style={{ padding: '4px 6px', textAlign: 'center' }}>{row.understand}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Box sx={{ px: 0.9, py: 0.5, bgcolor: 'rgba(170,36,35,0.05)', fontSize: '0.6rem', fontWeight: 600, color: MAROON }}>
        Sample: 1st Year · Remember + Understand · 60 items / 120 minutes
      </Box>
    </Box>
  )
}

const STEPS = [
  {
    tab: 'syllabus',
    selector: '[data-tour="pipeline"]',
    title: 'The six-step pipeline',
    body: 'Syllabus → Modules → TOS → Assessments → Grading → Analytics. A step is highlighted only while you are in it, or after you have finished it.',
  },
  {
    tab: 'syllabus',
    selector: '[data-tour="tab-syllabus"]',
    title: '1. Build the syllabus',
    body: 'Upload an existing file or let AI draft the sections. Your institution’s format decides which fields are yours to fill and which are fixed.',
  },
  {
    tab: 'syllabus',
    selector: '[data-tour="sources"]',
    title: 'Sources are optional',
    body: 'The Sources panel starts closed. Expand the rail only when you need to attach reference material for AI generation.',
  },
  {
    tab: 'tos',
    selector: '[data-tour="pipeline-step-tos"]',
    title: '3. Table of Specifications',
    body: 'TOS is built from the chapters in your TLA Activities. Each chapter carries its aligned ILOs and class hours, so the weights stay consistent.',
  },
  {
    tab: 'tos',
    selector: '[data-tour="tos-generate"]',
    title: 'Generate from the year level',
    body: 'The assigned year sets the Bloom target: 1st Year Remember + Understand, 2nd Year Apply, 3rd Year Analyze, 4th Year and above Evaluate + Create. Pick the chapters to cover, then apply the draft.',
    sample: true,
  },
  {
    tab: 'tos',
    selector: '[data-tour="tos-list"]',
    title: 'Review, then save',
    body: 'Applied rows land here. Edit anything you like — the TOS is only persisted when you click Save TOS.',
  },
  {
    tab: 'assessment',
    selector: '[data-tour="pipeline-step-assessment"]',
    title: '4. Assessments and beyond',
    body: 'Assessments reuse the TOS Bloom targets. After grading, the Analytics step turns the results into reports.',
  },
]

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export default function WorkspaceTour({ open, onClose, onNavigate }) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState(null)
  const navigateRef = useRef(onNavigate)
  navigateRef.current = onNavigate
  const lastStep = index === STEPS.length - 1
  const step = STEPS[index]

  useEffect(() => {
    if (open) setIndex(0)
  }, [open])

  const measure = useCallback((selector) => {
    const element = document.querySelector(selector)
    if (!element) return false
    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
    setRect(element.getBoundingClientRect())
    return true
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const current = STEPS[index]
    navigateRef.current?.(current.tab)

    let cancelled = false
    let attempts = 0
    let timer = null
    const tick = () => {
      if (cancelled) return
      if (measure(current.selector)) return
      attempts += 1
      if (attempts < 30) timer = setTimeout(tick, 100)
      else setRect(null)
    }
    timer = setTimeout(tick, 120)

    const onResize = () => { if (document.querySelector(current.selector)) measure(current.selector) }
    window.addEventListener('resize', onResize)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [open, index, measure])

  const finish = useCallback(() => { onClose?.() }, [onClose])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') finish()
      if (event.key === 'ArrowRight' || event.key === 'Enter') {
        if (lastStep) finish()
        else setIndex(current => Math.min(current + 1, STEPS.length - 1))
      }
      if (event.key === 'ArrowLeft') setIndex(current => Math.max(current - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, lastStep, finish])

  const layout = useMemo(() => {
    if (!rect) return { width: 360, left: 24, top: 24 }
    const width = Math.min(360, window.innerWidth - 24)
    const left = clamp(rect.left + rect.width / 2 - width / 2, 12, Math.max(12, window.innerWidth - width - 12))
    const roomBelow = window.innerHeight - rect.bottom
    const above = roomBelow < 280 && rect.top > 300
    const top = above ? Math.max(12, rect.top - 268) : Math.min(rect.bottom + 14, window.innerHeight - 280)
    return { width, left, top }
  }, [rect])

  if (!open) return null

  return (
    <Box sx={{ position: 'fixed', inset: 0, zIndex: 1600, pointerEvents: 'none' }}>
      {/* Keep the workspace still while the tour walks through it. */}
      <Box sx={{ position: 'fixed', inset: 0, pointerEvents: 'auto' }} />
      {rect ? (
        <Box sx={{
          position: 'fixed',
          left: rect.left - 6,
          top: rect.top - 6,
          width: rect.width + 12,
          height: rect.height + 12,
          borderRadius: 2,
          boxShadow: '0 0 0 9999px rgba(15,23,42,0.62)',
          border: `2px solid ${MAROON}`,
          transition: 'all .18s ease',
        }} />
      ) : (
        <Box sx={{ position: 'fixed', inset: 0, bgcolor: 'rgba(15,23,42,0.62)' }} />
      )}

      <Box
        role="dialog"
        aria-label={step.title}
        sx={{
          position: 'fixed',
          left: layout.left,
          top: layout.top,
          width: layout.width,
          pointerEvents: 'auto',
          bgcolor: 'var(--workspace-panel)',
          color: 'var(--workspace-text)',
          border: '1px solid var(--workspace-border)',
          borderRadius: 2.5,
          boxShadow: '0 18px 48px rgba(0,0,0,0.28)',
          p: 2,
        }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: MAROON, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Tour · {index + 1} of {STEPS.length}
            </Typography>
            <Typography sx={{ fontSize: '0.92rem', fontWeight: 800, mt: 0.35 }}>{step.title}</Typography>
          </Box>
          <IconButton size="small" onClick={finish} sx={{ color: 'var(--workspace-muted)', mt: -0.5, mr: -0.5 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Typography sx={{ fontSize: '0.78rem', lineHeight: 1.5, color: 'var(--workspace-muted)', mt: 0.75 }}>
          {step.body}
        </Typography>

        {step.sample && <SampleTos />}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.75 }}>
          <Box sx={{ display: 'flex', gap: 0.35, flex: 1 }}>
            {STEPS.map((item, dot) => (
              <Box key={item.title} sx={{
                width: dot === index ? 16 : 6, height: 6, borderRadius: 99,
                bgcolor: dot === index ? MAROON : 'var(--workspace-border)',
                transition: 'all .2s',
              }} />
            ))}
          </Box>
          <Button size="small" onClick={finish}
            sx={{ textTransform: 'none', fontSize: '0.72rem', color: 'var(--workspace-muted)', minWidth: 0 }}>
            Skip
          </Button>
          {index > 0 && (
            <Button size="small" onClick={() => setIndex(current => Math.max(0, current - 1))}
              sx={{ textTransform: 'none', fontSize: '0.72rem', color: 'var(--workspace-text)', minWidth: 0 }}>
              Back
            </Button>
          )}
          <Button size="small" variant="contained"
            onClick={() => (lastStep ? finish() : setIndex(current => current + 1))}
            sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 700, bgcolor: MAROON, '&:hover': { bgcolor: 'var(--brand-red-core)' } }}>
            {lastStep ? 'Finish' : 'Next'}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
