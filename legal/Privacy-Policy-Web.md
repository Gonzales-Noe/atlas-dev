# ATLAS Web Platform — Privacy Policy and Data Protection Notice
**Effective Date:** October 2026 | **Version:** 1.0 (Web Platform Edition)
**Legal basis:** Republic Act No. 10173 (Data Privacy Act of 2012) and NPC Implementing Rules.
**Operator:** ATLAS Development Team

> This Notice explains what personal data the ATLAS Web Platform collects, why, how it is protected, how long it is kept, and your rights. By using the Platform you consent to processing as described here.

## 1. Scope and Roles
1.1. This Notice covers the web Platform (React SPA + Django REST API, Supabase Postgres, Redis/Celery, third-party LLM/Google/PayMongo/email providers).
1.2. Institutions are tenants. ATLAS acts as Personal Information Controller for account and platform operations jointly with the Institution for its instructional data; third-party providers act as Processors under their own terms.
1.3. Web users are faculty and administrators. Student web login is currently disabled; any student data processed on web comes from faculty-provided Sheets, OMR scans, or rosters — not from student logins.

## 2. Information We Collect
2.1. Account and identity: full name, institutional email, bcrypt password hash (plaintext never stored), role (faculty/admin/superadmin), profile picture URL if provided, institution association, active status, trial generation counter.
2.2. Institutional and course data: institution name, plan and billing metadata (Section 4), colleges/programs/sections, courses (code, title, units, category, description), course loads (faculty-section assignments), ILOs with Bloom levels, syllabi/modules/assessments/items/TOS weights, course and global knowledge documents and their text chunks plus embeddings.
2.3. Assessment and analytics data: Sheet mappings (Sheet ID, range, weighting schema), retrieved Sheet values, computed means and ILO mappings, OMR templates/scans/jobs/results/review actions, score results keyed by SR code or student identifier, analytics snapshots and prescriptive text.
2.4. Technical and usage data: JWT claims and auth events, password-reset OTP events, audit logs (actor, action, resource, details, timestamp), API access logs, error diagnostics, browser type, IP-derived network metadata, localStorage session and UI preferences.

## 3. How We Use Information
We use data solely to: (a) authenticate users and enforce tenant and course-level access; (b) generate, store, and deliver AI-assisted syllabi, modules, assessments, and recommendations in response to faculty inputs; (c) retrieve faculty-specified Sheet ranges and compute weighted scores and ILO analytics; (d) process OMR templates and scans for grading review; (e) maintain audit logs for security, accountability, and governance; (f) manage trials, subscriptions, and billing state; (g) communicate account, security, and system notices; (h) monitor performance and diagnose issues; (i) comply with Philippine law and CHED requirements. No use beyond these purposes without prior consent except as required by law or valid authority order.

## 4. Legal Bases (RA 10173)
(a) Consent: voluntary registration, uploads, and Sheet connections; withdrawable subject to service consequences and retention duties. (b) Contract: processing needed to provide the requested service. (c) Legitimate interests: security, integrity, and improvement (audit logs, diagnostics), balanced against privacy. (d) Legal obligation: retention and disclosure as required by law or competent authority.

## 5. External Processors and Data Transmitted
5.1. LLM providers (fallback chain: Groq, NVIDIA NIM, Mistral, Google AI Studio/Gemma, Cloudflare Workers AI, OpenRouter, Hugging Face, optional Ollama): prompt payloads contain faculty course parameters, retrieved RAG excerpts (PII-masked best-effort), and class aggregates. Do not include passwords, tokens, or payment secrets in prompts. Providers process per their own policies; availability and model identity may vary per request.
5.2. Google Sheets API (API key or read-only service account): only the faculty-specified document and range is read. Nothing is written to the Sheet. Google processes the API call per Google's policies.
5.3. PayMongo: checkout and webhook processing for paid plans. ATLAS stores only operational IDs and statuses; payment credentials go directly to PayMongo.
5.4. Email (SMTP): OTP and notifications to your institutional email. Google Sign-In (where enabled): ID-token verification against configured OAuth client IDs.
5.5. No sale of personal data. No advertising trackers. No other external transfers beyond this Section.

## 6. Storage and Security
6.1. Storage: Supabase-hosted Postgres (application data, pgvector embeddings) plus server media volume for uploads; Redis for cache and Celery task queue. Access is mediated by the Django API tier; there is no direct public database access.
6.2. Credentials: passwords hashed with bcrypt; plaintext never stored. JWT access plus refresh tokens issued per session; refresh rotation and 401-refresh handling on the web client.
6.3. PII reduction: automated masking of emails, PH mobile patterns, signature blocks, and labeled names before embedding or LLM prompting (best-effort — review uploads and prompts).
6.4. Access control: role-based enforcement at the API level. Faculty see only assigned courses and own artifacts. Admins see only their Institution. Super Admins see platform operations and all tenant metadata for governance. All material events are audit-logged.
6.5. Transport: HTTPS/TLS in production (nginx termination on VPS, Supabase TLS for DB). Do not use the Platform over untrusted networks without TLS.
6.6. Limitations: no system is fully secure. Protect your credentials, revoke exposed Sheet shares and tokens, and report incidents promptly.

## 7. Cookies and Local Storage (Web)
The web client stores in browser localStorage: atlas_access_token, atlas_refresh_token, atlas_user profile cache, selected-plan cache, course list cache, sidebar and theme preferences, and generation-notification preference. These are functional (session, continuity, UI), not advertising trackers. Clearing storage logs you out. WithCredentials cookies may carry CSRF/session markers. No third-party behavioral cookies are set by ATLAS.

## 8. Retention
Account data: kept for active account life; identifying fields removed within 30 days of verified deletion, subject to audit and institutional duties. Course and instructional artifacts: kept for active subscription plus 12 months for export, then purged on tenant deletion. Analytics snapshots and score results: kept while the course or tenant is active; purged with course or tenant deletion. Audit logs: retained minimum 3 years for accountability unless earlier purge is legally required and approved. Technical logs: 90 days unless needed for active investigation. Deleting the last Admin deletes the whole tenant irreversibly.

## 9. Your Rights (RA 10173)
You may: (a) be informed (this Notice); (b) access and get a copy of your data via Account settings or support request; (c) rectify inaccuracies (edit profile directly or request correction); (d) erase (request deletion via your Admin or support; subject to retention duties); (e) port (request machine-readable export where feasible); (f) object to beyond-purpose or legitimate-interest processing; (g) complain to the National Privacy Commission (privacy.gov.ph) if unresolved. We respond to verified requests within fifteen (15) working days per NPC expectations.

## 10. Children's Privacy
The web Platform is for adult faculty and administrators. It is not directed at minors and does not knowingly collect children's data via logins. If faculty-provided Sheets or rosters contain minor student identifiers, the Institution as co-controller must ensure lawful basis and minimization; ATLAS processes such identifiers only as needed for grading and analytics.

## 11. Changes to This Notice
We may update this Notice for features, law, or practice changes. Material changes will be notified to Admins by email and by in-Platform notice with a revised effective date. Continued use after effectivity is acceptance. If you disagree, discontinue use and request deletion.

## 12. Data Protection Contact
ATLAS Development Team, Lipa City, Batangas, Philippines. Email: [atlasdegdev@gmail.com]. Unresolved complaints may go to the NPC at privacy.gov.ph (5th Floor, Delegation Building, PICC Complex, Pasay City).
