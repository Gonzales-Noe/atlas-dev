# ATLAS Platform Guide

## Overview

**ATLAS** (Automated Teaching and Learning Analytics System) is an AI-powered, outcome-based education (OBE) platform designed for higher education institutions. It consists of two tightly integrated components:

| Component | Type | Primary Users | Tech Stack |
|-----------|------|---------------|------------|
| **Atlas Web** | Progressive Web Application | Faculty, Administrators | React 18 + Vite + MUI v9 + Tailwind CSS |
| **Atlas Mobile** | Cross-Platform Mobile App | Faculty, Students | Flutter 3.10+ (Dart), BLoC, Dio |

Together, they streamline the complete faculty teaching lifecycle -- from curriculum design and AI-assisted content generation to paper-based assessment grading via camera scanning -- and give students real-time access to their performance data.

---

## Part I: Atlas Web

Atlas Web is the primary faculty workstation. It is a rich, single-page application offering a unified workspace for all course-related activities.

### 1.1 Architecture

```
                   ATLAS WEB (React SPA)
  +----------+  +----------+  +-------------------+
  |  Sign In |  |Dashboard |  | Faculty Workspace |
  |  Sign Up |  |  Board   |  | (3-Panel Layout)  |
  | Reset PW |  |          |  |                   |
  +----------+  +----------+  +-------------------+
                        | REST API (JWT Bearer)
                  DJANGO BACKEND
  +---------+ +----------+ +--------+ +----------+
  |  Users  | |Curriculum| |Grading | |Analytics |
  |  (Auth) | | (Syllabi | |(OMR +  | |(Google   |
  |         | |  Modules | |Bubble) | | Sheets + |
  |         | |  Assess) | |        | | Bloom)   |
  +---------+ +----------+ +--------+ +----------+
  +------------------------------------------------+
  |     Integrations (LLM + RAG Pipeline)           |
  |  OpenRouter | Groq | Anthropic | Ollama        |
  |  pgvector HNSW + BM25 + Cross-Encoder          |
  +------------------------------------------------+
  +------------------------------------------------+
  |  PostgreSQL 16 (pgvector) | Redis 7 | Celery   |
  +------------------------------------------------+
```

### 1.2 User Roles

| Role | Capabilities |
|------|-------------|
| **Super Admin** | Full system access, manage institutions, upload global knowledge documents, manage all users |
| **Admin** | Institution-level management, user account administration |
| **Faculty** | Course workspace access, syllabus/module/assessment generation, grading, analytics |
| **Student** | View enrolled courses, view scores and results |

### 1.3 Faculty Workspace (3-Panel Layout)

The faculty workspace uses a three-panel layout organized into five tabs:

- **Left Panel - Navigation:** Vertical tab bar: Syllabus, Modules, Assessments, Grading, Analytics
- **Center Panel - Content:** Main work area for the active tab
- **Right Panel - Sources and Tools:** RAG document upload, AI provider selection, contextual tools

---

## Part II: Faculty Workflows in Atlas Web

### 2.1 Syllabus Generation

Produces a complete, OBE-aligned course syllabus using RAG + CoT + LLM pipeline:

1. Faculty selects a course from their dashboard
2. System searches global knowledge base (institutional docs, CHED policies, accreditation standards) and course-specific documents (previous syllabi, references)
3. Chain-of-Thought prompt assembles all context
4. LLM generates 11 structured sections: University Vision/Mission, PEOs, Course Description, ILOs, TLAs, Assessment Tasks, TOS, Policies, Grading System, References
5. Faculty reviews, edits, and saves as structured JSON for downstream use

### 2.2 Module Building

Creates detailed teaching modules aligned with syllabus and ILOs:

1. Faculty provides topic/title and selects syllabus section
2. CoT prompt builder assembles course description, ILOs, week topics, RAG context, Bloom's taxonomy data
3. Structured output: introduction, learning objectives, subtopics with expandable content, activities, references
4. **AI Assist Chatbox** enables conversational refinement: "Make this more engaging," "Add a group activity," "Align to Bloom's Analyze level"
5. Modules stored as editable structured JSON

### 2.3 Assessment Generation

Creates Bloom's-aligned assessments with automated item generation:

1. Faculty configures: assessment type (Quiz, Long Quiz, Midterm Exam, Final Exam, etc.), number of items, Bloom's level distribution
2. TOS-driven allocation: items distributed per topic proportionally, Bloom's levels set by year-level targets (1st Year: Remember+Understand, 4th Year: Evaluate+Create)
3. LLM generates multiple-choice items with distractors, correct answers with rationale, rubrics, ILO mappings
4. Faculty can add, edit, reorder, or delete items; export as DOCX for printing

### 2.4 Grading (Two Systems)

**Legacy OMR Grading:** Upload scanned bundles (ZIP/PDF/JPG/PNG), server-side OMR processing, auto-mapping student identifiers, review dashboard with flagging.

**Bubble Sheet System (Modern):** Complete mobile-first workflow --
- Template creation with configurable items, choices, ID columns, essay section
- Answer key auto-extracted from linked assessment items
- Printable A4/long-bond PDF with QR code, 8-column ID bubble grid, answer grid, 4 corner fiducial markers
- Exact layout metadata stored in millimeters
- Server-side OpenCV processing with fill-intensity measurement (0.42 threshold)
- Auto-grading, flagging, manual correction via point-and-click editor

### 2.5 Analytics

Transforms assessment data into actionable insights:

1. Google Sheets ingestion via service account or API key
2. Sheet analysis: normalization, column means, ILO mapping
3. **Prescriptive Recommendations:** "Students are struggling with ILO-3 (Apply level). Consider more hands-on activities."
4. **Bloom's Taxonomy Item Analysis:** Cross-references BubbleSheetScan responses with assessment item Bloom levels, producing per-student Bloom correctness ratios, class-wide weakness identification (low/moderate/strong flags), section-by-section comparison

---

## Part III: Atlas Mobile

Atlas Mobile is a fully implemented cross-platform mobile application built with **Flutter (Dart)**. It enables faculty and students to perform critical workflows from their phones -- most notably, **camera-based bubble sheet scanning with on-device Optical Mark Recognition (OMR).**

### 3.1 Technology Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Flutter 3.10+ (Dart), targeting Android, iOS, Linux, macOS, Windows, Web |
| **State Management** | BLoC (flutter_bloc + equatable) |
| **Networking** | Dio HTTP client with JWT interceptor, auto-refresh on 401, retry on connection errors |
| **Auth** | Email/Password (JWT via SimpleJWT) + Google Sign-In (Supabase Auth to backend token exchange) |
| **Camera** | `camera` plugin for live preview and high-resolution capture |
| **QR/Barcode** | Google ML Kit Barcode Scanning for real-time QR decode |
| **Image Processing** | Dart `image` package for on-device manipulation |
| **Local Storage** | SharedPreferences (tokens, profile), FlutterSecureStorage (remembered credentials) |
| **Python OMR (Optional)** | FastAPI microservice (OpenCV, NumPy) for server-side batch OMR processing |
| **Design System** | Material 3 with ATLAS Red (0xFF8B1515) as seed color |

### 3.2 Authentication System

Atlas Mobile uses the same JWT-based authentication as Atlas Web, with an enhanced mobile-native flow:

| Auth Method | Description |
|-------------|-------------|
| **Email/Password** | Login via POST /auth/token/. Returns JWT access + refresh tokens plus full user profile. Tokens and profile data (user_id, name, email, role, student_details) persisted in SharedPreferences. |
| **Google Sign-In** | Native Google Sign-In via Supabase Auth. id_token sent to backend POST /auth/google/. If user doesn't exist, navigates to SignupScreen with pre-filled fields. |
| **Password Reset** | 3-step PageView wizard: (1) Request OTP via email, (2) Verify OTP code and receive reset_token, (3) Set new password. |
| **Session Persistence** | "Keep me signed in" stores credentials in FlutterSecureStorage. Auto-fills on next launch. |
| **Auto-Logout** | 15-minute inactivity timer on both dashboards. On 401 with failed refresh, interceptor forces navigation to login with timeout notification. |

### 3.3 Networking Layer

The ApiClient wraps Dio with a robust interceptor chain:

1. **JWT Attachment** -- Reads access_token from SharedPreferences, attaches as Authorization: Bearer header
2. **Token Refresh** -- On 401 (non-login endpoints), auto-attempts POST /auth/token/refresh/ with stored refresh token
3. **Retry on Failure** -- On connection errors or 502, retries once after 500ms delay
4. **Forced Logout** -- If refresh fails, clears auth state and navigates to login via GlobalKey navigator

### 3.4 Faculty Dashboard

Bottom navigation with four tabs plus a central Scanner FAB:

**Home Tab:**
- Active Session Card with gradient background, status badge (ACTIVE SESSION / NO ANSWER KEY), assessment type badge (PRELIM / MIDTERM / SEMI-FINALS / FINALS), answer key count, "Scan Exam Sheets" button
- Section Selection Sheet for choosing template when multiple exist
- Pending Templates list
- System Events feed with relative timestamps
- Course Switcher that auto-loads associated templates

**Courses Tab:**
- Full list of faculty assigned courses
- Course Detail Screen with two sub-tabs:
  - **Evaluation Materials:** Questions panel, Answer Key interactive grid (tap to cycle A/B/C/D), Passing Score slider with quick-set presets
  - **Students and Scores:** DataTable with SR Code, Section, Score, filterable by assessment/section

**Reports Tab:**
- Class Performance Card (Average, Passing Score, Pass Rate)
- Item Analysis with Difficulty (P=R/T) and Discrimination (D=Pu-Pl), color-coded status (Retain/Revise/Discard), upper/lower 27% subgroup method
- Bloom's Taxonomy Mastery Chart with six-level progress bars and per-student drill-down

**Settings Tab:** Profile, Account and Security, Help and Support, Logout

### 3.5 Student Dashboard

Students access Atlas Mobile to track performance and manage enrollment:

- **Home Tab:** Ongoing Assessment Card, Recently Graded cards, Notification Bell with Live Alerts sheet
- **Courses Tab:** Enrolled courses with colored borders, swipe-to-unenroll, Join Course FAB
- **Analytics Tab:** Student-specific academic profile and performance
- **Settings Tab:** Profile, account security, help and support, logout

### 3.6 The Scanner: Camera-Based OMR

The flagship feature -- real-time camera scanning with on-device grading.

**Scanner State Machine** (3 modes):
1. **Scanning** -- Live camera preview with fiducial corner overlay, auto-detects QR + corners
2. **Review** -- List of scanned papers with scores, swipe-to-delete, upload status
3. **Detail** -- Score card, per-item response grid (green=correct, red=wrong, orange=ambiguous), edit actions

**Real-Time Frame Processing (frame skip = 3):**

| Step | Frequency | Description |
|------|-----------|-------------|
| QR Detection | Every 3rd frame | Google ML Kit decodes QR for student ID and assessment |
| Fiducial Detection | Every processed frame | Detects 4 corner squares on the bubble sheet |
| Corner Locking | Continuous | Hysteresis: +2 per detection, -1 per miss; locks after ~10 consecutive frames |
| Diagnostics | Every 30 frames | Checks glare/blur; shows orange warning bar |

**ROI Guide Overlay:** 320px top margin, 160px bottom margin, 13:8.5 paper aspect ratio, 4 corner squares (90px) transition red-to-green as fiducials lock.

**Smart Flash:** ON between 6PM-4:59AM, OFF between 5AM-5:59PM, re-evaluated every minute.

**Capture and Scoring Flow:**
1. All 4 corners locked + QR decoded = shutter pulses green
2. Tap shutter captures at high resolution with haptic feedback
3. Background OMR processes via OmrService
4. **Score Flash** overlay shows student ID and score immediately
5. Duplicate detection before save (same student + template prompts overwrite)
6. Auto-upload to server
7. Edit Answers Sheet lets faculty correct misreads (tap to cycle A/B/C/D/?), saved via PATCH

**Python OMR Engine (optional server-side):**
Located in python_omr/ directory:
- Pipeline: Page Detection (Canny edge + contour + quadrilateral), Perspective Transform, Preprocessing (CLAHE, gamma 0.7), Bubble Detection (fill ratio with hysteresis margin 0.06), ID Reading, Grading with Flagging
- Key Constants: GOOD_FILL=0.42, MIN_GAP=0.10, HYSTERESIS_MARGIN=0.06
- FastAPI server on port 8001: POST /scan and POST /scan-batch endpoints
- Batch CLI for processing folders of images

### 3.7 Help and Support

Comprehensive in-app help: 6 FAQs, bug report form, direct email to atlasdegdev@gmail.com, full Terms of Service (8 sections) and Privacy Policy (8 sections) displayed inline, governed under Philippine law. Version 1.0.0+1.

---

## Part IV: Data Integration Between Atlas Web and Atlas Mobile

### 4.1 Integration Model

Atlas Web and Atlas Mobile share the same Django REST API backend and PostgreSQL database. All data flows through the REST API:

- **Single Source of Truth** -- All assessment data, templates, scans, and scores in one database
- **Consistent Authentication** -- Same JWT Bearer tokens from SimpleJWT; one account for both platforms
- **Unified Gradebook** -- Mobile camera scan scores merge seamlessly with web-entered scores via merged views at /grading/student-scores/

### 4.2 End-to-End Assessment Cycle

```
PHASE 1: SETUP (Atlas Web)            PHASE 2: PRINT (Atlas Web)
+--------------------------+          +--------------------------+
| Faculty creates syllabus |          | Faculty clicks           |
| Generates modules        |          | "Generate Bubble Sheet"  |
| Configures assessment    |----------|- PDF with QR, fiducials, |
| Sets answer key          |          |   bubbles, layout_meta   |
| Creates bubble template  |          | Saved to PostgreSQL      |
+--------------------------+          +------------+-------------+
                                                    |
PHASE 3: EXAM (Physical)                          Print and
+--------------------------+                       distribute
| Students fill bubbles    |<----------------------+
| with pencil/pen          |
+------------+-------------+
             |
PHASE 4: SCAN (Mobile)                  PHASE 5: REVIEW (Web or Mobile)
+--------------------------+            +--------------------------+
| Faculty opens app        |  POST      | Scores appear in:        |
| Points camera at sheet   |  /bubble/  | - Faculty Dashboard      |
| QR auto-decoded          |  scans/    | - Course Detail Scores   |
| Fiducials lock green     |----------->|- Reports Item Analysis  |
| Tap shutter: Score 42/50 |            | - Bloom Mastery Chart    |
| Auto-uploads to server   |            | - Student Live Alerts    |
+--------------------------+            +--------------------------+
```

### 4.3 Key API Endpoints Used by Both Platforms

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /auth/token/ | POST | JWT login (both) |
| /auth/token/refresh/ | POST | Token refresh (both) |
| /auth/google/ | POST | Google Sign-In exchange (mobile) |
| /auth/register/ | POST | User registration (both) |
| /auth/password-reset/request/ | POST | Request OTP (both) |
| /auth/password-reset/verify/ | POST | Verify OTP (both) |
| /auth/password-reset/confirm/ | POST | Set new password (both) |
| /auth/me/ | GET, PATCH | Profile fetch/update (mobile) |
| /auth/dashboard/summary/ | GET | Faculty course list (mobile) |
| /auth/enroll/ | POST | Student course enrollment (mobile) |
| /curriculum/faculty-courses/ | GET | Faculty assigned courses (mobile) |
| /curriculum/faculty-course-workspace/{id}/ | GET | Full course workspace (mobile) |
| /curriculum/course/{id}/students/ | GET | Enrolled students list (mobile) |
| /grading/bubble/templates/ | GET, POST | List/create bubble templates (both) |
| /grading/bubble/templates/{id}/ | GET, PATCH | Template detail/update (both) |
| /grading/bubble/templates/{id}/answer-key/ | POST | Set answer key (mobile) |
| /grading/bubble/templates/{id}/sync-key/ | POST | Sync key from assessment (both) |
| /grading/bubble/templates/{id}/generate-pdf/ | POST | Generate printable PDF (web) |
| /grading
| /grading/bubble/templates/{id}/scans/ | GET | List scans for template (both) |
| /grading/bubble/scans/ | POST | Submit camera scan - multipart (mobile) |
| /grading/bubble/scans/{id}/ | GET, PATCH, DELETE | Manage individual scan (both) |
| /grading/student-scores/ | GET | Merged scores - bubble + legacy (both) |
| /analytics/bloom-item-analysis/ | GET | Bloom item-level analysis (both) |

### 4.4 Data Consistency Guarantees

| Guarantee | Mechanism |
|-----------|-----------|
| **No Duplicate Scans** | Mobile checks local scan history before upload; server uses unique constraint on (template_id, student_identifier) |
| **Answer Key Consistency** | Templates link to Assessment items; sync-key endpoint re-extracts correct answers from rubric JSON |
| **Atomic Score Updates** | Server re-grades on every PATCH to scan responses; scores always derived from current answers vs answer_key |
| **Offline Resilience** | Mobile caches templates (layout_metadata + answer_key) locally; scans queue for upload when connectivity returns |
| **Audit Trail** | OmrReviewAction model tracks all manual corrections; AuditLog tracks all user actions system-wide |

---

## Part V: How ATLAS Helps Faculty Workflows in Teaching and Evaluation

### 5.1 The Augmented Teaching Cycle

ATLAS transforms five phases of the teaching cycle:

| Phase | Platform | ATLAS Augmentation |
|-------|----------|-------------------|
| **1. DESIGN** | Atlas Web | AI generates OBE-aligned syllabi using institutional RAG knowledge; TOS auto-created with Bloom distribution by year level |
| **2. DELIVER** | Atlas Web | AI generates structured modules with objectives and activities; AI Assist chatbox enables conversational content refinement |
| **3. ASSESS** | Web + Mobile | AI generates assessment items with valid distractors; mobile camera scans and grades bubble sheets in ~3 seconds each |
| **4. ANALYZE** | Web + Mobile | Item analysis with Difficulty and Discrimination indices; Bloom taxonomy mastery breakdowns per student and per class |
| **5. IMPROVE** | Atlas Web | Prescriptive AI recommendations for targeted interventions; evidence-based curriculum refinement guidance |

### 5.2 Time Savings Per Phase

**Phase 1 - Syllabus Design:**
- Before: Hours of manually researching and writing a 15+ page document
- After: AI generates a complete draft in seconds; faculty reviews and edits in minutes

**Phase 2 - Module Creation:**
- Before: Writing lesson plans from scratch each term
- After: AI generates structured modules; conversational AI Assist refines content in real-time

**Phase 3 - Assessment and Grading:**
- Before: 2-3 hours manually checking 100 bubble sheets with answer key overlay
- After: Phone camera scans and grades each sheet in ~3 seconds; all scores auto-upload

**Phase 4 - Data Analysis:**
- Before: Manually computing class averages, encoding scores in spreadsheets
- After: Instant item analysis, Bloom mastery charts, flagging of weak topics

**Phase 5 - Continuous Improvement:**
- Before: Gut-feel adjustments based on general impressions
- After: AI prescriptive recommendations grounded in actual student performance data

### 5.3 Quality Improvements

| Dimension | Improvement |
|-----------|------------|
| **OBE Alignment** | Every ILO is systematically mapped to TLAs and assessment tasks; no orphan outcomes |
| **Bloom Coverage** | Year-level-appropriate distribution enforced; 1st year focuses on Remember/Understand, 4th year on Evaluate/Create |
| **Assessment Validity** | TOS-driven item allocation ensures proportional topic coverage; items tagged with Bloom level for analysis |
| **Grading Accuracy** | Consistent fill-ratio thresholds (0.42) eliminate human bias in interpreting bubble marks |
| **Feedback Timeliness** | Students see scores in near real-time via Live Alerts; faculty identify struggling students immediately |
| **Accreditation Readiness** | All course artifacts (syllabi, modules, TOS, assessment results, Bloom analysis) are digitally stored and retrievable |

### 5.4 Platform Synergy

Atlas Web and Atlas Mobile are not separate products -- they are a single platform with two surfaces:

- **Web handles the heavy lifting:** AI content generation, RAG knowledge management, document upload, detailed analytics, PDF generation
- **Mobile handles the field work:** Camera scanning, on-device grading, instant results, offline resilience
- **The backend unifies both:** All data flows through PostgreSQL; a grade scanned on mobile is immediately visible on web and vice versa
- **Students are first-class citizens:** They do not just receive grades -- they get live alerts, Bloom mastery insights, and a dashboard of their own academic journey

---

## Appendix: Technology Summary

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Backend API | Django 5.1 + DRF | REST API, auth, business logic |
| Async Tasks | Celery 5.4 + Redis 7 | Background OMR processing, AI generation |
| Database | PostgreSQL 16 + pgvector | Relational data + vector embeddings for RAG |
| LLM Providers | OpenRouter, Groq, Anthropic, Ollama | Multi-provider AI with auto-fallback |
| RAG Pipeline | Parent-child chunking, BGE embeddings, HNSW + BM25 hybrid search, cross-encoder reranking | Knowledge-grounded AI generation |
| Web Frontend | React 18 + Vite + MUI v9 + Tailwind CSS 3 | Faculty workspace SPA |
| Mobile App | Flutter 3.10+ (Dart), BLoC, Dio, Google ML Kit | Cross-platform mobile with camera OMR |
| OMR Engine | OpenCV, NumPy (Python) / Dart image | Bubble sheet recognition and grading |
| Document Processing | PyMuPDF, python-docx, ReportLab | PDF generation, document parsing |
| Containerization | Docker Compose (dev + prod) | Multi-service orchestration |
| Reverse Proxy | Nginx (prod only) | SSL termination, static file serving, Gunicorn proxy |
