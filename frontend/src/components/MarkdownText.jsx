// src/components/MarkdownText.jsx
// Renders the Markdown that language models emit (**bold**, headings, bullets,
// tables, ...) as real React elements so generated content never shows raw
// "**" markers. Everything is built with React nodes — no dangerouslySetInnerHTML
// — so model output can never inject HTML.

import React, { useMemo } from 'react'
import Box from '@mui/material/Box'

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': '\u00a0',
  '&hellip;': '…',
  '&mdash;': '—',
  '&ndash;': '–',
  '&middot;': '·',
  '&bull;': '•',
}

const SAFE_URL = /^(https?:|mailto:|\/|#|\.)/i

const CODE_STYLE = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '0.92em',
  bgcolor: 'rgba(255,255,255,0.08)',
  borderRadius: '4px',
  padding: '1px 5px',
}

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
      const code = parseInt(hex, 16)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match
    })
    .replace(/&#(\d+);/g, (match, dec) => {
      const code = parseInt(dec, 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match
    })
    .replace(/&[a-z]+;/gi, match => {
      const key = match.toLowerCase()
      return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? ENTITIES[key] : match
    })
}

// ── Inline parsing ────────────────────────────────────────────────────────────
function parseInline(input, keyPrefix = 'n') {
  const text = decodeEntities(input)
  const nodes = []
  let buffer = ''
  let index = 0

  const flush = () => {
    if (!buffer) return
    nodes.push(<React.Fragment key={`${keyPrefix}-t${nodes.length}`}>{buffer}</React.Fragment>)
    buffer = ''
  }

  while (index < text.length) {
    const char = text[index]

    // `inline code`
    if (char === '`') {
      const end = text.indexOf('`', index + 1)
      if (end > index + 1) {
        flush()
        nodes.push(
          <code key={`${keyPrefix}-c${nodes.length}`} style={CODE_STYLE}>
            {text.slice(index + 1, end)}
          </code>,
        )
        index = end + 1
        continue
      }
    }

    // **bold** / __bold__
    if ((char === '*' || char === '_') && text[index + 1] === char) {
      const marker = char + char
      const end = text.indexOf(marker, index + 2)
      const inner = end > index + 2 ? text.slice(index + 2, end) : ''
      if (inner && inner.trim() === inner && !inner.includes('\n')) {
        flush()
        nodes.push(
          <strong key={`${keyPrefix}-b${nodes.length}`} style={{ fontWeight: 800 }}>
            {parseInline(inner, `${keyPrefix}-b${nodes.length}`)}
          </strong>,
        )
        index = end + 2
        continue
      }
    }

    // ~~strikethrough~~
    if (char === '~' && text[index + 1] === '~') {
      const end = text.indexOf('~~', index + 2)
      const inner = end > index + 2 ? text.slice(index + 2, end) : ''
      if (inner && inner.trim() === inner && !inner.includes('\n')) {
        flush()
        nodes.push(
          <span key={`${keyPrefix}-s${nodes.length}`} style={{ textDecoration: 'line-through' }}>
            {parseInline(inner, `${keyPrefix}-s${nodes.length}`)}
          </span>,
        )
        index = end + 2
        continue
      }
    }

    // *italic* / _italic_
    if (char === '*' || char === '_') {
      const end = text.indexOf(char, index + 1)
      const inner = end > index + 1 ? text.slice(index + 1, end) : ''
      const prev = index > 0 ? text[index - 1] : ''
      const next = end + 1 < text.length ? text[end + 1] : ''
      const wordSafe = char === '_' ? !/[\w]/.test(prev) && !/[\w]/.test(next) : true
      if (inner && inner.trim() === inner && !inner.includes('\n') && wordSafe) {
        flush()
        nodes.push(
          <em key={`${keyPrefix}-i${nodes.length}`}>
            {parseInline(inner, `${keyPrefix}-i${nodes.length}`)}
          </em>,
        )
        index = end + 1
        continue
      }
    }

    // [label](url)
    if (char === '[') {
      const labelEnd = text.indexOf(']', index + 1)
      if (labelEnd > index && text[labelEnd + 1] === '(') {
        const urlEnd = text.indexOf(')', labelEnd + 2)
        if (urlEnd > labelEnd) {
          const url = text.slice(labelEnd + 2, urlEnd).trim()
          if (SAFE_URL.test(url)) {
            flush()
            nodes.push(
              <a
                key={`${keyPrefix}-a${nodes.length}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#E24B4A', textDecoration: 'underline' }}
              >
                {parseInline(text.slice(index + 1, labelEnd), `${keyPrefix}-a${nodes.length}`)}
              </a>,
            )
            index = urlEnd + 1
            continue
          }
        }
      }
    }

    buffer += char
    index += 1
  }

  flush()
  return nodes
}

// ── Block parsing ─────────────────────────────────────────────────────────────
const HEADING_RE = /^(#{1,6})\s+(.*)$/
const RULE_RE = /^\s*([-*_])\s*(\1\s*){2,}$/
const BULLET_RE = /^(\s*)([-*+])\s+(.*)$/
const ORDERED_RE = /^(\s*)(\d+)[.)]\s+(.*)$/
const QUOTE_RE = /^\s*>\s?(.*)$/
const FENCE_RE = /^\s*```/

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line)
}

function isTableDivider(line) {
  return /^\s*\|[\s:|-]*\|\s*$/.test(line) && line.includes('-')
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
}

function isBlockStart(line, nextLine) {
  if (!line.trim()) return true
  if (FENCE_RE.test(line)) return true
  if (HEADING_RE.test(line)) return true
  if (RULE_RE.test(line)) return true
  if (QUOTE_RE.test(line)) return true
  if (BULLET_RE.test(line)) return true
  if (ORDERED_RE.test(line)) return true
  if (isTableRow(line) && nextLine && isTableDivider(nextLine)) return true
  return false
}

function parseBlocks(source) {
  const lines = decodeEntities(source).replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    // Fenced code block
    if (FENCE_RE.test(line)) {
      const body = []
      index += 1
      while (index < lines.length && !FENCE_RE.test(lines[index])) {
        body.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push({ type: 'code', text: body.join('\n') })
      continue
    }

    // Heading
    const heading = HEADING_RE.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() })
      index += 1
      continue
    }

    // Horizontal rule
    if (RULE_RE.test(line)) {
      blocks.push({ type: 'rule' })
      index += 1
      continue
    }

    // Table
    if (isTableRow(line) && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const header = splitTableRow(line)
      index += 2
      const rows = []
      while (index < lines.length && isTableRow(lines[index])) {
        rows.push(splitTableRow(lines[index]))
        index += 1
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }

    // Blockquote
    if (QUOTE_RE.test(line)) {
      const quote = []
      while (index < lines.length) {
        const match = QUOTE_RE.exec(lines[index])
        if (!match) break
        quote.push(match[1])
        index += 1
      }
      blocks.push({ type: 'quote', text: quote.join('\n') })
      continue
    }

    // Lists
    const ordered = ORDERED_RE.exec(line)
    if (ordered || BULLET_RE.test(line)) {
      const isOrdered = Boolean(ordered)
      const items = []
      while (index < lines.length) {
        const match = isOrdered ? ORDERED_RE.exec(lines[index]) : BULLET_RE.exec(lines[index])
        if (!match) break
        const indent = match[1].replace(/\t/g, '  ').length
        items.push({ level: Math.min(4, Math.floor(indent / 2)), text: match[3] })
        index += 1
      }
      blocks.push({ type: 'list', ordered: isOrdered, items })
      continue
    }

    // Paragraph
    const paragraph = []
    while (index < lines.length) {
      const current = lines[index]
      if (!current.trim()) break
      if (paragraph.length && isBlockStart(current, lines[index + 1])) break
      paragraph.push(current.trim())
      index += 1
    }
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join('\n') })
  }

  return blocks
}

// ── Block rendering ───────────────────────────────────────────────────────────
const HEADING_SIZES = { 1: '1.05rem', 2: '0.98rem', 3: '0.92rem', 4: '0.875rem', 5: '0.875rem', 6: '0.875rem' }

function renderBlock(block, index) {
  const key = `b${index}`

  switch (block.type) {
    case 'heading':
      return (
        <Box
          key={key}
          sx={{
            fontWeight: 800,
            fontSize: HEADING_SIZES[block.level] || '0.875rem',
            lineHeight: 1.4,
            mt: index === 0 ? 0 : 1.25,
            mb: 0.4,
            color: 'inherit',
          }}
        >
          {parseInline(block.text, key)}
        </Box>
      )

    case 'list':
      return (
        <Box
          key={key}
          component={block.ordered ? 'ol' : 'ul'}
          sx={{ m: 0, pl: 2.25, my: 0.75, '& li': { mb: 0.35 } }}
        >
          {block.items.map((item, itemIndex) => (
            <Box
              key={`${key}-i${itemIndex}`}
              component="li"
              sx={{ pl: item.level * 1.25, listStylePosition: 'outside' }}
            >
              {parseInline(item.text, `${key}-i${itemIndex}`)}
            </Box>
          ))}
        </Box>
      )

    case 'table':
      return (
        <Box
          key={key}
          component="table"
          sx={{ width: '100%', borderCollapse: 'collapse', my: 1, fontSize: '0.95em' }}
        >
          <Box component="thead">
            <Box component="tr">
              {block.header.map((cell, cellIndex) => (
                <Box
                  key={`${key}-h${cellIndex}`}
                  component="th"
                  sx={{
                    textAlign: 'left',
                    fontWeight: 800,
                    p: 0.75,
                    borderBottom: '1px solid rgba(255,255,255,0.18)',
                  }}
                >
                  {parseInline(cell, `${key}-h${cellIndex}`)}
                </Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {block.rows.map((row, rowIndex) => (
              <Box key={`${key}-r${rowIndex}`} component="tr">
                {row.map((cell, cellIndex) => (
                  <Box
                    key={`${key}-r${rowIndex}c${cellIndex}`}
                    component="td"
                    sx={{ verticalAlign: 'top', p: 0.75, borderBottom: '1px solid rgba(255,255,255,0.09)' }}
                  >
                    {parseInline(cell, `${key}-r${rowIndex}c${cellIndex}`)}
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      )

    case 'quote':
      return (
        <Box
          key={key}
          sx={{
            borderLeft: '3px solid rgba(226,75,74,0.55)',
            pl: 1.5,
            my: 1,
            opacity: 0.92,
            whiteSpace: 'pre-wrap',
          }}
        >
          {parseInline(block.text, key)}
        </Box>
      )

    case 'code':
      return (
        <Box
          key={key}
          component="pre"
          sx={{
            m: 0,
            my: 1,
            p: 1.25,
            bgcolor: 'rgba(0,0,0,0.28)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 1,
            overflowX: 'auto',
            fontSize: '0.85em',
          }}
        >
          {block.text}
        </Box>
      )

    case 'rule':
      return (
        <Box
          key={key}
          component="hr"
          sx={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.16)', my: 1.25 }}
        />
      )

    default:
      return (
        <Box key={key} sx={{ mb: 0.9, whiteSpace: 'pre-wrap' }}>
          {parseInline(block.text, key)}
        </Box>
      )
  }
}

// ── Public components ─────────────────────────────────────────────────────────
export function MarkdownInline({ text, sx = {} }) {
  return <Box component="span" sx={sx}>{parseInline(text, 'inline')}</Box>
}

export default function MarkdownText({ text, sx = {}, className }) {
  const blocks = useMemo(() => parseBlocks(text), [text])

  return (
    <Box
      className={className}
      sx={{
        fontSize: '0.875rem',
        lineHeight: 1.65,
        color: 'inherit',
        overflowWrap: 'anywhere',
        '& > *:last-child': { mb: 0 },
        ...sx,
      }}
    >
      {blocks.map((block, index) => renderBlock(block, index))}
    </Box>
  )
}
