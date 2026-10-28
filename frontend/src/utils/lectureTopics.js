// Lecture/Discussion topics for TOS rows and learning modules.
// Weekly schedule cells mix the topic list and the reading list in one field.
// Reading lists are not topics. Several lecture rows in the same week become
// one choice.

const READING_HEADING = /^(?:required\s+|recommended\s+|supplementary\s+)?(?:reading(?:\s*list)?|readings|references?|bibliography|text\s*books?|textbooks?)\b/i

export function isLectureDiscussionTask(outcomes) {
  const compact = String(outcomes || '').trim().toLowerCase().replace(/[\s/_-]+/g, '')
  return compact === 'lecturediscussion' || (compact.includes('lecture') && compact.includes('discussion'))
}

function isReadingHeading(line) {
  return READING_HEADING.test(String(line || '').trim())
}

export function lectureTopicLines(raw) {
  const kept = []
  let skipping = false
  for (const rawLine of String(raw || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const stripped = line.replace(/^\s*(?:[-*•–—]|\d+[.)])\s*/, '').trim()
    if (!stripped) continue
    if (isReadingHeading(stripped)) {
      skipping = true
      continue
    }
    if (/^(topics?|lecture(?:\s*\/\s*discussion)?|discussion)\s*:/i.test(stripped)) {
      skipping = false
      const rest = stripped.replace(/^.*?:\s*/, '').trim()
      if (rest && !isReadingHeading(rest)) kept.push(rest)
      continue
    }
    if (skipping) continue
    kept.push(stripped)
  }
  return kept
}

function iloKeysFromChapter(chapter) {
  const keys = []
  const add = (value) => {
    const number = parseInt(String(value).replace(/\D/g, ''), 10)
    const key = number > 0 ? `ILO${number}` : ''
    if (key && !keys.includes(key)) keys.push(key)
  }
  String(chapter?.ilo || '').split(/[,;/]+/).forEach(add)
  ;(Array.isArray(chapter?.ilo_refs) ? chapter.ilo_refs : []).forEach(add)
  return keys
}

export function collectLectureDiscussionTopics(chapters) {
  const byWeek = new Map()
  ;(chapters || []).forEach((chapter, index) => {
    if (!isLectureDiscussionTask(chapter?.outcomes)) return
    const lines = lectureTopicLines(chapter?.topics)
    if (!lines.length) return
    const week = parseInt(chapter?.chapter, 10) || index + 1
    const existing = byWeek.get(week)
    const ilos = iloKeysFromChapter(chapter)
    if (!existing) {
      byWeek.set(week, {
        id: `lecture-week-${week}`,
        week,
        lines: [...lines],
        topic: lines.join('; '),
        ilos,
        context: 'Lecture/Discussion',
      })
      return
    }
    lines.forEach((line) => {
      if (!existing.lines.some(item => item.toLowerCase() === line.toLowerCase())) {
        existing.lines.push(line)
      }
    })
    ilos.forEach((key) => {
      if (!existing.ilos.includes(key)) existing.ilos.push(key)
    })
    existing.topic = existing.lines.join('; ')
  })
  return [...byWeek.values()].sort((left, right) => left.week - right.week)
}
