// src/pages/legal/legalContent.js
// Web-scoped legal text. Mirrors legal/Terms-of-Service-Web.md and
// legal/Privacy-Policy-Web.md. Edit copy here and in /legal together.

export const TERMS_META = {
  title: 'Terms of Service and User Responsibilities',
  subtitle: 'ATLAS Web Platform  ·  Effective Date: October 2026  ·  Version 1.0',
}

export const PRIVACY_META = {
  title: 'Privacy Policy and Data Protection Notice',
  subtitle: 'ATLAS Web Platform  ·  Effective Date: October 2026  ·  Version 1.0  ·  RA No. 10173',
}
export const TERMS_SECTIONS = [
  { heading: '1. Acceptance of Terms', body: ['These Terms bind you and the ATLAS development team. They apply to Faculty, Admins, and Super Admins via browser or API.', 'If you act for an Institution, you warrant authority to bind it. Updates are posted on the Platform; continued use is acceptance.'] },
  { heading: '2. Definitions', body: ['Platform: React SPA + Django API (Syllabus, Modules, Assessments, Grading, Analytics, Knowledge Base, admin). Faculty: staff scoped to assigned courses. Admin: per-institution administrator. Super Admin: ATLAS operator. AI-Generated Content: LLM pipeline outputs (RAG + Chain-of-Thought, multi-provider chain).'] },
  { heading: '3. Eligibility and Account Security', body: ['Web users are faculty and administrators only. Student web login is currently disabled.', 'Faculty accounts are scoped to their Institution and assigned courses. You are responsible for credentials and all activity under your account. Auth: email/password (JWT), Google Sign-In where configured, email-OTP reset. Report compromise immediately.'] },
  { heading: '4. Trial, Subscription, Billing', body: ['New Institutions may receive a 7-day trial: AI generation only in Syllabus, 5 generations per faculty account. Expiry returns 402.', 'Paid plans via PayMongo Checkout. ATLAS stores only operational billing metadata; payment credentials go to PayMongo. Expired subscriptions may be suspended.'] },
  { heading: '5. Permitted Use', body: ['Lawful instructional management only: OBE syllabus/module drafting; ILO-mapped assessments; OMR review; Sheets analytics; knowledge-base curation; tenant admin. AI output is a draft until faculty-approved.'] },
  { heading: '6. AI Content and Faculty Responsibility', body: ['RAG + Chain-of-Thought over a fallback LLM chain (Groq, NVIDIA, Mistral, Gemma, Cloudflare, OpenRouter, Hugging Face, optional Ollama); provider may vary.', 'No warranty of accuracy. Mandatory faculty review before any institutional or student reliance. Bloom/TOS and recommendations are advisory.'] },
  { heading: '7. Google Sheets Integration', body: ['Supply Sheet ID + range. Backend reads via API key or read-only service account. Read-only; nothing is written. Warrant authorization; accuracy depends on your Sheet.'] },
  { heading: '8. Uploads and Knowledge Base', body: ['PDF, DOCX, XLSX, templates, images for RAG grounding. Warrant rights. Automated PII masking is best-effort; do not upload unneeded sensitive data.'] },
  { heading: '9. Prohibited Conduct', body: ['No unlawful use; no cross-tenant access; no reverse engineering; no circumvention of auth, RBAC, trial gates, or audit logs; no manipulation of outputs; no malicious uploads; no bots or overload; no impersonation; no sharing access; no academic dishonesty; no billing interference.'] },
  { heading: '10. Academic Integrity', body: ['Misuse to cheat, fabricate grades, or misrepresent AI content will be reported and may suspend access. Comply with CHED CMO No. 46, s. 2012.'] },
  { heading: '11. Intellectual Property', body: ['Platform belongs to ATLAS. You retain your content, granting ATLAS a limited hosting/processing license. Approved AI artifacts vest per Institution policy.'] },
  { heading: '12. Availability, Suspension, Deletion', body: ['As is / as available. May modify or rate-limit. Suspension for compromise, abuse, non-payment, violation. Last-Admin deletion deletes the whole tenant irreversibly — export first.'] },
  { heading: '13. Liability', body: ['No implied warranties; no indirect damages; cap is prior 3-month fees or PHP 5,000 on trial/free tier. Faculty must verify before reliance.'] },
  { heading: '14. Governing Law', body: ['Republic of the Philippines. Good-faith negotiation/mediation (RA 9285) before suit in Batangas courts.'] },
  { heading: '15. Contact', body: ['ATLAS Development Team ( atlasdegdev@gmail.com ), Lipa City, Batangas, Philippines.'] },
]

export const PRIVACY_SECTIONS = [

  { heading: '1. Scope and Roles', body: ['Covers the web Platform (React SPA + Django API, Supabase Postgres, Redis/Celery, LLM/Google/PayMongo/email providers). Institutions are tenants; ATLAS is Controller jointly with the Institution; providers are Processors.', 'Web users are faculty and administrators. Student login is disabled; student data comes from faculty Sheets, scans, or rosters.'] },
  { heading: '2. Information We Collect', body: ['Account: name, institutional email, bcrypt hash (never plaintext), role, picture URL, institution, status, trial counter.', 'Courses: institution, plan/billing metadata, colleges/programs/sections, courses, loads, ILOs, syllabi/modules/assessments/TOS, knowledge documents and embeddings.', 'Analytics: Sheet mappings and values, OMR templates/scans/jobs/results, score results by SR code, snapshots and prescriptive text.', 'Technical: JWT/auth events, OTP events, audit logs, API/error logs, browser/IP metadata, localStorage session and UI prefs.'] },
  { heading: '3. How We Use Information', body: ['Only to: authenticate and enforce access; generate and deliver AI content; retrieve Sheets and compute analytics; process OMR grading; maintain audit logs; manage trials/billing; send account notices; monitor and diagnose; comply with law. Nothing beyond without consent except as legally required.'] },
  { heading: '4. Legal Bases (RA 10173)', body: ['Consent (registration, uploads, Sheets — withdrawable); Contract (service delivery); Legitimate interests (security, integrity — balanced); Legal obligation (retention/disclosure as required).'] },
  { heading: '5. External Processors', body: ['LLM chain (Groq, NVIDIA, Mistral, Gemma, Cloudflare, OpenRouter, Hugging Face, optional Ollama): prompts carry course params, masked RAG excerpts, class aggregates. Never put passwords or tokens in prompts.', 'Google Sheets (API key or read-only service account): only the specified range is read; nothing written. PayMongo: checkout/webhooks; ATLAS keeps only operational IDs. Email: OTP/notices. No sale of data; no ad trackers.'] },
  { heading: '6. Storage and Security', body: ['Supabase Postgres + media volume; Redis cache/queue; API-mediated access only.', 'bcrypt passwords; JWT session with refresh handling. Best-effort PII masking before embedding/prompts. RBAC: faculty see assigned courses; admins see own Institution; super admins see platform ops. All material events audit-logged. HTTPS/TLS in production.'] },
  { heading: '7. Cookies and Local Storage', body: ['Browser localStorage: access/refresh tokens, user cache, plan/course caches, sidebar/theme prefs, notification pref. Functional only — no ad trackers. Clearing storage logs you out.'] },
  { heading: '8. Retention', body: ['Accounts: active life; identifiers removed within 30 days of verified deletion. Course artifacts: subscription + 12 months, then purged on tenant deletion. Audit logs: minimum 3 years. Technical logs: 90 days. Last-Admin deletion deletes the whole tenant irreversibly.'] },
  { heading: '9. Your Rights (RA 10173)', body: ['Be informed; access/copy; rectify; erase (via Admin/support); port where feasible; object to beyond-purpose processing; complain to the NPC (privacy.gov.ph). Verified requests answered within 15 working days.'] },
  { heading: '10. Childrens Privacy', body: ['For adult faculty/admins. Student identifiers from Sheets/rosters are processed only as needed for grading/analytics; Institutions must ensure lawful basis.'] },
  { heading: '11. Changes', body: ['Updates notified to Admins by email and in-Platform notice with revised date. Continued use is acceptance.'] },
  { heading: '12. Contact', body: ['Contact ATLAS Development Team ( atlasdegdev@gmail.com ), Unresolved complaints: NPC at privacy.gov.ph.'] },
]
