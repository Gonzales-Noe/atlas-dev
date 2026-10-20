import { useCallback, useEffect, useState } from 'react'

const KEY_PREFIX = 'atlas_workspace_progress:'

function loadProgress(courseId) {
  if (!courseId) return {}
  try {
    return JSON.parse(window.localStorage.getItem(KEY_PREFIX + courseId) || '{}')
  } catch {
    return {}
  }
}

/**
 * Tracks per-module completion for the ATLAS faculty pipeline.
 * Auto-detects from loaded workspace data AND supports manual
 * faculty approval ("applied generation" check) per step.
 * Persisted per course in localStorage.
 */
export default function useWorkspaceProgress(courseId, workspaceData) {
  const [manual, setManual] = useState(() => loadProgress(courseId))

  useEffect(() => {
    setManual(loadProgress(courseId))
  }, [courseId])

  const persist = useCallback((next) => {
    setManual(next)
    try {
      if (courseId) window.localStorage.setItem(KEY_PREFIX + courseId, JSON.stringify(next))
    } catch {
      // progress still applies for the current session
    }
  }, [courseId])

  const markStepDone = useCallback((stepKey, done = true) => {
    persist({ ...loadProgress(courseId), ...manual, [stepKey]: done })
  }, [courseId, manual, persist])

  const resetProgress = useCallback(() => {
    persist({})
  }, [persist])

  // ── Auto-detection from server workspace data ──
  const syllabi = workspaceData?.syllabi ?? workspaceData?.syllabus_list ?? []
  const hasSyllabusContent = Boolean(
    workspaceData?.syllabus_content || workspaceData?.syllabus?.content ||
    (Array.isArray(syllabi) && syllabi.length > 0) || workspaceData?.has_syllabus,
  )
  const modules = workspaceData?.modules ?? []
  const assessments = workspaceData?.assessments ?? []
  const hasGrading = Boolean(
    (workspaceData?.grading_summary && Object.keys(workspaceData.grading_summary).length > 0) ||
    (workspaceData?.exam_sessions && workspaceData.exam_sessions.length > 0) ||
    workspaceData?.has_grading || (workspaceData?.scores_count ?? 0) > 0,
  )
  const hasAnalytics = Boolean(
    workspaceData?.has_analytics || workspaceData?.analytics_ready ||
    (workspaceData?.report_count ?? 0) > 0,
  )

  const auto = {
    syllabus: hasSyllabusContent,
    module: Array.isArray(modules) && modules.length > 0,
    assessment: Array.isArray(assessments) && assessments.length > 0,
    grading: hasGrading,
    analytics: hasAnalytics,
  }

  const isStepDone = useCallback((stepKey) => {
    if (manual[stepKey] === false) return false // faculty explicitly un-checked
    if (manual[stepKey] === true) return true
    return Boolean(auto[stepKey])
  }, [manual, auto.syllabus, auto.module, auto.assessment, auto.grading, auto.analytics])

  const doneCount = ['syllabus', 'module', 'assessment', 'grading', 'analytics']
    .filter((k) => (manual[k] === false ? false : manual[k] === true ? true : auto[k])).length

  return { isStepDone, markStepDone, resetProgress, doneCount, totalSteps: 5, auto }
}
