// src/features/roles/Admin/academicApi.js
// Thin wrapper around the /api/academics endpoints so the setup wizard and the
// Academic Structure page share one place for the payload shapes.

import api from '../../../config/api'

const BASE = '/academics'

export async function fetchSetupStatus(includeCounts = true) {
  const { data } = await api.get(`${BASE}/setup/status/`, {
    params: { include_counts: includeCounts },
  })
  return data
}

export async function fetchInstitutionCustomization() {
  const { data } = await api.get('/users/institution-customization/')
  return data
}

export async function fetchFacultyAssignments() {
  const { data } = await api.get('/users/faculty-assignments/')
  return data
}

export async function saveInstitutionCustomization(payload) {
  const { data } = await api.patch('/users/institution-customization/', payload)
  return data
}

export async function analyzeSyllabusTemplate(file) {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post('/users/institution-syllabus-template/analyze/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
  return data
}

// Section keys the faculty workspace renders with a dedicated editor.
export const BUILTIN_SYLLABUS_EDITORS = {
  basic: 'Basic Info',
  details: 'Course Details',
  iloat: 'ILOs & Assessments',
  schedule: 'Weekly Schedule',
  tos: 'Table of Specifications',
  grading: 'Grading',
  policies: 'Policies',
}

export function describeDetectedStructure(result) {
  const sections = Array.isArray(result?.sections) ? result.sections : []
  const subsectionCount = sections.reduce(
    (total, section) => total + (Array.isArray(section.subsections) ? section.subsections.length : 0),
    0,
  )
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
  const method = result?.source === 'ai' ? 'AI-assisted' : 'heading-based'
  return `Detected ${plural(sections.length, 'section')} and ${plural(subsectionCount, 'subsection')} (${method}). Review them before saving.`
}

export async function createFacultyWithAssignments(payload) {
  const { data } = await api.post('/users/faculty/', payload)
  return data
}

export async function uploadInstitutionKnowledgeDocument(file) {
  const extension = file.name.split('.').pop()?.toLowerCase()
  const formData = new FormData()
  formData.append('file', file)
  formData.append('file_type', extension)
  formData.append('doc_type', 'Institution_Knowledge_Base')
  const { data } = await api.post('/integrations/upload-global-rag-document/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
  return data
}

export async function fetchAcademicStructure() {
  const { data } = await api.get(`${BASE}/structure/`)
  return {
    sections: data.sections || [],
    courses: data.courses || [],
  }
}

export async function createSection(payload) {
  const { data } = await api.post(`${BASE}/sections/`, payload)
  return data
}

export async function updateSection(sectionId, payload) {
  const { data } = await api.patch(`${BASE}/sections/${sectionId}/`, payload)
  return data
}

export async function deleteSection(sectionId) {
  await api.delete(`${BASE}/sections/${sectionId}/`)
}

export async function fetchCourseRequests(status = '') {
  const params = status ? { status } : {}
  const { data } = await api.get(`${BASE}/course-requests/`, { params })
  return data?.requests || []
}

export async function reviewCourseRequest(requestId, payload) {
  const { data } = await api.post(`${BASE}/course-requests/${requestId}/review/`, payload)
  return data
}

export async function createCourse(payload) {
  const { data } = await api.post(`${BASE}/courses/`, payload)
  return data
}

export async function updateCourse(courseId, payload) {
  const { data } = await api.put(`${BASE}/courses/${courseId}/`, payload)
  return data
}

export async function deleteCourse(courseId) {
  await api.delete(`${BASE}/courses/${courseId}/`)
}

export async function completeSetup(skipKnowledgeBase = true) {
  const { data } = await api.post(`${BASE}/setup/complete/`, {
    skip_knowledge_base: skipKnowledgeBase,
  })
  return data
}

export async function resetSetup() {
  const { data } = await api.post(`${BASE}/setup/reset/`)
  return data
}

// ── Domain constants shared by the wizard and the structure page ──────────────
export const SECTION_YEARS = [
  { value: 1, label: '1st Year' },
  { value: 2, label: '2nd Year' },
  { value: 3, label: '3rd Year' },
  { value: 4, label: '4th Year' },
  { value: 5, label: '5th Year' },
  { value: 6, label: '6th Year' },
]

export const COURSE_CATEGORIES = [
  { value: 'ged', label: 'General Education' },
  { value: 'common', label: 'Common Courses' },
  { value: 'professional', label: 'Professional Courses' },
  { value: 'mandated', label: 'Mandated Courses' },
]

export const WIZARD_STEPS = [
  { key: 'template', label: 'Syllabus Template' },
  { key: 'faculty', label: 'Faculty & Teaching Loads' },
  { key: 'knowledge', label: 'Knowledge Base' },
]
