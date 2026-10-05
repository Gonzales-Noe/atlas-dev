# Young LIFTers Program (Season 4) — Capsule R&D Proposal

**Proposed Research Title:**  
ATLAS: An Intelligent Instructional Assistant for Course Design and Assessment Development

**Thematic Area:** Educational Technology  
*(also aligned with Decision Support System applications; Data Analytics with Machine/Deep Learning)*

**Applicant Capstone / Research Focus:**  
Development, implementation, integration, and evaluation of ATLAS as a hybrid (web and mobile) instructional assistant that supports faculty in course design, assessment development, and instructional delivery—while prioritizing the efficient use of free, open-source AI models under faculty review and approval.

---

## 1. State the problem being addressed  
*(Max 300 words)*

Higher education faculty are expected to design outcome-based courses, write clear Intended Learning Outcomes (ILOs), align assessments with competencies and Bloom’s taxonomy, prepare Tables of Specification, and process examinations accurately—often under heavy teaching loads and limited preparation time. Many tools either remain manual and time-consuming, or rely on paid commercial AI that is costly for campuses, difficult to sustain, and weakly grounded in the institution’s own syllabi, policies, and course materials. As a result, instructional quality and consistency vary, and assessment preparation becomes a bottleneck rather than a supported professional practice.

A practical research gap remains: how can universities use **free, open-source language models** effectively for instructional work without wasting limited computing capacity or producing shallow, ungrounded outputs? Open-source models can run at little or no subscription cost, but they work best only when the right amount of course context is provided and when generation length is controlled. Too little context yields generic or misaligned content; too much context slows processing and dilutes relevance. Likewise, too few generated tokens produce incomplete syllabi or assessments, while excessive tokens increase cost in time and compute without proportional quality gains.

This study therefore addresses the problem of inefficient and uneven course design and assessment development by investigating ATLAS as a hybrid instructional assistant that combines faculty-approved materials with carefully bounded open-source generation—specifically identifying workable **minimum and maximum context** for reliable drafting, and **minimum and maximum generation tokens** for usable instructional outputs—while keeping educators in full control of final decisions.

*(Word count: ~278)*

---

## 2. State the solution and how it can be implemented. Not technical.  
*(Max 300 words)*

The proposed solution is **ATLAS**, an intelligent instructional assistant that supports faculty across three connected stages of teaching work: **course design**, **assessment development**, and **instructional delivery**. ATLAS is hybrid in two practical senses: it works on both **web and mobile**, and it pairs **faculty-owned course materials** with **free open-source AI models** so outputs stay relevant to the actual course rather than generic internet knowledge. All AI suggestions remain optional drafts; faculty review, edit, and approve before use.

**Course design support** will help faculty draft syllabi, refine ILOs, map competencies, check Bloom’s taxonomy alignment, and verify consistency across course elements. **Assessment support** will help generate instructional resources from approved materials, Tables of Specification, test items, answer keys, and rubrics, with checks that items align to outcomes and cognitive levels. **Delivery support** will sync course and assessment data across platforms, support mobile optical mark recognition for faster exam checking, and centralize grade recording.

Implementation under YLP mentorship will proceed in phases suitable for an R&D cycle: (1) refine ATLAS workflows with partner faculty; (2) configure and evaluate free open-source models for drafting tasks; (3) establish efficient generation settings—using a **minimum of about 1–3 relevant reference passages** and a **maximum of about 5 passages** (roughly up to **2,000 context tokens**) so the model sees enough course evidence without overload; and for content generation, targeting about **1,000–2,048 tokens** for focused modules or refinements and up to about **2,500–4,000 tokens** for fuller syllabi or assessments; (4) pilot in selected courses; and (5) evaluate usefulness, accuracy, efficiency, usability, and comparison with conventional practice. Findings will guide affordable campus adoption of open-source AI for instructional support.

*(Word count: ~297)*

---

## 3. Contribution to the Sustainable Development Goals (SDGs)  
*(Max 300 words — at least three SDGs with specific targets)*

**SDG 4 — Quality Education (Target 4.c)**  
Target 4.c calls for substantially increasing the supply of qualified teachers, including through better training and support. ATLAS strengthens faculty capacity for outcome-based course design and assessment development by reducing repetitive drafting work and providing alignment checks. Better-supported instructors can prepare clearer ILOs, fairer assessments, and more consistent learning experiences—directly contributing to teaching quality in tertiary education.

**SDG 4 is reinforced by Target 4.4** (relevant skills for employment and entrepreneurship) insofar as clearer, competency-aligned courses help students develop measurable skills; however, the primary SDG 4 claim of this proposal is Target 4.c through faculty instructional support.

**SDG 9 — Industry, Innovation and Infrastructure (Target 9.5)**  
Target 9.5 seeks to enhance scientific research and upgrade technological capabilities, including by encouraging innovation and R&D. This project conducts applied R&D on educational technology: it studies how free open-source models can be used efficiently (context and token bounds), integrates web–mobile instructional workflows, and evaluates performance against conventional practice. The work builds local technological capability and evidence that Philippine higher education institutions can innovate without depending solely on expensive proprietary AI.

**SDG 8 — Decent Work and Economic Growth (Target 8.2)**  
Target 8.2 emphasizes higher levels of economic productivity through diversification, technological upgrading, and innovation. By shortening the time faculty spend on mechanical preparation of syllabi, TOS, items, and exam processing, ATLAS frees professional time for teaching, mentoring, and research. Efficient open-source AI use also models sustainable digital productivity for academic workplaces and reduces barriers to adopting instructional innovation in resource-constrained settings.

Together, these targets show that ATLAS is not only a classroom tool but an R&D contribution to quality teaching, local innovation capacity, and productive academic work.

*(Word count: ~278)*

---

## Notes for the Applicant (not part of the form fields)

| Form field | Guidance used in this draft |
|---|---|
| Problem | Frames faculty workload + OBE demands + cost/sustainability of commercial AI; centers the open-source efficiency gap (context & tokens). |
| Solution | Non-technical walkthrough of ATLAS hybrid (web/mobile + materials + open-source AI); implementation phases; explicit min/max context and tokens. |
| SDGs | SDG 4 Target **4.c**; SDG 9 Target **9.5**; SDG 8 Target **8.2**. |
| Capstone alignment | Matches general + specific objectives (course design, assessment, delivery/OMR, evaluation) and faculty-in-the-loop operational definition. |

### Suggested context / token bounds reflected in the proposal

| Setting | Minimum | Maximum | Role in ATLAS |
|---|---|---|---|
| Relevant reference passages (context) | ~1–3 | ~5 | Enough course/institutional evidence for grounded drafting |
| Context size (approx. tokens) | enough for 1 usable passage | ~2,000 | Keeps prompts efficient for free/open-source models |
| Generation tokens (focused tasks) | ~1,000 | ~2,048 | Module refinements, shorter instructional drafts |
| Generation tokens (full tasks) | ~2,048 | ~2,500–4,000 | Fuller syllabus / assessment generation |

### Reminder for YLP submission

- Application window: **August 3–31, 2026**
- Form: https://tinyurl.com/vu45m3wn  
- Email: research.ylp@g.batstate-u.edu.ph  
- Program requires mentorship of research personnel; attach endorsement / Top 5% attestation as applicable.
