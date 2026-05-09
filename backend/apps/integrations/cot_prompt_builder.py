"""
Chain-of-Thought (CoT) prompt builder for ATLAS curriculum and assessment generation.

Each builder method returns a (system_prompt, user_prompt) tuple ready to pass
to LLMService.generate_response().  RAG context chunks retrieved via rag_service
are embedded in the user prompt so the LLM grounds its output in the knowledge base.

Generation pipeline:
    1. Caller runs semantic_search(query) → context_chunks
    2. Caller calls the appropriate CoTPromptBuilder.build_*() method
    3. system_prompt + user_prompt are forwarded to LLMService.generate_response()
"""


class CoTPromptBuilder:
    """Builds structured, step-by-step prompts for syllabus, module, and assessment generation."""

    # ------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _format_context(chunks: list) -> str:
        """
        Format a list of RAG chunk dicts into a readable block for the prompt.

        Each chunk dict must have 'text', 'document_title', and optionally 'page_number'.
        Returns a placeholder string when no chunks are provided.
        """
        if not chunks:
            return (
                "(No reference material was retrieved from the knowledge base. "
                "Generate the content using your expert knowledge of Outcome-Based Education.)"
            )

        parts = []
        for i, chunk in enumerate(chunks, 1):
            source = f"[Source: {chunk['document_title']}"
            if chunk.get("page_number"):
                source += f", p. {chunk['page_number']}"
            source += f" | Relevance: {chunk.get('score', 0):.2f}]"
            parts.append(f"--- Reference {i} {source} ---\n{chunk['text']}")

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
    ) -> tuple:
        """
        Build a CoT prompt for generating a complete university course syllabus.

        Returns:
            (system_prompt: str, user_prompt: str)
        """
        context = CoTPromptBuilder._format_context(context_chunks)
        extra = f"\nAdditional faculty instructions: {extra_instructions}" if extra_instructions else ""

        system = (
            "You are an expert curriculum designer at a Philippine university that follows "
            "Outcome-Based Education (OBE). You produce thorough, well-structured syllabi "
            "that align Course Learning Outcomes (CLOs) with Bloom's Taxonomy levels and "
            "clearly map assessments to those outcomes. Always be specific and practical."
        )

        user = f"""REFERENCE MATERIAL FROM KNOWLEDGE BASE:
{context}

TASK: Generate a comprehensive university course syllabus.

Course Name : {course_name}
Course Code : {course_code or "N/A"}
Duration    : {num_weeks} weeks{extra}

THINK STEP BY STEP:

Step 1 — Course Scope
  Using the reference material above, identify the core purpose, coverage, and level
  of the course. Note any prerequisite knowledge implied by the content.

Step 2 — Course Learning Outcomes (CLOs)
  Formulate 4–6 measurable CLOs using Bloom's Taxonomy action verbs.
  For each CLO specify: CLO number | Statement | Bloom's Level.

Step 3 — Weekly Schedule
  Plan a {num_weeks}-week schedule where topics build progressively on each other.
  Ensure every CLO is addressed at least once across the schedule.

Step 4 — Assessment Design
  Design assessments (quizzes, midterm exam, final exam, projects, activities) that
  directly map to the CLOs. Specify which CLOs each assessment covers.

Step 5 — Grading Breakdown
  Assign weights to each assessment component such that they total exactly 100%.

Step 6 — References
  List required and recommended textbooks, articles, or online resources.

OUTPUT — Return the syllabus using exactly this structure:

1. COURSE DESCRIPTION (3–4 sentences)

2. COURSE LEARNING OUTCOMES
   CLO | Statement | Bloom's Level

3. WEEKLY SCHEDULE
   Week | Topic / Subject Matter | Key Learning Activities | Assessment / Output

4. ASSESSMENT BREAKDOWN
   Component | Weight (%) | CLOs Covered

5. REQUIRED MATERIALS & REFERENCES
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
    ) -> tuple:
        """
        Build a CoT prompt for generating a detailed teaching module.

        Returns:
            (system_prompt: str, user_prompt: str)
        """
        context = CoTPromptBuilder._format_context(context_chunks)
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
    ) -> tuple:
        """
        Build a CoT prompt for generating a full assessment with items and rubric.

        Returns:
            (system_prompt: str, user_prompt: str)
        """
        context = CoTPromptBuilder._format_context(context_chunks)

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
