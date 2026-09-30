// src/features/roles/Admin/academicApi.js
// Thin wrapper around the /api/academics endpoints so the setup wizard and the
// Academic Structure page share one place for the payload shapes.

import api from '../../../config/api'

const BASE = '/academics'

export async function fetchSetupStatus() {
  const { data } = await api.get(`${BASE}/setup/status/`)
  return data
}

export async function fetchAcademicStructure() {
  const { data } = await api.get(`${BASE}/structure/`)
  return {
    colleges: data.colleges || [],
    programs: data.programs || [],
    yearLevels: data.year_levels || [],
    sections: data.sections || [],
    courses: data.courses || [],
  }
}

export async function createCollege(payload) {
  const { data } = await api.post(`${BASE}/colleges/`, payload)
  return data
}

export async function updateCollege(collegeId, payload) {
  const { data } = await api.put(`${BASE}/colleges/${collegeId}/`, payload)
  return data
}

export async function deleteCollege(collegeId) {
  await api.delete(`${BASE}/colleges/${collegeId}/`)
}

export async function createProgram(payload) {
  const { data } = await api.post(`${BASE}/programs/`, payload)
  return data
}

export async function updateProgram(programId, payload) {
  const { data } = await api.put(`${BASE}/programs/${programId}/`, payload)
  return data
}

export async function deleteProgram(programId) {
  await api.delete(`${BASE}/programs/${programId}/`)
}

export async function createYearLevel(payload) {
  const { data } = await api.post(`${BASE}/years/`, payload)
  return data
}

export async function deleteYearLevel(yearId) {
  await api.delete(`${BASE}/years/${yearId}/`)
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

// Recommended General Education subjects, offered as quick-add suggestions when
// the admin is building the course list for a program.
export const RECOMMENDED_GE_COURSES = [
  { course_code: 'GE1', course_title: 'Purposive Communication', units: 3, category: 'ged' },
  { course_code: 'GE2', course_title: 'Reading and Writing', units: 3, category: 'ged' },
  { course_code: 'GE3', course_title: 'Mathematics in the Contemporary World', units: 3, category: 'ged' },
  { course_code: 'GE4', course_title: 'Science, Technology, Engineering and Society', units: 3, category: 'ged' },
  { course_code: 'GE5', course_title: 'Ethics', units: 3, category: 'ged' },
  { course_code: 'GE6', course_title: 'Understanding the Self and Society', units: 3, category: 'ged' },
  { course_code: 'GE7', course_title: 'Introduction to Statistics', units: 3, category: 'ged' },
  { course_code: 'GE8', course_title: 'Literature and History of Ideas', units: 3, category: 'ged' },
  { course_code: 'GE9', course_title: 'Physical Education 1', units: 2, category: 'pe' },
  { course_code: 'GE10', course_title: 'Foreign Language 1', units: 3, category: 'ged' },
]

export const WIZARD_STEPS = [
  { key: 'colleges', label: 'Colleges' },
  { key: 'programs', label: 'Programs' },
  { key: 'structure', label: 'Years & Sections' },
  { key: 'courses', label: 'Courses' },
  { key: 'knowledge', label: 'Knowledge Base' },
]
