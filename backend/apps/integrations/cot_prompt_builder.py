"""
Chain-of-Thought (CoT) prompt builder for ATLAS curriculum and assessment generation.

Each builder method returns a (system_prompt, user_prompt) tuple ready to pass
to LLMService.generate_response().  RAG context chunks retrieved via rag_service
are embedded in the user prompt so the LLM grounds its output in the knowledge base.

Generation pipeline:
    1. Caller runs semantic_search_with_summary(query) → rag_result
    2. Caller calls the appropriate CoTPromptBuilder.build_*() method,
       passing rag_result["chunks"] and rag_result["context_summary"].
    3. build_*() injects the summary (token-efficient) when available;
       falls back to formatted raw chunks within a 2 000-token budget.
    4. system_prompt + user_prompt are forwarded to LLMService.generate_response()
"""

# Maximum tokens of RAG context to inject into a prompt.
# Keeps total prompt within typical 8 K-context LLM windows.
_CONTEXT_TOKEN_BUDGET: int = 2_000


def _count_tokens(text: str) -> int:
    """Fast token estimate: 1 token ≈ 4 characters (no external dependency)."""
    return max(1, len(text) // 4)


class CoTPromptBuilder:
    """Builds structured, step-by-step prompts for syllabus, module, and assessment generation."""

    # ------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _format_context(chunks: list, context_summary: str = "") -> str:
        """
        Build the RAG context block for a prompt.

        Priority order (mirrors PEA _assemble_prompt):
          1. context_summary — pre-computed progressive summary (most token-efficient).
             Injected as-is when provided and non-empty.
          2. chunks list — formatted with source citations, trimmed to
             _CONTEXT_TOKEN_BUDGET tokens so the prompt stays within LLM limits.
          3. Fallback placeholder — when neither is available.
        """
        # ── 1. Use pre-computed summary (token-efficient) ─────────────────
        if context_summary and context_summary.strip():
            return f"[CURRICULUM CONTEXT SUMMARY]\n{context_summary.strip()}"

        # ── 2. Format raw chunks with token budget ────────────────────────
        if not chunks:
            return (
                "(No reference material was retrieved from the knowledge base. "
                "Generate the content using your expert knowledge of Outcome-Based Education.)"
            )

        parts = []
        tokens_used = 0
        for i, chunk in enumerate(chunks, 1):
            source = f"[Source: {chunk['document_title']}"
            if chunk.get("page_number"):
                source += f", p. {chunk['page_number']}"
            source += f" | Relevance: {chunk.get('score', 0):.2f}]"
            header = f"--- Reference {i} {source} ---\n"
            body = chunk['text']
            entry_tokens = _count_tokens(header + body)
            remaining = _CONTEXT_TOKEN_BUDGET - tokens_used
            if entry_tokens > remaining:
                if not parts:
                    # Always include at least one chunk, truncated to budget
                    body = body[: remaining * 4] + "…"
                    parts.append(header + body)
                # Budget exhausted
                break
            parts.append(header + body)
            tokens_used += entry_tokens

        return "\n\n".join(parts)

    # ------------------------------------------------------------------
    # Syllabus generation
    # ------------------------------------------------------------------

    @staticmethod
    def build_syllabus_prompt(
        course_name: str,
        course_code: str,
        num_weeks: int,
        context_chunks: list,
        extra_instructions: str = "",
        context_summary: str = "",
    ) -> tuple:
        """
        Build a CoT prompt for generating a complete university course syllabus.

        Args:
            context_summary: Pre-computed progressive summary from
                semantic_search_with_summary().  When provided, it is used
                instead of raw chunks for token-efficient context injection.

        Returns:
            (system_prompt: str, user_prompt: str)
        """
        context = CoTPromptBuilder._format_context(context_chunks, context_summary)
        extra = f"\nAdditional faculty instructions: {extra_instructions}" if extra_instructions else ""

        system = (
            "You are an expert curriculum designer at a Philippine university that follows "
            "Outcome-Based Education (OBE). You produce thorough, well-structured syllabi "
            "that align Course Learning Outcomes (CLOs) with Bloom's Taxonomy levels and "
            "clearly map assessments to those outcomes. Always be specific and practical."
        )

        user = f"""REFERENCE MATERIAL FROM KNOWLEDGE BASE:
{context}

TASK: Generate a comprehensive, OBE-aligned university course syllabus.

Course Name : {course_name}
Course Code : {course_code or "N/A"}
Duration    : {num_weeks} weeks{extra}

THINK STEP BY STEP:

Step 1 — Course Scope
  Using the reference material above, identify the core purpose, coverage, and level
  of the course. Note any prerequisite knowledge implied by the content.

Step 2 — Course Rationale
  Write a dedicated rationale paragraph (2–3 sentences) explaining WHY this course
  exists in the curriculum — its role in the program, the professional competencies
  it develops, and its contribution to graduate attributes or societal needs.
  This is separate from the course description.

Step 3 — Course Learning Outcomes (CLOs / ILOs)
  Formulate 4–6 measurable CLOs using Bloom's Taxonomy action verbs.
  For each CLO specify:
    CLO number | Statement | Bloom's Taxonomy Level (Remember/Understand/Apply/
                              Analyze/Evaluate/Create) | Primary Bloom Verb
  Ensure CLOs span at least three Bloom's levels. Higher-order levels (Apply and
  above) should account for at least 50% of the CLOs.

Step 4 — Weekly Schedule with ILO References
  Plan a {num_weeks}-week schedule where topics build progressively on each other.
  For EACH week specify: Week | Topic / Subject Matter | Key Learning Activities |
  Delivery Method | ILO References (list CLO numbers covered that week, e.g. "1,3").
  Every CLO must be covered at least once.

Step 5 — Assessment Design with Sub-tasks and I/R/D
  Design assessments (quizzes, midterm exam, final exam, projects, activities) that
  directly map to the CLOs. For each assessment component specify:
    • Code (e.g. ME, QZ, FP)
    • Task name
    • I/R/D designation (I = Introduced, R = Reinforced, D = Demonstrated)
    • Category (Formative / Summative / Performance / Project)
    • Sub-tasks if applicable (e.g. Written Exam, Lab Report, Presentation)
    • CLOs covered

Step 6 — Table of Specifications (TOS)
  For each major assessment component, provide a TOS showing how points are
  distributed across Bloom's levels:
    Topic | Total Points | Remember% | Understand% | Apply% | Analyze% | Evaluate% | Create%
  Percentages per row must sum to 100%.

Step 7 — Grading Breakdown
  Assign weights to each assessment component such that they total exactly 100%.

Step 8 — Framework Alignment
  Note the alignment of CLOs to:
    • Student Outcomes (SO) — ABET/CHED attributes
    • Institutional Graduate Attributes (IGA)
    • CDIO Skills
    • Sustainable Development Goals (SDG)

Step 9 — References
  List required and recommended textbooks, articles, or online resources.

OUTPUT — Return the syllabus using exactly this structure:

1. COURSE DESCRIPTION (3–4 sentences)

2. COURSE RATIONALE (2–3 sentences — why this course matters in the program)

3. COURSE LEARNING OUTCOMES (CLOs)
   CLO | Statement | Bloom's Level | Primary Bloom Verb

4. WEEKLY SCHEDULE
   Week | Topic / Subject Matter | Key Learning Activities | Delivery | ILO Refs

5. ASSESSMENT BREAKDOWN
   Code | Task | I/R/D | Category | Sub-tasks | Weight (%) | CLOs Covered

6. TABLE OF SPECIFICATIONS (TOS)
   Topic | Total Pts | Remember% | Understand% | Apply% | Analyze% | Evaluate% | Create%

7. FRAMEWORK ALIGNMENT
   CLO | SO | IGA | CDIO | SDG

8. REQUIRED MATERIALS & REFERENCES
"""
        return system, user

    # ------------------------------------------------------------------
    # Module generation
    # ------------------------------------------------------------------

    @staticmethod
    def build_module_prompt(
        course_name: str,
        module_title: str,
        week_number: int,
        context_chunks: list,
        extra_instructions: str = "",
        context_summary: str = "",
    ) -> tuple:
        """
        Build a CoT prompt for generating a detailed teaching module.

        Args:
            context_summary: Pre-computed progressive summary (token-efficient).

        Returns:
            (system_prompt: str, user_prompt: str)
        """
        context = CoTPromptBuilder._format_context(context_chunks, context_summary)
        extra = f"\nAdditional faculty instructions: {extra_instructions}" if extra_instructions else ""

        system = (
            "You are an expert instructional designer specialising in Outcome-Based Education "
            "for higher education. You create detailed, engaging teaching modules that guide "
            "faculty through structured, learner-centred lesson delivery."
        )

        user = f"""REFERENCE MATERIAL FROM KNOWLEDGE BASE:
{context}

TASK: Generate a complete, ready-to-deliver teaching module.

Course       : {course_name}
Module Title : {module_title}
Week Number  : {week_number}{extra}

THINK STEP BY STEP:

Step 1 — Module Context
  Identify where Week {week_number} sits in the course sequence and what prerequisite
  knowledge students should already have.  Use the reference material to anchor the topics.

Step 2 — Module Learning Outcomes (MLOs)
  Define 2–4 MLOs aligned to course-level CLOs.  Each MLO must be measurable.

Step 3 — Instructional Sequence
  Design a 3-hour session plan (or equivalent) split into:
    a. Introduction / Hook        — engage prior knowledge, state outcomes
    b. Core Content Delivery      — key concepts, examples, demonstrations
    c. Guided Practice / Activity — students apply the concept
    d. Closure / Synthesis        — summarise, preview next week

Step 4 — Formative Assessment
  Describe one formative assessment (quiz, exit ticket, in-class problem) that checks
  mastery of the MLOs by end of the week.

Step 5 — Instructional Materials
  List readings, slides, tools, datasets, or resources the faculty needs to prepare.

OUTPUT — Return the module plan using exactly this structure:

1. MODULE OVERVIEW
   Purpose | Place in course | Estimated contact hours

2. MODULE LEARNING OUTCOMES (MLOs)

3. INSTRUCTIONAL SEQUENCE
   Phase | Time | Activity / Content | Delivery Method | Materials

4. FORMATIVE ASSESSMENT
   Type | Description | MLO Alignment | Estimated time

5. INSTRUCTIONAL MATERIALS & RESOURCES
"""
        return system, user

    # ------------------------------------------------------------------
    # JSON Module generation
    # ------------------------------------------------------------------

    @staticmethod
    def build_module_json_prompt(
        course_name: str,
        module_title: str,
        week_number: int,
        module_number: int,
        context_chunks: list,
        extra_instructions: str = "",
        context_summary: str = "",
        ilos: list = None,
        course_description: str = "",
        week_topic: str = "",
    ) -> tuple:
        """
        Build a CoT prompt that instructs the LLM to return a **strict JSON** module.

        Args:
            ilos:               List of ILO/CLO strings from the course syllabus.
            course_description: The course description text.
            week_topic:         The topic for this specific week from the syllabus schedule.

        JSON schema returned by the LLM:
        {
          "module_number": <int>,
          "module_title": "<string>",
          "introduction": "<2-3 sentence paragraph>",
          "learning_objectives": ["<measurable objective>", ...],
          "subtopics": [
            {
              "id": "st_0",
              "title": "<subtopic title>",
              "content": "<detailed explanation, 3-5 paragraphs>"
            },
            ...
          ],
          "short_activity": {
            "title": "<activity title>",
            "description": "<step-by-step activity instructions>",
            "duration": "<e.g. 15 minutes>"
          }
        }

        Returns:
            (system_prompt: str, user_prompt: str)
        """
        context = CoTPromptBuilder._format_context(context_chunks, context_summary)
        extra = f"\nAdditional faculty instructions: {extra_instructions}" if extra_instructions else ""

        # Build the COURSE DATA block from real syllabus data
        course_data_parts = []
        if course_description:
            course_data_parts.append(f"COURSE DESCRIPTION:\n{course_description.strip()}")
        if ilos:
            ilo_lines = "\n".join(f"  ILO-{i + 1}: {ilo}" for i, ilo in enumerate(ilos) if ilo)
            course_data_parts.append(f"COURSE INTENDED LEARNING OUTCOMES (ILOs):\n{ilo_lines}")
        if week_topic:
            course_data_parts.append(
                f"WEEK {week_number} SYLLABUS TOPIC: {week_topic.strip()}"
            )

        course_context_block = (
            "\n\nCOURSE DATA (authoritative — ground all content here):\n"
            + "\n\n".join(course_data_parts)
        ) if course_data_parts else ""

        # Build the ILO alignment step text
        if ilos:
            ilo_step = (
                "\nStep 2 — Review the Course ILOs in COURSE DATA. "
                "Map each learning objective you write to one or more of those ILOs."
            )
        else:
            ilo_step = (
                "\nStep 2 — Define measurable learning objectives "
                "using Bloom's Taxonomy action verbs."
            )

        system = (
            "You are an expert instructional designer specialising in Outcome-Based Education "
            "for Philippine higher education. You produce structured, detailed teaching modules. "
            "You MUST respond with ONLY valid JSON — no markdown fences, no extra text, no "
            "commentary outside the JSON structure."
        )

        user = f"""REFERENCE MATERIAL FROM KNOWLEDGE BASE:
{context}{course_context_block}

TASK: Generate a complete, ready-to-deliver teaching module as strict JSON.

Course       : {course_name}
Module Number: {module_number}
Module Title : {module_title}
Week Number  : {week_number}{extra}

THINK STEP BY STEP before writing JSON:

Step 1 — Analyse the reference material and COURSE DATA above to identify the core \
concepts specific to "{module_title}" in {course_name}.{ilo_step}
Step 3 — Write a 2-3 sentence introduction that places this module in the context of \
{course_name}. Be specific — do NOT use generic filler.
Step 4 — Break "{module_title}" into 3-5 logical subtopics. For each, write detailed \
content (3-5 paragraphs) grounded in the reference material and course context.
Step 5 — Design a short formative activity (15-20 min) aligned to this module's \
objectives and the Course ILOs.

OUTPUT RULES:
- Respond with ONLY valid JSON — no markdown, no preamble, no text outside the braces.
- Every string value must be specific to {course_name} and "{module_title}".
- Replace every "..." in the template below with real content.
- The "subtopics" array MUST have at least 3 items.

{{
  "module_number": {module_number},
  "module_title": "{module_title}",
  "introduction": "...",
  "learning_objectives": [
    "...",
    "...",
    "..."
  ],
  "subtopics": [
    {{
      "id": "st_0",
      "title": "...",
      "content": "..."
    }},
    {{
      "id": "st_1",
      "title": "...",
      "content": "..."
    }},
    {{
      "id": "st_2",
      "title": "...",
      "content": "..."
    }}
  ],
  "short_activity": {{
    "title": "...",
    "description": "...",
    "duration": "15 minutes"
  }}
}}
"""
        return system, user

    @staticmethod
    def build_subtopic_content_prompt(
        course_name: str,
        module_title: str,
        subtopic_title: str,
        existing_content: str,
        context_chunks: list,
        extra_instructions: str = "",
        context_summary: str = "",
    ) -> tuple:
        """
        Build a prompt to generate or expand content for a single subtopic.
        Returns plain text content (not JSON).
        """
        context = CoTPromptBuilder._format_context(context_chunks, context_summary)
        extra = f"\n\nAdditional instructions: {extra_instructions}" if extra_instructions else ""

        system = (
            "You are an expert instructional designer. Generate rich, detailed educational "
            "content for a specific subtopic. Write clear paragraphs suitable for a university "
            "course module. Use the reference material to ground explanations in verified content."
        )

        user = f"""REFERENCE MATERIAL FROM KNOWLEDGE BASE:
{context}

TASK: Generate or expand content for the following subtopic.

Course        : {course_name}
Module Title  : {module_title}
Subtopic Title: {subtopic_title}{extra}

{"EXISTING CONTENT TO EXPAND:\\n" + existing_content if existing_content else ""}

Write 3-5 well-structured paragraphs covering:
1. Core concept definition and explanation
2. Key principles or mechanisms
3. Practical examples or applications
4. Connection to broader course themes

Output ONLY the content paragraphs — no headers, no JSON, no preamble.
"""
        return system, user

    @staticmethod
    def build_module_ai_assist_prompt(
        field: str,
        current_content: str,
        instruction: str,
        course_name: str,
        module_title: str,
    ) -> tuple:
        """
        Build a prompt for the AI chatbox to modify a specific module section.
        Returns the revised content as plain text.
        """
        system = (
            "You are an expert instructional designer assistant. Help faculty improve "
            "their course module content. Follow the faculty's instruction precisely. "
            "Output ONLY the revised content — no preamble, no explanations."
        )

        user = f"""You are helping revise a section of a course module.

Course       : {course_name}
Module Title : {module_title}
Section      : {field}

CURRENT CONTENT:
{current_content}

FACULTY INSTRUCTION:
{instruction}

Provide the revised content for this section only. Output ONLY the new content.
"""
        return system, user

    # ------------------------------------------------------------------
    # Assessment generation
    # ------------------------------------------------------------------

    @staticmethod
    def build_assessment_prompt(
        course_name: str,
        assessment_type: str,
        num_items: int,
        clos: list,
        context_chunks: list,
        extra_instructions: str = "",
        context_summary: str = "",
    ) -> tuple:
        """
        Build a CoT prompt for generating a full assessment with items and rubric.

        Args:
            context_summary: Pre-computed progressive summary (token-efficient).

        Returns:
            (system_prompt: str, user_prompt: str)
        """
        context = CoTPromptBuilder._format_context(context_chunks, context_summary)

        if clos:
            clo_block = "\n".join(f"  - {c}" for c in clos)
        else:
            clo_block = "  - (Derive appropriate CLOs from the course name and reference material)"

        extra = f"\nAdditional faculty instructions: {extra_instructions}" if extra_instructions else ""

        system = (
            "You are an expert university assessment designer with deep knowledge of Outcome-Based "
            "Education, Bloom's Taxonomy, and the Table of Specifications (TOS). You create "
            "rigorous, fair assessments with clear rubrics fully aligned to course learning outcomes."
        )

        user = f"""REFERENCE MATERIAL FROM KNOWLEDGE BASE:
{context}

TASK: Generate a complete {assessment_type} for {course_name}.

Assessment Type         : {assessment_type}
Number of Items         : {num_items}
Course Learning Outcomes being assessed:
{clo_block}{extra}

THINK STEP BY STEP:

Step 1 — Cognitive Level Distribution
  Using Bloom's Taxonomy, plan the distribution of items across cognitive levels
  (Remember, Understand, Apply, Analyse, Evaluate, Create) appropriate for a
  {assessment_type}.  Higher-order levels should dominate for exams; lower-order
  levels may dominate for quizzes.

Step 2 — Table of Specifications (TOS)
  Build a TOS mapping each CLO to cognitive levels and the number of items per cell.
  Ensure the item counts sum to exactly {num_items}.

Step 3 — Item Writing
  Write all {num_items} items.  For each item include:
    • Item number
    • Item type (Multiple Choice / Short Answer / Problem / Essay)
    • The question / prompt
    • Bloom's level and CLO tag
    • Point value (all items must total 100 points)

Step 4 — Answer Key / Scoring Rubric
  For every item provide:
    • Multiple choice → correct option letter + brief explanation
    • Short answer / Problem → model answer + point breakdown
    • Essay → scoring rubric (criteria, levels, points per level)

OUTPUT — Return the assessment using exactly this structure:

1. ASSESSMENT HEADER
   Title | Type | Total Points | Recommended Time

2. TABLE OF SPECIFICATIONS (TOS)
   CLO | Cognitive Level | No. of Items | Points

3. ASSESSMENT ITEMS
   (Numbered list, each with item type, CLO tag, Bloom's level, points, then the question)

4. ANSWER KEY / SCORING RUBRIC
   (Corresponding numbered list)
"""
        return system, user

    # ------------------------------------------------------------------
    # Syllabus field generation
    # ------------------------------------------------------------------

    # Per-section content hints for targeted generation
    _SECTION_HINTS = {
        'contact': (
            "Generate specific, OBE-aligned assessment criteria for {course_name}. "
            "Include grading breakdown, performance expectations, and how each "
            "assessment component maps to course learning outcomes."
        ),
        'tlas': (
            "Generate comprehensive Teaching, Learning, and Assessment (TLA) strategies "
            "for {course_name}. Include active learning methods, collaborative activities, "
            "formative assessment techniques, and instructional approaches aligned with OBE."
        ),
        'ilo': (
            "Generate a specific, measurable Intended Learning Outcome (ILO) for "
            "{course_name} using Bloom's Taxonomy action verbs. "
            "The ILO must be observable and assessable."
        ),
        'assessment_map': (
            "Generate a complete assessment task row for {course_name}: task name, "
            "code, I/R/D designation, weight percentage, ILO coverage, and cognitive domain."
        ),
        'references': (
            "Generate an academic reference in APA 7th-edition format for {course_name}. "
            "Use authoritative textbooks, journal articles, or online resources directly "
            "relevant to the course topics."
        ),
        'attributes': (
            "Generate graduate attribute descriptions for {course_name} including code, "
            "title, and description mapping to student outcomes, CDIO skills, or SDG goals."
        ),
        'policies': (
            "Generate a clear, fair course policy section for {course_name} that covers "
            "student expectations, academic integrity, attendance, and professional conduct."
        ),
    }

    @classmethod
    def build_syllabus_field_prompt(
        cls,
        course_name: str,
        course_code: str,
        field_label: str,
        section: str,
        existing_content: str,
        mode: str,
        context_chunks: list,
        context_summary: str = "",
    ) -> tuple:
        """
        Build a prompt to generate or continue a single syllabus field.

        Args:
            course_name:      Full course title.
            course_code:      Course code (may be empty).
            field_label:      Human-readable label for the field (shown in footer).
            section:          Syllabus section key (e.g. 'tlas', 'ilo', 'policies').
            existing_content: Current value of the field (used for 'continue' mode).
            mode:             'generate' (fresh) or 'continue' (extend existing).
            context_chunks:   RAG chunks (global + course-specific).
            context_summary:  Pre-computed progressive summary (token-efficient).

        Returns:
            (system_prompt: str, user_prompt: str)
        """
        context = cls._format_context(context_chunks, context_summary)

        hint_template = cls._SECTION_HINTS.get(
            section,
            "Generate professional, OBE-aligned content for the {course_name} syllabus.",
        )
        hint = hint_template.replace("{course_name}", course_name)

        system = (
            "You are an expert curriculum designer at a Philippine university following "
            "Outcome-Based Education (OBE). You generate precise, professional syllabus content. "
            "Be specific, practical, and aligned with CHED guidelines. "
            "Return ONLY the requested content — no headers, no explanations, no markdown fences."
        )

        if mode == "continue":
            user = (
                f"REFERENCE MATERIAL:\n{context}\n\n"
                f'TASK: Continue the following content that a faculty member has started for '
                f'the "{field_label}" field of the course "{course_name}" ({course_code or "N/A"}).\n\n'
                f"EXISTING CONTENT:\n{existing_content}\n\n"
                "Continue naturally from where the text leaves off. Match the tone, style, and "
                "format of the existing content. Do not repeat what is already written. "
                "Do not add a header or prefix. Output only the continuation text."
            )
        else:
            user = (
                f"REFERENCE MATERIAL:\n{context}\n\n"
                f"TASK: {hint}\n\n"
                f"Course       : {course_name}\n"
                f"Course Code  : {course_code or 'N/A'}\n"
                f"Field to populate: {field_label}\n\n"
                "Generate professional, OBE-aligned content for this field. "
                "Be concise but complete. Output only the field content — "
                "no headers, no explanations, no extra commentary."
            )

        return system, user

    # ------------------------------------------------------------------
    # Syllabus upload parsing
    # ------------------------------------------------------------------

    @staticmethod
    def build_syllabus_parse_prompt(
        extracted_text: str,
        course_name: str,
        course_code: str,
    ) -> tuple:
        """
        Build a prompt to parse raw syllabus text into the EMPTY_SYLLABUS JSON shape.

        Returns:
            (system_prompt: str, user_prompt: str)
        """
        system = (
            "You are an expert at extracting structured syllabus data from BatStateU Course Information Syllabus (CIS) documents. "
            "Your task is to read every section of the provided document text and map ALL content to the exact JSON schema given. "
            "Extract the COMPLETE and EXACT text from each field — do not summarize, abbreviate, or omit any content. "
            "For table-like sections (assessment tasks, TLA activities, mapping tables), extract every row. "
            "Return ONLY a valid JSON object — no markdown fences, no commentary, no extra text."
        )

        schema = (
            '{\n'
            '  // ── 1. Header & Institutional Info ──\n'
            '  "university_name": "full university name and campus (multi-line ok)",\n'
            '  "college": "college name",\n'
            '  "program": "degree program name",\n'
            '  "document_title": "e.g. Course Information Syllabus (CIS)",\n'
            '\n'
            '  // ── 2. University Direction ──\n'
            '  "vision": "full vision statement text",\n'
            '  "mission": "full mission statement text",\n'
            '\n'
            '  // ── 3. Course Specifications ──\n'
            '  "course_title": "full course title",\n'
            '  "course_code": "e.g. COSC 101",\n'
            '  "course_category": "e.g. Major, Core, GE",\n'
            '  "prerequisites": "prerequisite courses or None",\n'
            '  "semester_year": "e.g. 1st Semester AY 2024-2025",\n'
            '  "credit_hours": "e.g. 3",\n'
            '  "instructor_name": "instructor full name",\n'
            '  "contact_info": "email / phone / room",\n'
            '  "education": "instructor educational background",\n'
            '  "reference_cmo": "CMO number if present",\n'
            '  "date_prepared": "date prepared string",\n'
            '  "revision_no": "revision number",\n'
            '  "revision_date": "revision date string",\n'
            '  "period_of_study": "period of study string",\n'
            '\n'
            '  // ── 4. Course Overview ──\n'
            '  "description": "full course description paragraph(s)",\n'
            '  "rationale": "standalone rationale paragraph explaining WHY this course exists in the program",\n'
            '  "lecture_hours": "number of lecture hours per week",\n'
            '  "lab_hours": "number of lab/laboratory hours per week",\n'
            '\n'
            '  // ── 5. Assessment & Strategies ──\n'
            '  "assessment_criteria": "full criteria for assessment text",\n'
            '  "tlas": "full teaching, learning, and assessment strategies description",\n'
            '\n'
            '  // ── 6. Expected Outcomes ──\n'
            '  "ilos": ["ILO 1 text", "ILO 2 text", "..."],\n'
            '  // ilo_bloom: parallel array to ilos — one entry per ILO with Bloom level name and primary verb\n'
            '  "ilo_bloom": [{"level": "Apply", "verb": "implement"}],\n'
            '  // assessment_tasks: one row per assessment task in the Assessment Method and Distribution Map\n'
            '  // ilo_values: one entry per ILO (same count as ilos array above), value is the assessment code abbreviation (e.g. "ME", "LA", "FP", "AR") or empty string\n'
            '  // c/p/a = Cognitive / Psychomotor / Affective domain values (abbreviations)\n'
            '  // subs: sub-task names within this assessment component (may be empty array)\n'
            '  // category: Formative / Summative / Performance / Project\n'
            '  "assessment_tasks": [{"code": "ME", "task": "Major Examinations", "ird": "I", "category": "Summative", "weight": "60", "ilo_values": ["ME", "", ""], "subs": [], "c": "ME", "p": "", "a": ""}],\n'
            '  // tos: Table of Specifications — one row per major assessment topic\n'
            '  "tos": [{"topic": "Module 1: Introduction", "total_points": "20", "bloom_dist": {"remember": "20", "understand": "30", "apply": "30", "analyze": "20", "evaluate": "0", "create": "0"}}],\n'
            '\n'
            '  // ── 7. References & Frameworks ──\n'
            '  "references": ["full citation string 1", "full citation string 2"],\n'
            '  "igas": [{"code": "IGA1", "title": "attribute title", "description": "full description"}],\n'
            '  "student_outcomes": [{"code": "SO1", "title": "outcome title", "description": "full description"}],\n'
            '  "cdio_skills": [{"code": "CDIO1", "title": "skill title", "description": "full description"}],\n'
            '  "sdg_skills": [{"code": "SDG1", "title": "skill title", "description": "full description"}],\n'
            '\n'
            '  // ── 8. Course Policies ──\n'
            '  "grading_rows": [{"rating": "Excellent", "grade": "1.00", "range": "98 - 100"}],\n'
            '  "policies": [{"title": "Class Policies", "content": "full policy text"}],\n'
            '  "other_policies": "any additional course policies or requirements",\n'
            '\n'
            '  // ── 9. TLA Activities ──\n'
            '  // Extract every row from the TLA Activities table\n'
            '  // chapter: chapter number (e.g. "1", "2") or empty if it is an orientation/exam row\n'
            '  // topics: topics and reading list text\n'
            '  // weeks: week number(s) e.g. "1", "2-3", "4"\n'
            '  // outcomes: topic outcomes text\n'
            '  // ilo: ILO references as comma-separated string e.g. "1, 2, 3"\n'
            '  // ilo_refs: ILO references as an array of ILO numbers e.g. [1, 2, 3] (same data as ilo but structured)\n'
            '  // so: SO references e.g. "1, 2"\n'
            '  // delivery: delivery method e.g. "Lecture, Hands-on Laboratory"\n'
            '  "tla_chapters": [{"chapter": "1", "topics": "Topic / Reading List text", "weeks": "2-3", "outcomes": "outcome text", "ilo": "1, 2", "ilo_refs": [1, 2], "so": "1, 2", "delivery": "Lecture, Hands-on Laboratory"}],\n'
            '\n'
            '  // ── 10. Schedules & Mappings ──\n'
            '  // Assessment Schedule: SCHEDULE_WEEKS is [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18] (16 entries)\n'
            '  // values array has 16 entries (index 0 = week 3, index 1 = week 4, ..., index 15 = week 18)\n'
            '  "schedule_methods": [{"name": "Major Examinations", "values": ["", "", "60", "", "", "", "60", "", "", "", "", "", "", "", "80", ""]}],\n'
            '\n'
            '  // ILO-SO and ILO-CPA Mapping\n'
            '  // so_headers: the SO column numbers/codes that appear in the mapping table (e.g. ["2","3","5"])\n'
            '  // so_cpa_rows: one entry per ILO (same count as ilos)\n'
            '  //   so_vals: one value per so_header column (assessment abbreviation or empty string)\n'
            '  //   c/p/a: Cognitive/Psychomotor/Affective domain mapping for this ILO\n'
            '  "so_headers": ["2", "3", "5"],\n'
            '  "so_cpa_rows": [{"so_vals": ["ME, LA", "", ""], "c": "ME", "p": "ME, LA", "a": ""}],\n'
            '\n'
            '  // ILO-IGA Mapping\n'
            '  // iga_headers: IGA column numbers/codes (e.g. ["3","6"])\n'
            '  // iga_rows: one entry per ILO, vals has one value per iga_header column\n'
            '  "iga_headers": ["3", "6"],\n'
            '  "iga_rows": [{"vals": ["ME, LA, FP", ""]}],\n'
            '\n'
            '  // ILO-CDIO and ILO-SDG Mapping\n'
            '  // cdio_headers: CDIO column numbers (e.g. ["3","4"])\n'
            '  // sdg_headers: SDG column numbers (e.g. ["2","5"])\n'
            '  // cdio_sdg_rows: one entry per ILO\n'
            '  //   cdio_vals: one value per cdio_header column\n'
            '  //   sdg_vals: one value per sdg_header column\n'
            '  "cdio_headers": ["3", "4"],\n'
            '  "sdg_headers": ["2", "5"],\n'
            '  "cdio_sdg_rows": [{"cdio_vals": ["", "ME, LA, FP"], "sdg_vals": ["ME, LA, FP", ""]}]\n'
            '}'
        )

        user = (
            f"Parse this BatStateU Course Information Syllabus (CIS) document for course: {course_name} ({course_code or 'N/A'}).\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "1. Extract EVERY field — leave nothing empty if the text contains the data.\n"
            "2. For ILOs: extract each numbered ILO as a separate array element.\n"
            "3. For ilo_bloom: for each ILO, infer the Bloom's Taxonomy level and primary verb from the ILO statement "
            "(e.g. 'implement' → Apply, 'analyze' → Analyze). Create one entry per ILO parallel to the ilos array.\n"
            "4. For rationale: extract or infer the course rationale (why this course exists in the program). "
            "If the document has a combined description+rationale, split them: description = what the course covers, "
            "rationale = why it is important/required.\n"
            "5. For assessment_tasks: extract every row from the Assessment Method and Distribution Map table. "
            "The ilo_values array must have exactly one entry per ILO (same length as the ilos array). "
            "Infer category (Formative/Summative/Performance/Project) from the task name. "
            "Extract subs (sub-task names) if listed within the component.\n"
            "6. For tos: extract the Table of Specifications if present. Each row needs topic, total_points, "
            "and bloom_dist percentages. If no TOS is present, derive one from the assessment breakdown.\n"
            "7. For tla_chapters: extract EVERY row from the TLA Activities table (including orientation, exams, and all chapters). "
            "Set ilo_refs as an integer array matching the ilo string field (e.g. ilo='1,2' → ilo_refs=[1,2]).\n"
            "8. For schedule_methods: the values array has 16 entries for weeks 3-18. "
            "Find the assessment schedule grid and place each score in the correct week index "
            "(index 0=wk3, index 1=wk4, index 2=wk5, ..., index 13=wk16, index 14=wk17, index 15=wk18). "
            "Put empty string '' for weeks with no value.\n"
            "9. For mapping tables (so_cpa_rows, iga_rows, cdio_sdg_rows): "
            "extract the column header numbers/codes into *_headers arrays, "
            "and create one row per ILO with the assessment abbreviations in the correct column slots.\n"
            "10. Use empty string '' (never null) for missing scalar values. "
            "Use [] for empty arrays, but always include at least one element.\n"
            "11. Preserve exact text — do not summarize.\n\n"
            f"SYLLABUS TEXT:\n{extracted_text}\n\n"
            f"Return a JSON object with EXACTLY these keys and structure:\n{schema}"
        )

        return system, user
