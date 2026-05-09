// src/hooks/index.js
// Re-export all hooks from one entry point.

export { useAuth } from '../store/authStore'
export { default as useRoleRedirect } from './useRoleRedirect'
export { default as useApi }          from './useApi'