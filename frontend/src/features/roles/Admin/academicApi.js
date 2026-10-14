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

export async function deleteSection(sectionId) {
  await api.delete(`${BASE}/sections/${sectionId}/`)
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
export const COURSE_CATEGORIES = [
  { value: 'ged', label: 'General Education (GE)' },
  { value: 'professional', label: 'Professional' },
  { value: 'elective', label: 'Elective' },
  { value: 'laboratory', label: 'Laboratory' },
  { value: 'pe', label: 'Physical Education' },
  { value: 'other', label: 'Other' },
]

export const WIZARD_STEPS = [
  { key: 'template', label: 'Syllabus Template' },
  { key: 'faculty', label: 'Faculty & Teaching Loads' },
  { key: 'knowledge', label: 'Knowledge Base' },
]
