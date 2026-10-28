// src/config/routes.js
// Single source of truth for all route paths.
// Import from here instead of hardcoding strings.

export const ROUTES = {
  // Public
  HOME:           '/',
  SIGN_UP:        '/signup',
  SIGN_IN:        '/signin',
  RESET_PASSWORD: '/reset-password',
  PRICING:        '/pricing',
  CONTACT:        '/contact',
  BILLING:        '/billing/onboarding',
  LEGAL_TERMS:   '/legal/terms',
  LEGAL_PRIVACY: '/legal/privacy',

  // Faculty
  FACULTY: {
    DASHBOARD:   '/faculty/dashboard',
    WORKSPACE:   '/faculty/workspace/:courseId',
    SYLLABUS:    '/faculty/syllabus',
    MODULE:      '/faculty/module',
    ASSESSMENT:  '/faculty/assessment',
    GRADING:     '/faculty/grading',
    ANALYTICS:   '/faculty/analytics',
  },

  // Admin (Tenant Admin — per HEI)
  ADMIN: {
    DASHBOARD:          '/admin/dashboard',
    SYLLABUS_FORMAT:    '/admin/syllabus-format',
    ACCOUNT_MANAGEMENT: '/admin/account-management',
    ACADEMIC_STRUCTURE: '/admin/academic-structure',
    KNOWLEDGE_BASE:     '/admin/knowledge-base',
    AUDIT_LOGS:         '/admin/audit-logs',
  },

  // Super Admin (ATLAS team)
  SUPERADMIN: {
    DASHBOARD:          '/superadmin/dashboard',
    ACCOUNT_MANAGEMENT: '/superadmin/account-management',
    AUDIT_LOGS:         '/superadmin/audit-logs',
    SYSTEM_MANAGEMENT:  '/superadmin/system-management',
  },
}
