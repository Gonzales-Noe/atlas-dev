// Renders the exact uploaded DOCX / PDF / Excel and makes native regions clickable.

import { useEffect, useRef, useState } from 'react'
import { Typography } from '@mui/material'
import { renderAsync } from 'docx-preview'
import * as pdfjs from 'pdfjs-dist'
import * as XLSX from 'xlsx'
import api from '../../../config/api'

// Served from /public so production nginx can load it as a plain script URL
// (hashed Vite ?url imports of .mjs often fail module fetch behind SPA fallback).
pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`

const HIGHLIGHT = {
  title: 'rgba(96,165,250,0.35)',
  content: 'rgba(134,239,172,0.4)',
  mapped: 'rgba(134,239,172,0.18)',
  selected: 'rgba(250,204,21,0.45)',
}

function kindFromName(name = '', fallback = '') {
  const ext = String(name).split('.').pop()?.toLowerCase() || ''
  if (['docx', 'pdf', 'xlsx', 'xls'].includes(ext)) return ext === 'xls' ? 'xlsx' : ext
  return fallback || ''
}

async function fetchTemplateBlob(fileUrl) {
  if (!fileUrl) return null
  const path = fileUrl.replace(/^\/api/, '') || '/users/institution-syllabus-template/file/'
  const response = await api.get(path, { responseType: 'blob' })
  return response.data
}

function paintHighlight(el, blockId, mappedIds, selectedIds, roleById) {
  const selected = selectedIds?.has?.(blockId)
  const role = roleById?.get?.(blockId)
  const mapped = mappedIds?.has?.(blockId)
  el.style.outline = selected ? '2px solid #f59e0b' : mapped ? '1px solid #86efac' : '1px solid transparent'
  el.style.background = selected
    ? HIGHLIGHT.selected
    : role === 'content'
      ? HIGHLIGHT.content
      : role === 'title'
        ? HIGHLIGHT.title
        : mapped
          ? HIGHLIGHT.mapped
          : 'transparent'
  el.style.cursor = 'pointer'
}

export default function SyllabusDocumentPreview({
  fileUrl,
  fileType,
  templateName,
  localFile,
  blocks,
  mappedIds,
  selectedIds,
  roleById,
  onBlockClick,
}) {
  const hostRef = useRef(null)
  const clickRef = useRef(onBlockClick)
  const highlightRef = useRef({ mappedIds, selectedIds, roleById })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sheetIndex, setSheetIndex] = useState(0)
  const [renderKey, setRenderKey] = useState(0)

  clickRef.current = onBlockClick
  highlightRef.current = { mappedIds, selectedIds, roleById }

  const kind = kindFromName(templateName, fileType)

  // Full document render when the file / sheet changes
  useEffect(() => {
    let cancelled = false
    const host = hostRef.current
    if (!host) return undefined

    async function paint() {
      setBusy(true)
      setError('')
      host.innerHTML = ''
      try {
        let blob = localFile || null
        if (!blob && fileUrl) blob = await fetchTemplateBlob(fileUrl)
        if (cancelled) return
        if (!blob) return

        const handleClick = block => clickRef.current?.(block)
        const getHl = () => highlightRef.current

        if (kind === 'docx') {
          await renderDocx(host, blob, blocks || [], handleClick, getHl)
        } else if (kind === 'pdf') {
          await renderPdf(host, blob, blocks || [], handleClick, getHl)
        } else if (kind === 'xlsx' || kind === 'xls') {
          await renderXlsx(host, blob, blocks || [], sheetIndex, handleClick, getHl, next => {
            setSheetIndex(next)
          })
        } else {
          setError('Unsupported file type for preview.')
        }
        if (!cancelled) setRenderKey(k => k + 1)
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not render the uploaded file.')
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    paint()
    return () => {
      cancelled = true
      if (host) host.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- highlights refresh separately
  }, [fileUrl, localFile, kind, sheetIndex, blocks])

  // Refresh highlight styles without re-parsing the file
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.querySelectorAll('[data-region-id]').forEach(el => {
      const id = el.getAttribute('data-region-id')
      paintHighlight(el, id, mappedIds, selectedIds, roleById)
    })
  }, [mappedIds, selectedIds, roleById, renderKey])

  if (!fileUrl && !localFile) {
    return (
      <Typography sx={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', p: 2 }}>
        Upload a .docx, .pdf, or .xlsx to see the exact file here. Every click is highlighted and recorded.
      </Typography>
    )
  }

  return (
    <div style={{ position: 'relative', minHeight: 320 }}>
      {busy && (
        <Typography sx={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', mb: 1 }}>
          Rendering your file…
        </Typography>
      )}
      {error && (
        <Typography sx={{ fontSize: '0.8rem', color: '#f87171', mb: 1 }}>{error}</Typography>
      )}
      <div
        ref={hostRef}
        className="syllabus-exact-preview"
        style={{
          background: '#fff',
          color: '#111',
          borderRadius: 6,
          minHeight: 280,
        }}
      />
    </div>
  )
}

async function renderDocx(host, blob, blocks, onClick, getHl) {
  const wrap = document.createElement('div')
  wrap.style.padding = '12px 16px'
  host.appendChild(wrap)
  await renderAsync(blob, wrap, undefined, {
    className: 'atlas-docx-preview',
    inWrapper: true,
    breakPages: true,
  })

  const paraBlocks = blocks.filter(b => String(b.id || '').startsWith('p-'))
  const tableBlocks = blocks.filter(b => String(b.id || '').startsWith('t-'))
  const hl = getHl()

  let pIdx = 0
  for (const p of wrap.querySelectorAll('p')) {
    const text = (p.textContent || '').trim()
    if (!text) continue
    const block = paraBlocks[pIdx]
    pIdx += 1
    if (!block) continue
    p.setAttribute('data-region-id', block.id)
    paintHighlight(p, block.id, hl.mappedIds, hl.selectedIds, hl.roleById)
    p.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      onClick(block)
    })
  }

  ;[...wrap.querySelectorAll('table')].forEach((table, index) => {
    const block = tableBlocks[index]
    if (!block) return
    table.setAttribute('data-region-id', block.id)
    paintHighlight(table, block.id, hl.mappedIds, hl.selectedIds, hl.roleById)
    table.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      onClick(block)
    })
  })
}

async function renderPdf(host, blob, blocks, onClick, getHl) {
  const data = await blob.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise
  const byPage = new Map()
  for (const block of blocks) {
    if (typeof block.page !== 'number') continue
    if (!byPage.has(block.page)) byPage.set(block.page, [])
    byPage.get(block.page).push(block)
  }
  const hl = getHl()

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1.25 })
    const pageWrap = document.createElement('div')
    pageWrap.style.position = 'relative'
    pageWrap.style.width = `${viewport.width}px`
    pageWrap.style.margin = '0 auto 16px'
    pageWrap.style.boxShadow = '0 1px 4px rgba(0,0,0,0.18)'

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.style.display = 'block'
    pageWrap.appendChild(canvas)
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise

    for (const block of byPage.get(pageNum - 1) || []) {
      const [x0, y0, x1, y1] = block.bbox || [0, 0, 0, 0]
      const pw = block.page_width || viewport.width / 1.25
      const ph = block.page_height || viewport.height / 1.25
      const scaleX = viewport.width / pw
      const scaleY = viewport.height / ph
      const hit = document.createElement('button')
      hit.type = 'button'
      hit.title = block.text
      hit.setAttribute('data-region-id', block.id)
      hit.style.position = 'absolute'
      hit.style.left = `${x0 * scaleX}px`
      hit.style.top = `${y0 * scaleY}px`
      hit.style.width = `${Math.max(8, (x1 - x0) * scaleX)}px`
      hit.style.height = `${Math.max(8, (y1 - y0) * scaleY)}px`
      hit.style.border = 'none'
      hit.style.padding = '0'
      hit.style.zIndex = '2'
      paintHighlight(hit, block.id, hl.mappedIds, hl.selectedIds, hl.roleById)
      hit.addEventListener('click', event => {
        event.preventDefault()
        onClick(block)
      })
      pageWrap.appendChild(hit)
    }
    host.appendChild(pageWrap)
  }
}

async function renderXlsx(host, blob, blocks, sheetIndex, onClick, getHl, setSheetIndex) {
  const data = await blob.arrayBuffer()
  const workbook = XLSX.read(data, { type: 'array' })
  const sheetNames = workbook.SheetNames || []
  if (!sheetNames.length) {
    host.textContent = 'This workbook has no sheets.'
    return
  }

  const hl = getHl()
  const tabs = document.createElement('div')
  tabs.style.display = 'flex'
  tabs.style.gap = '6px'
  tabs.style.flexWrap = 'wrap'
  tabs.style.padding = '8px'
  tabs.style.background = '#f3f4f6'
  sheetNames.forEach((name, index) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = name
    btn.style.padding = '4px 10px'
    btn.style.borderRadius = '4px'
    btn.style.border = index === sheetIndex ? '1px solid #16a34a' : '1px solid #d1d5db'
    btn.style.background = index === sheetIndex ? '#dcfce7' : '#fff'
    btn.style.cursor = 'pointer'
    btn.addEventListener('click', () => setSheetIndex(index))
    tabs.appendChild(btn)
  })
  host.appendChild(tabs)

  const activeIndex = Math.min(Math.max(sheetIndex, 0), sheetNames.length - 1)
  const sheet = workbook.Sheets[sheetNames[activeIndex]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const table = document.createElement('table')
  table.style.borderCollapse = 'collapse'
  table.style.width = '100%'
  table.style.fontSize = '12px'
  table.style.background = '#fff'

  const titleBlock = (blocks || []).find(b => b.sheet === activeIndex && b.kind === 'heading')
  if (titleBlock) {
    const caption = document.createElement('caption')
    caption.textContent = titleBlock.text
    caption.style.captionSide = 'top'
    caption.style.textAlign = 'left'
    caption.style.padding = '8px'
    caption.style.fontWeight = '700'
    caption.setAttribute('data-region-id', titleBlock.id)
    paintHighlight(caption, titleBlock.id, hl.mappedIds, hl.selectedIds, hl.roleById)
    caption.addEventListener('click', () => onClick(titleBlock))
    table.appendChild(caption)
  }

  const maxCols = Math.max(1, ...rows.map(r => (Array.isArray(r) ? r.length : 0)))
  rows.slice(0, 80).forEach((row, rIdx) => {
    const tr = document.createElement('tr')
    for (let c = 0; c < Math.min(maxCols, 40); c += 1) {
      const td = document.createElement('td')
      const value = Array.isArray(row) ? row[c] : ''
      const text = value == null ? '' : String(value)
      td.textContent = text
      td.style.border = '1px solid #e5e7eb'
      td.style.padding = '4px 6px'
      td.style.minWidth = '64px'
      if (text.trim()) {
        const blockId = `xls-${activeIndex}-r${rIdx + 1}-c${c + 1}`
        const block = (blocks || []).find(b => b.id === blockId) || {
          id: blockId,
          text,
          kind: 'paragraph',
          sheet: activeIndex,
          row: rIdx + 1,
          col: c + 1,
        }
        td.setAttribute('data-region-id', block.id)
        paintHighlight(td, block.id, hl.mappedIds, hl.selectedIds, hl.roleById)
        td.addEventListener('click', () => onClick(block))
      }
      tr.appendChild(td)
    }
    table.appendChild(tr)
  })
  host.appendChild(table)
}
