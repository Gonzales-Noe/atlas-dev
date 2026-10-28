// Institutional Table of Specifications allocation.
// Weight follows class hours. Topic points and exam minutes are the same
// share of the exam totals. Bloom item counts follow each topic's Bloom
// percentages. Largest-remainder rounding keeps every group of integers
// equal to its total.

export const BLOOM_KEYS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']

// Institutional cognitive split: 60% Remember + Understand, 30% Apply + Analyze,
// 10% Evaluate + Create. Each pair is shared evenly.
export const INSTITUTIONAL_BLOOM_PCT = [30, 30, 15, 15, 5, 5]

export function institutionalBloomPercents(ceiling) {
  const cap = Math.max(1, Math.min(6, Math.round(Number(ceiling) || 6)))
  const weights = INSTITUTIONAL_BLOOM_PCT.map((weight, index) => (index < cap ? weight : 0))
  return largestRemainder(100, weights)
}

export function largestRemainder(total, weights) {
  const count = weights.length
  const target = Math.max(0, Math.round(Number(total) || 0))
  if (count === 0 || target === 0) return Array(count).fill(0)

  const safe = weights.map(weight => {
    const number = Number(weight)
    return Number.isFinite(number) && number > 0 ? number : 0
  })
  const sum = safe.reduce((totalWeight, weight) => totalWeight + weight, 0)
  if (sum <= 0) return Array(count).fill(0)

  const raw = safe.map(weight => (weight / sum) * target)
  const alloc = raw.map(value => Math.floor(value + 1e-9))
  const remaining = target - alloc.reduce((totalAllocated, value) => totalAllocated + value, 0)
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value + 1e-9) }))
    .sort((a, b) => (b.fraction - a.fraction) || (a.index - b.index))

  for (let index = 0; index < remaining && index < order.length; index += 1) {
    alloc[order[index].index] += 1
  }
  return alloc
}

function positiveNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

export function materializeTosExam(exam) {
  if (!exam || typeof exam !== 'object') return exam

  const topics = Array.isArray(exam.topics) ? exam.topics : []
  const totalItems = Math.max(0, Math.round(Number(exam.totalTestItems) || 0))
  const totalMinutes = Math.max(0, Math.round(Number(exam.totalExamMinutes) || 0))
  const hours = topics.map(row => positiveNumber(row?.hours_class))
  const hourSum = hours.reduce((sum, value) => sum + value, 0)
  const points = hourSum > 0 && totalItems > 0 ? largestRemainder(totalItems, hours) : null
  const minutes = hourSum > 0 && totalMinutes > 0 ? largestRemainder(totalMinutes, hours) : null

  return {
    ...exam,
    topics: topics.map((row, index) => {
      const topicPoints = points
        ? points[index]
        : Math.max(0, Math.round(Number(row?.total_points) || 0))
      const percentages = BLOOM_KEYS.map(key => positiveNumber((row?.bloom_pct || {})[key]))
      const hasPercentages = percentages.some(value => value > 0)
      const bloomAlloc = hasPercentages ? largestRemainder(topicPoints, percentages) : null
      const bloomItems = bloomAlloc
        ? Object.fromEntries(BLOOM_KEYS.map((key, bloomIndex) => [key, bloomAlloc[bloomIndex]]))
        : { ...(row?.bloom_items || {}) }

      return {
        ...row,
        hours_min: minutes ? minutes[index] : (Number(row?.hours_min) || 0),
        weight: hourSum > 0 ? Number(((hours[index] / hourSum) * 100).toFixed(1)) : (row?.weight ?? ''),
        total_points: points ? topicPoints : (row?.total_points ?? ''),
        bloom_items: bloomItems,
      }
    }),
  }
}

export function materializeTosList(tos) {
  return (Array.isArray(tos) ? tos : []).map(materializeTosExam)
}

export function tosMaterializedEqual(before, after) {
  const left = Array.isArray(before) ? before : []
  const right = Array.isArray(after) ? after : []
  if (left.length !== right.length) return false

  for (let examIndex = 0; examIndex < left.length; examIndex += 1) {
    const leftTopics = left[examIndex]?.topics || []
    const rightTopics = right[examIndex]?.topics || []
    if (leftTopics.length !== rightTopics.length) return false
    for (let topicIndex = 0; topicIndex < leftTopics.length; topicIndex += 1) {
      const leftTopic = leftTopics[topicIndex] || {}
      const rightTopic = rightTopics[topicIndex] || {}
      if (Number(leftTopic.hours_min || 0) !== Number(rightTopic.hours_min || 0)) return false
      if (String(leftTopic.weight ?? '') !== String(rightTopic.weight ?? '')) return false
      if (String(leftTopic.total_points ?? '') !== String(rightTopic.total_points ?? '')) return false
      for (const key of BLOOM_KEYS) {
        const leftCount = (leftTopic.bloom_items || {})[key]
        const rightCount = (rightTopic.bloom_items || {})[key]
        if (String(leftCount ?? '') !== String(rightCount ?? '')) return false
      }
    }
  }
  return true
}
