// src/features/roles/Faculty/courseRequestApi.js
// Faculty-side helpers for the admin-approved course-request flow.

import api from '../../../config/api'

export async function fetchMyCourseRequests() {
  const { data } = await api.get('/curriculum/course-requests/mine/')
  return data?.requests || []
}

export async function submitCourseRequest(payload) {
  const { data } = await api.post('/curriculum/courses/', payload)
  return data
}

export const COURSE_CATEGORIES = [
  { value: 'ged', label: 'General Education' },
  { value: 'common', label: 'Common Courses' },
  { value: 'professional', label: 'Professional Courses' },
  { value: 'mandated', label: 'Mandated Courses' },
]
