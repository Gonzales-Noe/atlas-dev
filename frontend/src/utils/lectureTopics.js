// Topics for TOS rows and learning modules.
// A module comes from a Topics / Reading List cell. Delivery method does not
// decide that. Class orientation and examination rows are not topics. A
// reading list is not a topic. The activity is the last unindented line,
// kept apart from the topic and subtopic lines.

const READING_HEADING = /^(?:required\s+|recommended\s+|supplementary\s+)?(?:reading(?:\s*list)?|readings|references?|bibliography|text\s*books?|textbooks?)\b/i

export function isLectureDiscussionDelivery(delivery) {
  const compact = String(delivery || '').trim().toLowerCase().replace(/[\s/_-]+/g, '')
  return compact === 'lecturediscussion' || (compact.includes('lecture') && compact.includes('discussion'))
}

export function isOrientationOrExam(title) {
  const text = String(title || '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!text) return false
  if (text === 'class orientation' || text === 'orientation' || text === 'introduction to the course' || text.startsWith('class orientation')) {
    return true
  }
  if (/\b(?:midterm|final|prelim(?:inary)?|comprehensive)\b.{0,40}\bexam/.test(text)) return true
  if (/^(?:the\s+)?exam(?:ination)?$/.test(text)) return true
  if (text.includes('submission of requirements') && text.includes('exam')) return true
  return false
}

function isReadingHeading(line) {
  return READING_HEADING.test(String(line || '').trim())
}

export function lectureTopicLines(raw) {
  return parseTopicsCell(raw).lines
}

export function parseTopicsCell(raw) {
  const kept = []
  let skipping = false
  String(raw || '').split(/\r?\n/).forEach(rawLine => {
    if (!rawLine.trim()) return
    const indented = /^[ \t]/.test(rawLine)
    const stripped = rawLine.trim().replace(/^(?:[-*•–—]|\d+[.)])\s*/, '').trim()
    if (!stripped) return
    if (isReadingHeading(stripped)) {
      skipping = true
      return
    }
    if (/^(topics?|lecture(?:\s*\/\s*discussion)?|discussion)\s*:/i.test(stripped)) {
      skipping = false
      const rest = stripped.replace(/^.*?:\s*/, '').trim()
      if (rest && !isReadingHeading(rest)) kept.push({ indented: false, text: rest })
      return
    }
    if (skipping) return
    kept.push({ indented, text: stripped })
  })
  const lines = kept.map(item => item.text)
  if (!kept.length) {
    return { title: '', subtopics: [], activity: '', lines: [], structured: false }
  }
  const unindented = kept.map((item, index) => (item.indented ? -1 : index)).filter(index => index >= 0)
  const indentedTexts = kept.filter(item => item.indented).map(item => item.text)
  if (indentedTexts.length && unindented.length) {
    const title = kept[unindented[0]].text
    const activity = unindented.length >= 2 ? kept[unindented[unindented.length - 1]].text : ''
    const end = unindented.length >= 2 ? unindented[unindented.length - 1] : kept.length
    const subtopics = kept
      .filter((item, index) => item.indented && index > unindented[0] && index < end)
      .map(item => item.text)
    return {
      title,
      subtopics: subtopics.length ? subtopics : indentedTexts,
      activity,
      lines,
      structured: true,
    }
  }
  return {
    title: lines[0],
    subtopics: [],
    activity: '',
    lines,
    structured: false,
  }
}

function chapterWeekSpan(weeks) {
  const numbers = String(weeks || '').match(/\d+/g)?.map(Number) || []
  if (numbers.length >= 2) {
    return Math.max(1, Math.min(8, Math.max(...numbers) - Math.min(...numbers) + 1))
  }
  return 1
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

function outlineLines(parsed) {
  return parsed.lines.filter(line => line !== parsed.activity)
}

export function collectLectureDiscussionTopics(chapters) {
  const byWeek = new Map()
  ;(chapters || []).forEach((chapter, index) => {
    const parsed = parseTopicsCell(chapter?.topics)
    if (!parsed.lines.length || isOrientationOrExam(parsed.title)) return
    const week = parseInt(chapter?.chapter, 10) || index + 1
    const existing = byWeek.get(week)
    const ilos = iloKeysFromChapter(chapter)
    const body = outlineLines(parsed)
    const span = chapterWeekSpan(chapter?.weeks)
    const outcomes = String(chapter?.outcomes || '')
    if (!existing) {
      byWeek.set(week, {
        id: `topic-week-${week}`,
        week,
        title: parsed.title,
        subtopics: body.slice(1),
        activity: parsed.activity,
        lines: [...body],
        topic: body.join('; '),
        ilos,
        span,
        outcomes,
        context: String(chapter?.topics || ''),
      })
      return
    }
    existing.span = Math.max(existing.span || 1, span)
    if (!existing.outcomes && outcomes) existing.outcomes = outcomes
    body.forEach((line) => {
      if (!existing.lines.some(item => item.toLowerCase() === line.toLowerCase())) {
        existing.lines.push(line)
      }
    })
    existing.subtopics = existing.lines.slice(1)
    if (parsed.activity) existing.activity = parsed.activity
    ilos.forEach((key) => {
      if (!existing.ilos.includes(key)) existing.ilos.push(key)
    })
    existing.topic = existing.lines.join('; ')
    if (!existing.context) existing.context = String(chapter?.topics || '')
  })
  return [...byWeek.values()].sort((left, right) => left.week - right.week)
}
