# ATLAS Web Platform — Terms of Service and User Responsibilities
**Effective Date:** October 2026 | **Version:** 1.0 (Web Platform Edition)
**Operator:** ATLAS Development Team, Lipa City, Batangas, Philippines
**Governing Law:** Republic of the Philippines

> PLEASE READ CAREFULLY. By creating an account, accessing, or using the ATLAS Web Platform ("Platform"), you agree to be bound by these Terms. If you do not agree, you must not use the Platform.

## 1. Acceptance of Terms
1.1. These Terms are a binding agreement between you ("User") and the ATLAS development team ("ATLAS," "we," "us").
1.2. They apply to all web users: Faculty, Institution Admins (Tenant Admins), and Super Admins — via browser or API clients.
1.3. If you act for an Institution, you warrant authority to bind it.
1.4. We may update these Terms; the current version is posted on the Platform. Continued use after changes is acceptance.

## 2. Definitions
- **Platform:** ATLAS web app (React SPA + Django REST API): Syllabus, Modules, Assessments, Grading, Analytics, Knowledge Base, administration.
- **Faculty User:** Teaching staff scoped to assigned courses via CourseLoad.
- **Institution Admin ("Admin"):** Per-institution administrator (accounts, academic structure, knowledge base, audit logs — own Institution only).
- **Super Admin:** ATLAS team operator (platform-wide administration).
- **Institution:** A Philippine HEI registered as a tenant (data isolation boundary).
- **AI-Generated Content:** Syllabi, modules, items, rubrics, TOS distributions, prescriptive recommendations from the LLM pipeline (RAG + Chain-of-Thought, multi-provider chain).
- **TOS:** Table of Specifications. **ILO:** Intended Learning Outcome.

## 3. Eligibility, Registration, and Account Security
3.1. Web users are faculty and administrators of registered Institutions only. Student login on the web API is currently disabled (API rejects student role). Any future student access needs a separate addendum.
3.2. Institution onboarding: an Admin registers an Institution (name, admin name, institutional email, password, selected plan). This creates the tenant (trialing where applicable).
3.3. Faculty provisioning: faculty accounts are created by registration or by an Admin and scoped to that Institution; access is limited to assigned courses.
3.4. Credentials: you are responsible for your email/password and all activity under your account. Do not share credentials. Each account is personal, non-transferable.
3.5. Compromise: notify ATLAS support and your Institution Admin immediately on suspected unauthorized access.
3.6. Auth methods: (a) email/password yielding JWT access plus refresh tokens; (b) Google Sign-In ID-token exchange where configured; (c) email-OTP password reset (request, verify 4-digit code, set new password). OTPs are single-use, time-limited.
3.7. Deactivation: institutions must promptly deactivate departed staff. ATLAS or the Admin may suspend for security or compliance.


## 4. Trial, Subscription, and Billing (PayMongo)
4.1. **Trial.** New Institutions may receive a 7-day trial (trialing status). During trial: (a) AI generation is available only in the Syllabus module; (b) each faculty account is limited to 5 syllabus generations; (c) roster visibility may be capped. Expiry returns 402 Payment Required.
4.2. **Paid activation.** Continued access requires a paid plan via PayMongo Checkout. ATLAS stores only operational billing metadata (customer/session/reference/subscription IDs, plan, payment and subscription status, timestamps). Full payment credentials are processed by PayMongo, never by ATLAS.
4.3. **Webhook.** Activation is confirmed by PayMongo signed webhooks. Institutions should verify success/cancel return URLs (/billing/onboarding?status=).
4.4. **Suspension for non-payment.** Expired or unpaid subscriptions may be suspended until payment is confirmed.

## 5. Permitted Use and Platform Scope
## 7. Google Sheets Integration
7.1. Faculty may connect a Google Sheet by supplying a Sheet ID plus range. The backend reads via API key or read-only service account (sheets.readonly scope), whichever is configured.
7.2. You warrant you are authorized to share that Sheet. ATLAS performs read-only retrieval of the specified range; it does not write to, modify, or delete Sheet content.
7.3. Analytics accuracy depends on your Sheet (headers, SR codes, scores). Expected headers include identifiers (Student ID/SR Code, Name) followed by numeric score columns.
7.4. Do not connect Sheets containing data you are not authorized to process.

## 8. File Uploads and Knowledge Base
8.1. Faculty and Admins may upload course and institutional documents (PDF, DOCX, XLSX, templates, header/footer images) for RAG grounding and syllabus templating.
8.2. You warrant rights to upload and compliance with copyright and institutional policy.
8.3. The Platform applies automated PII masking (emails, PH mobile patterns, signature blocks, labeled names) before embedding, but masking is best-effort. Do not upload sensitive personal data that is not needed.
8.4. Uploads are stored under your tenant boundary and are retrievable or deletable per retention rules.

## 9. Prohibited Conduct
You agree not to: (a) use the Platform for unlawful, fraudulent, or CHED or institution-policy-violating purposes; (b) access another Institution's tenant data or courses you are not assigned; (c) reverse engineer or derive source, prompts, or pipeline internals beyond normal use; (d) circumvent auth, RBAC, trial gates (402/403/429), or audit logging; (e) manipulate the LLM, RAG, TOS, or grading pipeline to produce false records; (f) upload malicious code or adversarially crafted documents; (g) use bots or scrapers or impose unreasonable load; (h) impersonate another user or misrepresent affiliation; (i) transfer or share access with unauthorized parties; (j) facilitate academic dishonesty or fabricate assessment or grade records; (k) interfere with PayMongo checkout or webhook integrity.

Use solely for lawful institutional instructional management: (a) OBE-aligned syllabus/module drafting (CHED CMO No. 46, s. 2012 as grounding); (b) ILO-mapped, TOS-weighted assessment construction; (c) OMR bubble-sheet template management and server-side grading review; (d) Google-Sheets-backed score analytics and prescriptive recommendations; (e) knowledge-base curation for grounded generation; (f) tenant administration and audit-log review (Admin/Super Admin only). AI output is a draft for faculty review, never a final record until approved per Section 6.

## 6. AI-Generated Content and Faculty Responsibility
6.1. **How it works (web).** RAG over institutional/course documents (parent-child chunking, hybrid dense + BM25 retrieval) + Chain-of-Thought prompting against a fallback chain of third-party LLM providers (e.g., Groq, NVIDIA NIM, Mistral, Google AI Studio/Gemma, Cloudflare Workers AI, OpenRouter, Hugging Face, optional self-hosted Ollama). The active provider may vary per request.
6.2. **No guarantee of accuracy.** AI content may contain errors or misalignment. ATLAS does not warrant academic accuracy, pedagogical appropriateness, or CHED/institutional compliance of raw AI output.
## 10. Academic Integrity
ATLAS supports, never circumvents, academic integrity. Misuse to enable cheating, fabricate grades, or misrepresent AI content where originality is required will be reported to university authorities and may result in immediate suspension. Faculty must ensure use remains consistent with CHED CMO No. 46, s. 2012 and institutional policies.

## 11. Intellectual Property
11.1. Platform: all software, UI, pipeline logic, prompt orchestration, schemas, branding, and docs are the exclusive property of the ATLAS development team. No license is granted except the limited right to use the Platform per these Terms.
11.2. User Content: you retain ownership of course parameters, ILOs, uploads, Sheet mappings, and approved artifacts. You grant ATLAS a limited, non-exclusive license to host, process, and render that content solely to provide the service to your Institution.
11.3. AI outputs: rights in approved AI-assisted artifacts vest per your Institution's IP policy; ATLAS claims no ownership over your approved syllabi, modules, or assessments beyond the platform license above.

## 12. Availability, Suspension, and Deletion
12.1. The Platform is provided as is and as available. We do not guarantee uninterrupted or error-free operation; LLM providers, Google APIs, PayMongo, email delivery, and OMR processing depend on third parties.
12.2. We may modify, rate-limit, or discontinue features with or without notice.
12.3. Suspension: we or your Admin may suspend accounts for suspected compromise, abuse, non-payment, or policy violation, including preservation of audit logs for investigation.
12.4. Deletion: (a) single-account deletion removes that profile and cascades user-scoped rows; (b) deleting the last Admin of an Institution deletes the entire Institution tenant and all its data so a reused email starts clean; (c) audit-log entries for removed users are purged where they have no independent retention duty. Deletion is irreversible — export needed records first.

## 13. Disclaimer and Limitation of Liability
To the maximum extent permitted by Philippine law: (a) ATLAS disclaims implied warranties of merchantability, fitness, and non-infringement; (b) ATLAS is not liable for indirect, incidental, special, consequential, or exemplary damages including loss of data, academic standing, or revenue; (c) aggregate liability shall not exceed fees paid by your Institution for the 3 months preceding the claim, or PHP 5,000 if on trial or free tier. Faculty remain responsible for verifying content before institutional or student reliance.

## 14. Governing Law and Dispute Resolution
Governed by the laws of the Republic of the Philippines, without regard to conflict rules. Parties shall first attempt good-faith negotiation or mediation (RA No. 9285 where applicable) before filing suit in courts of competent jurisdiction in Batangas Province, Philippines.

## 15. Contact
ATLAS Development Team, Lipa City, Batangas, Philippines. Email: [atlasdegdev@gmail.com ].

