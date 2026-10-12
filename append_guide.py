path = r'C:\ATLAS-dev\atlas-dev\ATLAS_PLATFORM_GUIDE.md'

remainder = '''
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
'''

with open(path, 'a', encoding='utf-8') as f:
    f.write(remainder)
