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

import json
import logging
import re

logger = logging.getLogger(__name__)

# Maximum tokens of RAG context to inject into a prompt.
# Keeps total prompt within typical 8 K-context LLM windows.
_CONTEXT_TOKEN_BUDGET: int = 2_000

_INSTRUCTION_ECHO = re.compile(
    r"\b("
    r"8\s*[–-]\s*16|7\s*[–-]\s*12|hard cap|bloom'?s?\s+verb|"
    r"one short sentence|one brief sentence|we need|no second clause|"
    r"word count|these rules|verb list|do not mention|imperative verb|"
    r"topic outcomes?\s*\d|output a single|field name|count words"
    r")\b",
    re.IGNORECASE,
)


def field_reply_is_usable(section: str, text: str) -> bool:
    """False when a field reply is empty or only restates the writing rules."""
    cleaned = (text or "").strip()
    if len(cleaned) < 3:
        return False
    if _INSTRUCTION_ECHO.search(cleaned):
        return False
    if section == "topic_map":
        return re.search(r"\d+\D+\d+", cleaned) is not None
    if section == "tla_rows":
        return '"topics"' in cleaned or cleaned.startswith("[") or cleaned.startswith("{")
    if section == "tla_brief":
        return len(cleaned) >= 40
    if section == "framework_columns":
        return bool(re.search(r"\b(SO|IGA|CDIO|SDG)\b", cleaned, re.IGNORECASE) and re.search(r"\d", cleaned))
    return True


def complete_syllabus_field(llm, *, section, messages, system, preferred_provider=None, max_tokens=None):
    """Return one field reply, handing the call to Ollama when the cloud reply stops.

    A provider error cannot be retried, so Ollama takes that call. A reply that
    only restates the rules is tried once more; if that second reply also stops,
    Ollama takes the call.
    """
    max_tokens = max_tokens or CoTPromptBuilder.field_max_tokens(section)

    def call(preferred):
        return llm.generate_response_with_fallback(
            messages=messages,
            preferred_provider=preferred,
            system=system,
            max_tokens=max_tokens,
            return_provider=True,
        )

    if preferred_provider == "ollama":
        return call("ollama")

    try:
        text, provider_used = call(preferred_provider)
    except Exception as exc:
        logger.warning("Syllabus field %s stopped and cannot retry (%s); handing to Ollama", section, exc)
        return call("ollama")

    if field_reply_is_usable(section, text):
        return text, provider_used

    try:
        text, provider_used = call(preferred_provider)
    except Exception as exc:
        logger.warning("Syllabus field %s retry stopped (%s); handing to Ollama", section, exc)
        return call("ollama")

    if field_reply_is_usable(section, text):
        return text, provider_used

    logger.warning("Syllabus field %s retry returned an unusable reply; handing to Ollama", section)
    return call("ollama")

# How deeply a module should be structured. Chosen by the faculty in the
# "Generate module" dialog and translated into prompt instructions.
MODULE_STRUCTURING_LEVELS: dict = {
    "standard": {
        "label": "Standard",
        "subtopics": "3-5",
        "paragraphs": "3-4",
        "min_items": 3,
        "hint": "Balanced depth for a regular class session — cover the core ideas without padding.",
    },
    "detailed": {
        "label": "Detailed",
        "subtopics": "4-6",
        "paragraphs": "5-6",
        "min_items": 4,
        "hint": "Deep coverage for a full lecture or lab series — explain the concepts thoroughly.",
    },
    "concise": {
        "label": "Concise",
        "subtopics": "2-3",
        "paragraphs": "2",
        "min_items": 2,
        "hint": "A quick refresher or orientation — hit the essentials only.",
    },
    "activity": {
        "label": "Activity-led",
        "subtopics": "3-4",
        "paragraphs": "2-3",
        "min_items": 3,
        "hint": "The short activity drives the session — the subtopics support it.",
    },
}


def _count_tokens(text: str) -> int:
    """Fast token estimate: 1 token ≈ 4 characters (no external dependency)."""
    return max(1, len(text) // 4)


_SYLLABUS_CATEGORIES = ("ged", "common", "professional", "mandated")

# Stored text. Prompts must not ask the model to write these.
_SYLLABUS_DO_NOT_GENERATE = (
    "Do not write any of these. They are stored and inserted: "
    "vision, mission, Institutional Graduate Attributes, Student Outcomes, "
    "CDIO skills, SDG skills, mapping sentences, grading scale, class policy, "
    "missed examinations, academic dishonesty, dropping, remarks, "
    "a table of specifications, or a second assessment plan. "
    "Criteria for Assessment is faculty input. Read it. Do not add or rename a component."
)

_SYLLABUS_SHAPE = (
    "Present tense. Subject is \"This course\", \"The course\", or \"Students\". "
    "No first person. No contractions in the rationale. "
    "Intended learning outcomes and topic outcomes are bare imperatives. "
    "Do not write \"students will be able to\", \"students should be able to\", "
    "\"this section describes\", or \"in conclusion\". "
    "No second sentence in a table cell. No week-by-week retelling in the rationale "
    "or the teaching-learning-assessment text. No definitions of tools, standards, or frameworks. "
    "No stacked adjectives. Subtopic lines are noun phrases of 2–5 words, one per line, no period. "
    "No laboratory line, tool list, or sprint on a general-education, PATHFit, NSTP, capstone, or internship course. "
    "No chapter titles (\"Main Topic N\") and no second civic clause on a common-course or professional-course ILO. "
    "No more than three intended learning outcomes."
)

_LECTURE_ONLY_MARKERS = (
    "human-computer interaction",
    "human computer interaction",
    "project management",
    "social issues",
    "technopreneurship",
    "platform technologies",
)

_CATEGORY_BLOCKS = {
    "ged": (
        "Course Rationale and Description — 2–3 sentences on what the course examines in society, "
        "culture, or the discipline's role in ordinary life, and why a student in any program takes it. "
        "No tools. No weekly topics.\n\n"
        "Teaching, Learning, and Assessment Strategies — only the faculty criteria "
        "(examinations, quizzes, participation, a course project). Methods are lecture, discussion, "
        "and the named activity. No laboratory and no technology list.\n\n"
        "Each ILO — one short sentence. Verbs: Explain, Examine, Discuss, Critique. No \"such that\" clause.\n\n"
        "Topics / Reading List — a chapter-style topic title, indented subtopic titles, then an activity "
        "title such as Written Assessment #1, Reflection, or Film Viewing.\n\n"
        "Weeks — a single week number (10, 14) or a merged pair for a heavier topic (1-2, 5-6). "
        "Digits and a hyphen only. The rows together cover week 1 through week 18.\n\n"
        "Topic Outcomes — one brief sentence on what the student does with that topic."
    ),
    "common": (
        "Course Rationale and Description — 2–3 sentences on the foundation skill and where it sits "
        "before the major courses. Name a tool only when the course cannot be described without it.\n\n"
        "Teaching, Learning, and Assessment Strategies — only the faculty criteria "
        "(laboratory activities, case studies, examinations, projects). One clause each. "
        "Methods are lecture plus the laboratory or case already named in the criteria.\n\n"
        "Each ILO — one short sentence. Verbs: Define, Apply, Implement, Analyze.\n\n"
        "Topics / Reading List — topic title, indented subtopic titles, activity title. "
        "The activity is a lab, case, or exercise (Lab 1, Case Study 1), not a chapter essay.\n\n"
        "Weeks — a single week number (10, 14) or a merged pair for a heavier topic (1-2, 5-6). Digits and a hyphen only. The rows together cover week 1 through week 18.\n\n"
        "Topic Outcomes — one brief sentence, imperative, about the skill practiced that week."
    ),
    "professional": (
        "Course Rationale and Description — 2–3 sentences on the major skill and the course output "
        "(a build, an analysis, or a design). One tool name is enough.\n\n"
        "Teaching, Learning, and Assessment Strategies — only the faculty criteria. One clause each. "
        "Do not add Analytics Reporting, a sprint, or a final exam unless that line is already in the criteria.\n\n"
        "Each ILO — one short sentence. Verbs: Analyze, Apply, Design, Implement, Evaluate.\n\n"
        "Topics / Reading List — topic title, indented subtopic titles, activity title "
        "(Lab, Sprint, Case, Reporting).\n\n"
        "Weeks — a single week number (10, 14) or a merged pair for a heavier topic (1-2, 5-6). Digits and a hyphen only. The rows together cover week 1 through week 18.\n\n"
        "Topic Outcomes — one brief sentence."
    ),
    "capstone": (
        "Course Rationale and Description — 2–3 sentences naming the required output "
        "(proposal, completed system, documentation, defense) and the standing rule. No tool catalog.\n\n"
        "Teaching, Learning, and Assessment Strategies — only the faculty criteria "
        "(proposal, documentation, oral defense). One clause each.\n\n"
        "Each ILO — one short sentence on the output the student produces.\n\n"
        "Topics / Reading List — phase title, indented work-item titles, activity title is the deliverable "
        "(Proposal, Documentation, Oral Defense).\n\n"
        "Weeks — a single week number (10, 14) or a merged pair for a heavier topic (1-2, 5-6). Digits and a hyphen only. The rows together cover week 1 through week 18.\n\n"
        "Topic Outcomes — one brief sentence for that phase."
    ),
    "internship": (
        "Course Rationale and Description — 2–3 sentences stating the required hours "
        "(500 for BSIT Internship Training) and the year standing. No weekly chapter list.\n\n"
        "Teaching, Learning, and Assessment Strategies — only the faculty criteria "
        "(deployment, accomplishment report, supervisor evaluation, narrative report, presentation).\n\n"
        "Each ILO — one short sentence on the workplace task or the report.\n\n"
        "Topics / Reading List — requirement title, indented requirement parts, activity title "
        "(Narrative Report, Supervisor Evaluation, Presentation). Do not emit 18 topic rows.\n\n"
        "Weeks — 1 or 1-2 for each requirement block, not one row per calendar week of the deployment.\n\n"
        "Topic Outcomes — one brief sentence."
    ),
    "pathfit": (
        "Course Rationale and Description — 2–3 sentences naming the movement, exercise, game, "
        "or sport in the course title.\n\n"
        "Teaching, Learning, and Assessment Strategies — only the faculty criteria "
        "(practical test, participation, attendance). Demonstration and drill. No technology list.\n\n"
        "Each ILO — one short sentence. Verbs: Demonstrate, Perform, Apply.\n\n"
        "Topics / Reading List — skill title, indented drill or game titles, activity title "
        "(Practical Drill, Performance Check).\n\n"
        "Weeks — a single week number (10, 14) or a merged pair for a heavier topic (1-2, 5-6). Digits and a hyphen only. The rows together cover week 1 through week 18.\n\n"
        "Topic Outcomes — one brief sentence on the skill performed."
    ),
    "nstp": (
        "Course Rationale and Description — 2–3 sentences citing Republic Act 9163 and the component "
        "(CWTS, LTS, or ROTC).\n\n"
        "Teaching, Learning, and Assessment Strategies — only the faculty criteria "
        "(attendance, immersion output, final report).\n\n"
        "Each ILO — one short sentence on the service or training task.\n\n"
        "Topics / Reading List — module title, indented session titles, activity title "
        "(Community Immersion, Literacy Session, Final Report).\n\n"
        "Weeks — a single week number (10, 14) or a merged pair for a heavier topic (1-2, 5-6). Digits and a hyphen only. The rows together cover week 1 through week 18.\n\n"
        "Topic Outcomes — one brief sentence."
    ),
}

_CATEGORY_FIELD_PREFIX = {
    "rationale": "Course Rationale and Description",
    "tlas": "Teaching, Learning, and Assessment Strategies",
    "ilo": "Each ILO",
    "topics": "Topics / Reading List",
    "topic_outcome": "Topic Outcomes",
}

_ILO_VERBS = {
    "ged": "Explain, Examine, Discuss, Critique",
    "common": "Define, Apply, Implement, Analyze",
    "professional": "Analyze, Apply, Design, Implement, Evaluate",
    "professional_lecture": "Analyze, Apply, Design, Implement, Evaluate",
    "capstone": "Analyze, Apply, Design, Implement, Evaluate",
    "internship": "Apply, Implement, Evaluate",
    "pathfit": "Demonstrate, Perform, Apply",
    "nstp": "Apply, Perform, Explain",
}


def _normalize_syllabus_category(category: str) -> str:
    value = (category or "professional").strip().lower()
    return value if value in _SYLLABUS_CATEGORIES else "professional"


def _contains_term(blob: str, term: str) -> bool:
    import re
    return re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", blob) is not None


def syllabus_course_kind(course_name: str, course_code: str, category: str) -> tuple:
    """Return (stored category, instruction block key).

    Internship, thesis, and capstone stay ``professional``. Only the topic
    block changes, and only when the title or code says so. PATHFit and NSTP
    stay ``mandated``.
    """
    stored = _normalize_syllabus_category(category)
    blob = f"{course_name or ''} {course_code or ''}".lower()
    if stored == "professional":
        if any(_contains_term(blob, term) for term in ("internship", "ojt", "practicum")):
            return stored, "internship"
        if any(_contains_term(blob, term) for term in ("capstone", "thesis")):
            return stored, "capstone"
        if any(_contains_term(blob, term) for term in _LECTURE_ONLY_MARKERS):
            return stored, "professional_lecture"
        return stored, "professional"
    if stored == "mandated":
        if any(_contains_term(blob, term) for term in ("nstp", "national service", "cwts", "rotc")):
            return stored, "nstp"
        return stored, "pathfit"
    return stored, stored


def _category_block(kind: str) -> str:
    if kind == "professional_lecture":
        return (
            _CATEGORY_BLOCKS["professional"]
            + "\n\nThis course is lecture only (3 lecture, 0 laboratory). Do not invent a laboratory."
        )
    return _CATEGORY_BLOCKS.get(kind) or _CATEGORY_BLOCKS["professional"]


def _category_field_line(kind: str, section: str) -> str:
    prefix = _CATEGORY_FIELD_PREFIX.get(section, "")
    if not prefix:
        return ""
    for paragraph in _CATEGORY_BLOCKS.get(
        "professional" if kind == "professional_lecture" else kind,
        _CATEGORY_BLOCKS["professional"],
    ).split("\n\n"):
        if paragraph.startswith(prefix):
            line = paragraph.strip()
            if kind == "professional_lecture":
                return line + " This course is lecture only (3 lecture, 0 laboratory). Do not invent a laboratory."
            return line
    return ""


def _criteria_lines(criteria: str) -> str:
    import re
    text = (criteria or "").strip()
    if not text:
        return "(none yet)"
    lines = []
    for line in text.splitlines():
        cleaned = re.sub(r"^[-*•]\s*", "", line.strip())
        if cleaned:
            lines.append(cleaned)
    return "\n".join(lines) if lines else "(none yet)"


def _weekly_block_line(kind: str, num_weeks: int) -> str:
    if kind == "internship":
        return (
            "Weekly blocks: one block per requirement, not one row per calendar week. "
            "Do not emit 18 topic rows. Each block's week cell is 1 or 1-2."
        )
    term = num_weeks if num_weeks and num_weeks > 0 else 18
    return (
        f"One row per topic. A week cell is a single number (10, 14) or a merged pair "
        f"(1-2, 5-6) when that topic is heavier. The rows together cover week 1 through week {term}. "
        f"Do not skip a week and do not pass week {term}."
    )


def _parse_topic_plan(raw: str) -> list:
    """Read '1 or 2, then a title' lines. A merged pair counts as span 2."""
    import re
    rows = []
    for line in (raw or "").splitlines():
        cleaned = re.sub(r"^[-*•]\s*", "", line.strip())
        if not cleaned:
            continue
        merged = re.match(r"^(\d+)\s*-\s*(\d+)\s+(.+)$", cleaned)
        if merged:
            start, end = int(merged.group(1)), int(merged.group(2))
            span = 2 if end > start else 1
            title = re.sub(r"\s+", " ", merged.group(3)).strip(" .")
            if title:
                rows.append((span, title))
            continue
        span_line = re.match(r"^(1|2)(?:\t+|\s+)(.+)$", cleaned)
        if span_line:
            title = re.sub(r"\s+", " ", span_line.group(2)).strip(" .")
            if title and title.lower() not in {"topic", "title", "topic title"}:
                rows.append((int(span_line.group(1)), title))
            continue
        if cleaned.lower() in {"topic", "title", "weeks"}:
            continue
        rows.append((1, re.sub(r"\s+", " ", cleaned).strip(" .")))
    return rows


def _fit_topic_spans(spans: list, term_weeks: int) -> list:
    """Make the spans add up to the term. A span is 1 week or a heavier 2-week pair."""
    items = [2 if span == 2 else 1 for span in spans]
    if not items:
        items = [1] * term_weeks

    def total():
        return sum(items)

    while total() > term_weeks and items:
        # Drop an extra one-week topic before flattening a heavier two-week topic.
        if len(items) > 1 and items[-1] == 1:
            items.pop()
            continue
        heavy = next((index for index in range(len(items) - 1, -1, -1) if items[index] == 2), None)
        if heavy is not None:
            items[heavy] = 1
            continue
        items.pop()
    while total() < term_weeks:
        light = next((index for index, span in enumerate(items) if span == 1), None)
        if light is not None:
            items[light] = 2
        else:
            remain = term_weeks - total()
            items.append(2 if remain >= 2 else 1)
    return items


def _week_labels(spans: list) -> list:
    cursor = 1
    labels = []
    for span in spans:
        if span <= 1:
            labels.append(str(cursor))
            cursor += 1
        else:
            labels.append(f"{cursor}-{cursor + span - 1}")
            cursor += span
    return labels


_ORIENTATION_TITLE = "Class Orientation"
_EXAM_WEEK_TITLE = "Final Examination and Submission of Requirements"


def _is_orientation_title(title: str) -> bool:
    lowered = (title or "").strip().lower()
    return lowered in {"class orientation", "introduction to the course", "orientation"} or lowered.startswith("class orientation")


def _is_exam_week_title(title: str) -> bool:
    lowered = (title or "").strip().lower()
    return "final examination" in lowered or "submission of requirements" in lowered


def assign_topic_weeks(raw: str, term_weeks: int = 18, pad_to_term: bool = True) -> str:
    """Turn a topic plan into one row per topic.

    The first row is always Class Orientation on week 1. Content topics start
    again at week 1, so week 1 appears twice. Each later line is
    ``{week label}\\t{title}``. A light topic is ``10``. A heavier topic is
    ``3-4``. Content labels cover week 1 through week 17 when the term is 18.
    Week 18 is the final examination, not a topic. Internship plans are not
    padded to 18 and do not gain that examination row.
    """
    parsed = [
        (span, title)
        for span, title in _parse_topic_plan(raw)
        if not _is_orientation_title(title) and not _is_exam_week_title(title)
    ]
    spans = [span for span, _title in parsed]
    titles = [title for _span, title in parsed]
    reserve_exam = bool(pad_to_term and term_weeks >= 18)
    target = max(1, term_weeks - 1) if reserve_exam else term_weeks
    fitted = _fit_topic_spans(spans, target) if pad_to_term else (
        [2 if span == 2 else 1 for span in spans] or [1]
    )
    lines = [f"1\t{_ORIENTATION_TITLE}"]
    for index, label in enumerate(_week_labels(fitted)):
        title = titles[index] if index < len(titles) else ""
        lines.append(f"{label}\t{title}".rstrip())
    if reserve_exam:
        lines.append(f"{term_weeks}\t{_EXAM_WEEK_TITLE}")
    return "\n".join(lines)


class CoTPromptBuilder:
    """Builds structured, step-by-step prompts for syllabus, module, and assessment generation."""

    # Whole-syllabus call after vision, policy, TOS, and framework text are removed.
    SYLLABUS_MAX_TOKENS = 900
    GENERATABLE_SYLLABUS_SECTIONS = frozenset({
        "rationale", "tlas", "ilo", "topics", "topic_outcome", "week_plan", "topic_map",
        "framework_columns",
    })
    _FIELD_MAX_TOKENS = {
        "rationale": 160,
        "tlas": 220,
        "ilo": 60,
        "topics": 120,
        "topic_outcome": 60,
        "week_plan": 360,
        "topic_map": 96,
        "framework_columns": 120,
        "tla_brief": 700,
        "tla_rows": 720,
    }

    @classmethod
    def field_max_tokens(cls, section: str) -> int:
        return cls._FIELD_MAX_TOKENS.get(section, 60)

    # ------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _format_source_passages(chunks: list) -> str:
        """Format retrieved passages. The matched child chunk leads; the parent section follows."""
        parts = []
        tokens_used = 0
        for i, chunk in enumerate(chunks, 1):
            source = f"[Source: {chunk.get('document_title') or 'Uploaded course file'}"
            if chunk.get("page_number"):
                source += f", p. {chunk['page_number']}"
            if chunk.get("course_code"):
                source += f" | Course: {chunk['course_code']}"
            if chunk.get("module_tag"):
                source += f" | Module: {chunk['module_tag']}"
            if chunk.get("term_tag"):
                source += f" | Term: {chunk['term_tag']}"
            source += f" | Relevance: {float(chunk.get('score') or 0):.2f}]"
            header = f"--- Reference {i} {source} ---\n"
            child_text = (chunk.get("text") or "").strip()
            parent_text = (chunk.get("parent_text") or "").strip()
            if child_text and parent_text and parent_text != child_text:
                body = f"{child_text}\n\nSurrounding section:\n{parent_text}"
            else:
                body = child_text or parent_text
            entry_tokens = _count_tokens(header + body)
            remaining = _CONTEXT_TOKEN_BUDGET - tokens_used
            if entry_tokens > remaining:
                if not parts:
                    body = body[: max(remaining, 1) * 4] + "…"
                    parts.append(header + body)
                break
            parts.append(header + body)
            tokens_used += entry_tokens
        return "\n\n".join(parts)

    @staticmethod
    def _format_context(chunks: list, context_summary: str = "") -> str:
        """
        Build the RAG context block for a prompt.

        ``context_summary`` is the institutional knowledge base and is a structure
        guide only. ``chunks`` are passages retrieved from faculty uploads through
        child-chunk search. A summary never replaces those passages.
        """
        summary = (context_summary or "").strip()
        structure = ""
        if summary:
            structure = (
                "[STRUCTURE GUIDE — institutional knowledge base]\n"
                "Use this only for academic form, section shape, and OBE structure. "
                "Do not take subject matter from it.\n"
                f"{summary}"
            )

        if chunks:
            source = (
                "[SOURCE CONTENT — faculty uploaded files]\n"
                "Write the subject matter from these passages. They are the priority "
                "reference. Each passage starts with the matched chunk, then the "
                "surrounding section it belongs to.\n"
                + CoTPromptBuilder._format_source_passages(chunks)
            )
        elif structure:
            source = (
                "[SOURCE CONTENT — faculty uploaded files]\n"
                "(No passage was retrieved from the uploaded course files.)"
            )
        else:
            return (
                "(No reference material was retrieved from the knowledge base. "
                "Generate the content using your expert knowledge of Outcome-Based Education.)"
            )

        if structure:
            return f"{structure}\n\n{source}"
        return source

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
        course_category: str = "professional",
        assessment_criteria: str = "",
    ) -> tuple:
        """
        Build a CoT prompt for the course cells of a syllabus.

        Vision, mission, framework catalogs, policy, grading, the table of
        specifications, and a second assessment plan are not requested.
        ``course_category`` is the stored value (ged, common, professional,
        mandated). Capstone, thesis, and internship stay professional and
        only swap the subject-matter block.

        Returns:
            (system_prompt: str, user_prompt: str)
        """
        context = CoTPromptBuilder._format_context(context_chunks, context_summary)
        extra = f"\nAdditional faculty instructions: {extra_instructions}" if extra_instructions else ""
        stored_category, kind = syllabus_course_kind(course_name, course_code, course_category)
        criteria = _criteria_lines(assessment_criteria)
        weeks_line = _weekly_block_line(kind, num_weeks)

        system = (
            "You are an expert curriculum designer at a Philippine university that follows "
            "Outcome-Based Education (OBE). Write only the cells listed, at the length given, "
            "and do not add a section that was not requested. "
            + _SYLLABUS_SHAPE + " " + _SYLLABUS_DO_NOT_GENERATE
        )

        user = f"""Private note — Step 1: read the reference material below. Do not print Step 1.

REFERENCE MATERIAL FROM KNOWLEDGE BASE:
{context}

Course Name : {course_name}
Course Code : {course_code or "N/A"}
{weeks_line}{extra}

Course category: {stored_category}
Criteria for Assessment (faculty input, do not add or rename a component):
{criteria}

Subject matter for this category:
{_category_block(kind)}

Write only these cells.

Course Rationale and Description
  2–3 sentences. One idea per sentence. No second paragraph, no tool catalog, no week list. Follow the category block. Do not also emit a separate description.

Teaching, Learning, and Assessment Strategies
  Use only the criteria above. For each line, one clause on how it is taught and how it is assessed.
  Do not add a component. Do not restate the rationale. No closing essay.

Intended Learning Outcomes
  Three lines. Each line is one short sentence. One Bloom verb. 8–16 words. One period. Hard cap 18 words.
  No "students should be able to".

Weekly rows
  One row per topic.
    Topics / Reading List — topic title, indented subtopic titles, activity title. Titles only. No sentences.
    Weeks — a single week number (10, 14) or a merged pair for a heavier topic (1-2, 5-6). Digits and a hyphen only. Together the rows cover week 1 through the end of the term. Do not skip a week.
    Topic Outcomes — one brief sentence. One imperative verb. No second sentence.
  Do not write Key Learning Activities or Delivery as extra sentences in the row.
  ILO numbers, if needed, are codes (1, 2) in their own column.
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
        section_label: str = "",
        subsection_label: str = "",
        section_context: str = "",
        structuring_level: str = "standard",
        syllabus_subtopics: list = None,
        activity_title: str = "",
        course_brief: str = "",
        neighbor_titles: list = None,
    ) -> tuple:
        """
        Build a CoT prompt that instructs the LLM to return a **strict JSON** module.

        Args:
            ilos:               List of ILO/CLO strings from the course syllabus.
            course_description: The course description text.
            week_topic:         The topic for this specific week from the syllabus schedule.
            section_label:      Syllabus section the topic was taken from.
            subsection_label:   Subsection of that section the topic was taken from.
            section_context:    Raw syllabus text of the selected section/subsection.
            structuring_level: How deep the module should be (standard/detailed/concise/activity).
            course_brief: Cached course brief. When set, raw retrieved passages are not included.
            neighbor_titles: The topic titles immediately before and after this module.

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
        brief = (course_brief or "").strip()
        if brief:
            source_heading = "Course brief"
            context = brief
        else:
            source_heading = "REFERENCE MATERIAL FROM KNOWLEDGE BASE"
            context = CoTPromptBuilder._format_context(context_chunks, context_summary)
        extra = f"\nAdditional faculty instructions: {extra_instructions}" if extra_instructions else ""
        level = MODULE_STRUCTURING_LEVELS.get(
            (structuring_level or "standard").strip().lower(),
            MODULE_STRUCTURING_LEVELS["standard"],
        )
        outline = [str(item).strip() for item in (syllabus_subtopics or []) if str(item).strip()]
        activity = str(activity_title or "").strip()
        if outline:
            subtopic_blocks = []
            for index, name in enumerate(outline):
                subtopic_blocks.append(
                    "    {\n"
                    f'      "id": "st_{index}",\n'
                    f'      "title": {json.dumps(name)},\n'
                    '      "content": "..."\n'
                    "    }"
                )
            subtopic_json = ",\n".join(subtopic_blocks)
            step4 = (
                "Step 4 — Expand each syllabus subtopic below, in this order. "
                "Copy each title exactly. Write 2 short paragraphs for each title. "
                "Do not add, drop, or rename a subtopic."
            )
            subtopic_rule = (
                f"- The \"subtopics\" array must contain exactly {len(outline)} items, "
                "in the syllabus order, with the titles copied exactly."
            )
        else:
            subtopic_json = """    {
      "id": "st_0",
      "title": "...",
      "content": "..."
    },
    {
      "id": "st_1",
      "title": "...",
      "content": "..."
    },
    {
      "id": "st_2",
      "title": "...",
      "content": "..."
    }"""
            step4 = (
                f"Step 4 — Break \"{module_title}\" into {level['subtopics']} logical subtopics. "
                f"For each, write {level['paragraphs']} paragraphs of content grounded in the "
                f"reference material and course context, matching the \"{level['label']}\" depth "
                "requested above."
            )
            subtopic_rule = f"- The \"subtopics\" array MUST have at least {level['min_items']} items."
        if activity:
            step5 = (
                f"Step 5 — The short activity is \"{activity}\". "
                "Copy that title exactly. Write the steps for that activity. "
                "Do not invent a different activity."
            )
            activity_json = json.dumps(activity)
        else:
            step5 = (
                "Step 5 — Design a short formative activity (15-20 min) aligned to this module's "
                "objectives and the Course ILOs."
            )
            activity_json = '"..."'
        outline_block = ""
        if outline or activity:
            lines = ["SYLLABUS OUTLINE (copy these titles; expand them, do not replace them):"]
            lines.append(f"Topic: {module_title}")
            for index, name in enumerate(outline, 1):
                lines.append(f"Subtopic {index}: {name}")
            if activity:
                lines.append(f"Activity: {activity}")
            outline_block = "\n" + "\n".join(lines) + "\n"

        # Build the COURSE DATA block from real syllabus data
        course_data_parts = []
        if course_description:
            course_data_parts.append(f"COURSE DESCRIPTION:\n{course_description.strip()}")
        if ilos:
            ilo_lines = "\n".join(f"  ILO-{i + 1}: {ilo}" for i, ilo in enumerate(ilos) if ilo)
            course_data_parts.append(f"COURSE INTENDED LEARNING OUTCOMES (ILOs):\n{ilo_lines}")
        if week_topic:
            source = " › ".join(part for part in (section_label, subsection_label) if part)
            course_data_parts.append(
                f"WEEK {week_number} SYLLABUS TOPIC"
                + (f" (from {source})" if source else "")
                + f": {week_topic.strip()}"
            )
        if section_context and not brief:
            course_data_parts.append(
                "SYLLABUS SECTION CONTENT"
                + (f" — {section_label}" if section_label else "")
                + (f" › {subsection_label}" if subsection_label else "")
                + f":\n{section_context.strip()}"
            )
        neighbor_lines = [str(item).strip() for item in (neighbor_titles or []) if str(item).strip()]
        if neighbor_lines:
            course_data_parts.append(
                "Nearby topics. Do not repeat them:\n"
                + "\n".join(f"- {title}" for title in neighbor_lines[:2])
            )

        course_context_block = (
            "\n\nCOURSE DATA (authoritative — ground all content here):\n"
            + "\n\n".join(course_data_parts)
        ) if course_data_parts else ""

        # Build the ILO alignment step text
        if ilos:
            ilo_step = (
                "\nStep 2 — Review the Course ILOs in COURSE DATA. "
                "Map each learning objective you write to one or more of those ILOs. "
                "Put only those ILO numbers in ilo_refs."
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

        user = f"""{source_heading}:
{context}{course_context_block}

TASK: Generate a complete, ready-to-deliver teaching module as strict JSON.

Course       : {course_name}
Module Number: {module_number}
Module Title : {module_title}
Week Number  : {week_number}{extra}
Depth        : {level['label']} — {level['hint']}

Write the JSON now. Do not write a plan first.

Step 1 — Analyse the reference material and COURSE DATA above to identify the core \
concepts specific to "{module_title}" in {course_name}.{ilo_step}
Step 3 — Write a 2-3 sentence introduction that places this module in the context of \
{course_name}. Be specific — do NOT use generic filler.
{step4}
{step5}
{outline_block}
OUTPUT RULES:
- Respond with ONLY valid JSON — no markdown, no preamble, no text outside the braces.
- Every string value must be specific to {course_name} and "{module_title}".
- Replace every "..." in the template below with real content.
{subtopic_rule}

{{
  "module_number": {module_number},
  "module_title": {json.dumps(module_title)},
  "introduction": "...",
  "learning_objectives": [
    "...",
    "...",
    "..."
  ],
  "ilo_refs": [1],
  "subtopics": [
{subtopic_json}
  ],
  "short_activity": {{
    "title": {activity_json},
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
        existing_block = (
            f"EXISTING CONTENT TO EXPAND:\n{existing_content}" if existing_content else ""
        )

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

{existing_block}

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

    # Per-section content hints. Weeks are not a model call.
    _SECTION_HINTS = {
        'rationale': (
            "Course Rationale and Description for {course_name}. "
            "2–3 sentences, one field. One idea per sentence. "
            "Do not also emit a separate description. No second paragraph, no tool catalog, no week list."
        ),
        'tlas': (
            "Using only these criteria: {criteria}. For each one, write one clause on how it is taught "
            "and how it is assessed. Do not add a component. Do not restate the rationale."
        ),
        'ilo': (
            "One short sentence for {course_name}. One Bloom verb. No second clause. "
            "Do not write \"students should be able to\"."
        ),
        'topics': (
            "Topics / Reading List for {course_name}. First line is the topic title. "
            "A one-week topic is that title plus one indented subtopic. No activity. "
            "A two-week topic is 1 to 3 topic titles, each with 1 or 2 indented subtopics, "
            "then a blank line and one activity title. Only one activity. "
            "Titles only. No sentences."
        ),
        'topic_outcome': (
            "One brief sentence. One imperative verb. No second sentence."
        ),
        'topic_map': (
            "Map each topic to one ILO number and one SO number."
        ),
        'week_plan': (
            "Weekly topic plan for {course_name}. One line per content topic. "
            "Do not include Class Orientation. Do not include the final examination. "
            "Each line is 1 or 2, then a tab, then the topic title. "
            "1 is one week. 2 is a heavier topic that merges two weeks. "
            "The numbers must add up to 17. Week 18 is not a topic. "
            "The first content topic is still week 1. "
            "Titles only. No sentences. Do not write week numbers or the word weeks. "
            "Plain text only. Do not use vertical bars or markdown."
        ),
        'contact': (
            "Do not generate. Criteria for Assessment is entered by the faculty."
        ),
        'assessment_map': (
            "Do not generate. Criteria for Assessment is faculty input. Do not design an assessment plan."
        ),
        'references': (
            "One APA-like reference line for {course_name}. 12–22 words. No annotation."
        ),
        'attributes': (
            "Do not generate. Institutional Graduate Attributes, Student Outcomes, CDIO skills, "
            "SDG skills, and the mapping sentences are stored and inserted."
        ),
        'policies': (
            "Do not generate. Grading scale, class policy, missed examinations, academic dishonesty, "
            "dropping, and remarks are stored and inserted."
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
        extra_instructions: str = "",
        course_category: str = "professional",
        assessment_criteria: str = "",
        course_brief: str = "",
    ) -> tuple:
        """
        Build a prompt to generate or continue a single syllabus field.

        Args:
            course_name:      Full course title.
            course_code:      Course code (may be empty).
            field_label:      Human-readable label for the field (shown in footer).
            section:          Syllabus section key (e.g. 'tlas', 'ilo', 'topics').
            existing_content: Current value of the field (used for 'continue' mode).
            mode:             'generate' (fresh) or 'continue' (extend existing).
            context_chunks:   RAG chunks (global + course-specific).
            context_summary:  Pre-computed progressive summary (token-efficient).
            course_category:  Stored category: ged, common, professional, or mandated.
            assessment_criteria: Faculty Criteria for Assessment. Required for tlas.

        Returns:
            (system_prompt: str, user_prompt: str)
        """
        context = cls._format_context(context_chunks, context_summary)
        stored_category, kind = syllabus_course_kind(course_name, course_code, course_category)
        criteria = _criteria_lines(assessment_criteria)
        hint_template = cls._SECTION_HINTS.get(
            section,
            "Write only this field for {course_name}, at the length given, "
            "and do not add a section that was not requested.",
        )
        hint = (
            hint_template
            .replace("{course_name}", course_name)
            .replace("{criteria}", criteria)
        )
        if section == "week_plan" and kind == "internship":
            hint = (
                f"Requirement plan for {course_name}. One line per requirement, "
                "not one row per calendar week. Do not include Class Orientation. Do not emit 18 lines. "
                "Each line is 1 or 2, then a tab, then the requirement title. "
                "1 is one block. 2 is a heavier block. Titles only. No sentences."
            )
        field_line = _category_field_line(kind, section)
        subject = f"\n\nSubject matter:\n{field_line}" if field_line else ""
        verbs = _ILO_VERBS.get(kind, _ILO_VERBS["professional"])
        brief = (course_brief or "").strip()
        brief_block = f"Course brief:\n{brief}\n\n" if brief else ""

        if section == "week_plan":
            system = (
                "You write the topic titles for a university course. "
                "Reply with the plan only. Do not repeat these instructions."
            )
            user = (
                f"Course: {course_name}\n"
                f"Course code: {course_code or 'N/A'}\n\n"
                f"{brief_block}"
                f"{hint}\n"
            )
            if extra_instructions:
                user += f"\n{extra_instructions}\n"
            return system, user

        if section == "ilo":
            system = (
                "You write one intended learning outcome for a university course. "
                "Reply with that sentence only. Do not repeat the instructions, "
                "the word count, or the verb list."
            )
            user = (
                f"Course: {course_name}\n"
                f"Course code: {course_code or 'N/A'}\n\n"
                f"Write one intended learning outcome for this course.\n"
                f"Start with one verb from this list: {verbs}.\n"
                "One clause. 8–16 words. One period.\n"
                "Do not write \"students should be able to\".\n"
                "Do not mention these rules. Do not copy the shape example.\n\n"
                "Shape only, from a different course: Analyze network logs using a standard method.\n"
                f"Outcome for {course_name}:"
            )
            if extra_instructions:
                user += f"\n\n{extra_instructions}"
            return system, user

        if section == "topics":
            system = (
                "You write one Topics / Reading List cell for a university course. "
                "Reply with titles only. No sentences. Do not repeat these instructions."
            )
            user = (
                f"Course: {course_name}\n"
                f"Course code: {course_code or 'N/A'}\n\n"
                f"{brief_block}"
                "A one-week topic is the topic title, then one indented subtopic. No activity.\n"
                "A two-week topic is 1 to 3 topic titles. Under each title, indent 1 or 2 subtopic titles. "
                "Then a blank line and one activity title for the whole cell. Only one activity.\n"
                "Do not put an activity on a one-week topic.\n"
                "First line is the topic title. Titles only. No sentences. Do not write week numbers.\n"
                "Plain text only. Do not use vertical bars, asterisks, hashes, bullets, or numbering.\n"
            )
            if extra_instructions:
                user += f"\n{extra_instructions}\n"
            user += f"\nTopics for {course_name}:"
            return system, user

        if section == "topic_outcome":
            system = (
                "You write one topic outcome for a university course. "
                "Reply with that sentence only. Do not repeat the instructions, "
                "the word count, or the field name."
            )
            user = (
                f"Course: {course_name}\n"
                f"Course code: {course_code or 'N/A'}\n\n"
                f"{brief_block}"
                "Write what the student does with this topic.\n"
                "Start with an imperative verb. One clause. 7–12 words. One period.\n"
                "Plain text. No markdown, vertical bars, or other symbols.\n"
                "Do not mention these rules. Do not copy the shape example.\n\n"
                "Shape only, from a different course: Compare two sorting methods on a small data set.\n"
                f"Outcome for {course_name}:"
            )
            if extra_instructions:
                user += f"\n\n{extra_instructions}"
            return system, user

        if section == "topic_map":
            system = (
                "You map each course topic to one intended learning outcome and one student outcome. "
                "Reply with one line per topic, in the same order. "
                "Each line is the ILO number, a tab, and the SO number. Digits only. No words."
            )
            user = (
                f"Course: {course_name}\n"
                f"Course code: {course_code or 'N/A'}\n\n"
                f"{extra_instructions}\n\n"
                "One line per topic. ILO number, tab, SO number. Use only the numbers listed above."
            )
            return system, user

        if section == "framework_columns":
            system = (
                "You choose stored framework numbers that align with this course. "
                "Reply with four lines only. Do not write framework statements."
            )
            user = (
                f"Course: {course_name}\n"
                f"Course code: {course_code or 'N/A'}\n\n"
                f"{extra_instructions}\n\n"
                "Read the framework statements, the intended learning outcomes, and the topics.\n"
                "Choose the numbers whose statements align with those outcomes and topics.\n"
                "Use only numbers from the lists above. Write none when a group does not align.\n"
                "Do not write the statements again.\n\n"
                "SO: n, n\n"
                "IGA: n\n"
                "CDIO: n, n\n"
                "SDG: none"
            )
            return system, user

        system = (
            "You are an expert curriculum designer at a Philippine university following "
            "Outcome-Based Education (OBE). Write only the field requested, at the length given, "
            "and do not add a section that was not requested. "
            "Return ONLY the requested content — no headers, no explanations, no markdown fences. "
            + _SYLLABUS_SHAPE + " " + _SYLLABUS_DO_NOT_GENERATE
        )

        if mode == "continue":
            user = (
                f"REFERENCE MATERIAL:\n{context}\n\n"
                f"Course category: {stored_category}{subject}\n\n"
                f'TASK: Continue the "{field_label}" field of "{course_name}" '
                f'({course_code or "N/A"}).\n\n'
                f"Limit: {hint}\n\n"
                f"EXISTING CONTENT:\n{existing_content}\n\n"
                "Continue from where the text leaves off. Do not repeat what is already written. "
                "Stay inside the limit. Do not add a header or prefix. Output only the continuation text."
            )
        else:
            user = (
                f"REFERENCE MATERIAL:\n{context}\n\n"
                f"Course category: {stored_category}{subject}\n\n"
                f"TASK: {hint}\n\n"
                f"Course       : {course_name}\n"
                f"Course Code  : {course_code or 'N/A'}\n"
                f"Field to populate: {field_label}\n\n"
                "Output only the field content — no headers, no explanations, no extra commentary."
            )

        if extra_instructions:
            user += f"\n\nAdditional instructions:\n{extra_instructions}"

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

    @staticmethod
    def build_syllabus_segment_prompt(extracted_text: str) -> tuple:
        """
        Build a prompt to segment raw syllabus text into 10 raw section blocks.
        """
        system = (
            "You are an expert document pre-processor. Your task is to analyze the provided university "
            "syllabus text and partition it into 10 distinct sections based on headers, content, and context. "
            "Do NOT summarize, modify, or parse the text into structured JSON fields. Simply copy the "
            "exact, relevant raw lines of text belonging to each section. "
            "Return ONLY a valid JSON object mapping the 10 keys to their corresponding raw text segments. "
            "Do not include markdown fences, comments, or extra text."
        )

        schema = (
            "{\n"
            '  "header": "Raw text block containing Header & Institutional Info (university name, college, program, document title)",\n'
            '  "direction": "Raw text block containing University vision and mission statements",\n'
            '  "specs": "Raw text block containing Course Specifications (course title, code, category, prerequisites, semester/year, credit hours, instructor name, contact, education, CMO reference, preparation details, period of study)",\n'
            '  "overview": "Raw text block containing Course Overview (course description, course rationale, lecture/lab/total hours, technology integration)",\n'
            '  "strategies": "Raw text block containing Assessment & Strategies (assessment criteria, teaching, learning and assessment strategies (TLAs))",\n'
            '  "outcomes": "Raw text block containing Expected Outcomes (ILOs, Bloom levels/verbs, assessment tasks/weight/subs, Table of Specifications (TOS))",\n'
            '  "references": "Raw text block containing References & Frameworks (references list, IGAs, Student Outcomes (SOs), CDIO skills, SDG skills)",\n'
            '  "policies": "Raw text block containing Course Policies (grading rows/scale, passing grade, class policies, other policies)",\n'
            '  "tla_activities": "Raw text block containing TLA Activities (the weekly timetable/topics/outcomes/ILO-SO mapping table)",\n'
            '  "schedules": "Raw text block containing Schedules & Mappings (assessment schedule grid, ILO-SO/CPA/IGA/CDIO/SDG mappings)"\n'
            "}"
        )

        user = (
            "Segment the following syllabus text into the 10 categories. "
            "If a category/section is not found in the text, map it to an empty string. "
            "Do not parse or alter any sentences or tables, just copy the raw text segments exactly as is.\n\n"
            f"SYLLABUS TEXT:\n{extracted_text}\n\n"
            f"Return a valid JSON object matching this schema:\n{schema}"
        )

        return system, user

    @staticmethod
    def build_syllabus_section_prompt(
        section_key: str,
        segment_text: str,
        course_name: str,
        course_code: str,
    ) -> tuple:
        """
        Build a prompt to parse a single raw segment into its corresponding section JSON schema.
        """
        matrix_keys = {'iloatmatrix', 'ilofwmatrix', 'fwmap', 'tos', 'schedule'}
        matrix_rule = ''
        if section_key in matrix_keys:
            matrix_rule = (
                ' Rows are already extracted and separated with " | ". Copy the cell text into the JSON. '
                'Do not invent rows, and do not paraphrase a cell.'
            )
        system = (
            f"You are an expert parser specializing in BatStateU Course Information Syllabus (CIS) documents. "
            f"Your task is to parse the raw text segment for the '{section_key}' section into the exact JSON schema requested. "
            f"Copy the complete text into the fields. Keep every sentence and every table row. Do not summarize, shorten, or omit.{matrix_rule} "
            f"Return ONLY a valid JSON object. No markdown fences, no comments, no extra text."
        )

        schemas = {
            "header": (
                "{\n"
                '  "university_name": "full university name (e.g. Republic of the Philippines, Batangas State University)",\n'
                '  "college": "college / department name (e.g. College of Informatics and Computing Sciences)",\n'
                '  "program": "campus or branch name (e.g. Lipa Campus or Lipa City)",\n'
                '  "document_title": "physical address of the campus if found, or empty string",\n'
                '  "institution_contact": "contact details (email/phone) of the department / institution"\n'
                "}"
            ),
            "direction": (
                "{\n"
                '  "vision": "full vision statement text",\n'
                '  "mission": "full mission statement text"\n'
                "}"
            ),
            "specs": (
                "{\n"
                '  "course_title": "full course title",\n'
                '  "course_code": "e.g. COSC 101",\n'
                '  "course_category": "e.g. Major, Core, GE",\n'
                '  "prerequisites": "prerequisite courses or None",\n'
                '  "year_level": "e.g. 1st Year, 2nd Year, etc. or empty string",\n'
                '  "semester_year": "e.g. 1st Semester AY 2024-2025",\n'
                '  "credit_hours": "e.g. 3",\n'
                '  "instructor_name": "instructor full name",\n'
                '  "employee_id": "instructor employee ID or empty string",\n'
                '  "instructor_email": "instructor email or empty string",\n'
                '  "contact_info": "email / phone / room",\n'
                '  "education": "instructor educational background",\n'
                '  "institution_contact": "institutional contact details or empty string",\n'
                '  "reference_cmo": "CMO number if present",\n'
                '  "date_prepared": "date prepared string",\n'
                '  "revision_no": "revision number",\n'
                '  "revision_date": "revision date string",\n'
                '  "period_of_study": "period of study string"\n'
                "}"
            ),
            "overview": (
                "{\n"
                '  "description": "full course description paragraph(s)",\n'
                '  "rationale": "standalone rationale paragraph explaining WHY this course exists in the program",\n'
                '  "lecture_hours": "number of lecture hours per week",\n'
                '  "lab_hours": "number of lab/laboratory hours per week",\n'
                '  "total_hours": "total contact hours or empty string",\n'
                '  "technology_integration": "technology integration description or empty string"\n'
                "}"
            ),
            "strategies": (
                "{\n"
                '  "assessment_criteria": "full criteria for assessment text",\n'
                '  "tlas": "full teaching, learning, and assessment strategies description"\n'
                "}"
            ),
            "outcomes": (
                "{\n"
                '  "ilos": ["ILO 1 text", "ILO 2 text", "..."],\n'
                '  "ilo_bloom": [{"level": "Apply", "verb": "implement"}],\n'
                '  "assessment_tasks": [{"code": "ME", "task": "Major Examinations", "ird": "I", "category": "Summative", "weight": "60", "ilo_values": ["ME", "", ""], "subs": [], "c": "ME", "p": "", "a": ""}],\n'
                '  "ats": [\n'
                '    {\n'
                '      "code": "C1",\n'
                '      "label": "Assessment Component Label (e.g. Major Examinations, Class Participation)",\n'
                '      "weight": 60,\n'
                '      "subs": [\n'
                '        {\n'
                '          "code": "T1",\n'
                '          "label": "Assessment Task Label (e.g. Midterm Examination)",\n'
                '          "weight": 30,\n'
                '          "ilos": ["ILO1"],\n'
                '          "scores": {"ILO1": 30},\n'
                '          "iloTotals": {"ILO1": 30}\n'
                '        }\n'
                '      ]\n'
                '    }\n'
                '  ],\n'
                '  "tos": [{"topic": "Module 1: Introduction", "total_points": "20", "bloom_dist": {"remember": "20", "understand": "30", "apply": "30", "analyze": "20", "evaluate": "0", "create": "0"}}]\n'
                "}"
            ),
            "references": (
                "{\n"
                '  "references": ["full citation string 1", "full citation string 2"],\n'
                '  "igas": [{"code": "IGA1", "title": "attribute title", "description": "full description"}],\n'
                '  "student_outcomes": [{"code": "SO1", "title": "outcome title", "description": "full description"}],\n'
                '  "cdio_skills": [{"code": "CDIO1", "title": "skill title", "description": "full description"}],\n'
                '  "sdg_skills": [{"code": "SDG1", "title": "skill title", "description": "full description"}]\n'
                "}"
            ),
            "policies": (
                "{\n"
                '  "grading_rows": [],\n'
                '  "passing_grade": null,\n'
                '  "use_plus_minus": false,\n'
                '  "remedial_enabled": true,\n'
                '  "round_grades": false,\n'
                '  "policies": [{"title": "Class Policies", "content": "full policy text"}],\n'
                '  "other_policies": "any additional course policies or requirements"\n'
                "}"
            ),
            "tla_activities": (
                "{\n"
                '  "tla_chapters": [{"chapter": "1", "topics": "Topic / Reading List text", "weeks": "2-3", "outcomes": "outcome text", "ilo": "1, 2", "ilo_refs": [1, 2], "so": "1, 2", "delivery": "Lecture, Hands-on Laboratory"}]\n'
                "}"
            ),
            "schedules": (
                "{\n"
                '  "schedule_methods": [{"name": "Major Examinations", "values": ["", "", "60", "", "", "", "60", "", "", "", "", "", "", "", "80", ""]}],\n'
                '  "so_headers": ["2", "3", "5"],\n'
                '  "so_cpa_rows": [{"so_vals": ["ME, LA", "", ""], "c": "ME", "p": "ME, LA", "a": ""}],\n'
                '  "iga_headers": ["3", "6"],\n'
                '  "iga_rows": [{"vals": ["ME, LA, FP", ""]}],\n'
                '  "cdio_headers": ["3", "4"],\n'
                '  "sdg_headers": ["2", "5"],\n'
                '  "cdio_sdg_rows": [{"cdio_vals": ["", "ME, LA, FP"], "sdg_vals": ["ME, LA, FP", ""]}]\n'
                "}"
            ),
            "basic": (
                "{\n"
                '  "university_name": "",\n'
                '  "college": "",\n'
                '  "program": "",\n'
                '  "document_title": "",\n'
                '  "institution_contact": "",\n'
                '  "vision": "",\n'
                '  "mission": "",\n'
                '  "course_title": "",\n'
                '  "course_code": "",\n'
                '  "course_category": "",\n'
                '  "prerequisites": "",\n'
                '  "year_level": "",\n'
                '  "semester_year": "",\n'
                '  "credit_hours": "",\n'
                '  "instructor_name": "",\n'
                '  "employee_id": "",\n'
                '  "instructor_email": "",\n'
                '  "contact_info": "",\n'
                '  "education": "",\n'
                '  "reference_cmo": "",\n'
                '  "date_prepared": "",\n'
                '  "revision_no": "",\n'
                '  "revision_date": "",\n'
                '  "period_of_study": ""\n'
                "}"
            ),
            "details": (
                "{\n"
                '  "description": "",\n'
                '  "rationale": "",\n'
                '  "lecture_hours": "",\n'
                '  "lab_hours": "",\n'
                '  "total_hours": "",\n'
                '  "technology_integration": "",\n'
                '  "tlas": "",\n'
                '  "assessment_criteria": "",\n'
                '  "references": ["citation"]\n'
                "}"
            ),
            "iloat": (
                "{\n"
                '  "ilos": ["ILO text"],\n'
                '  "ilo_bloom": [{"level": "Apply", "verb": "implement"}],\n'
                '  "assessment_tasks": [{"code": "ME", "task": "Major Examinations", "ird": "I", "category": "Summative", "weight": "60", "ilo_values": ["ME"], "subs": [], "c": "", "p": "", "a": ""}],\n'
                '  "ats": [{"code": "C1", "label": "Major Examinations", "weight": 60, "subs": [{"code": "T1", "label": "Midterm", "weight": 30, "ilos": ["ILO1"], "scores": {}, "iloTotals": {}}]}]\n'
                "}"
            ),
            "iloatmatrix": (
                "{\n"
                '  "ats": [{"code": "C1", "label": "Major Examinations", "weight": 60, "subs": [{"code": "T1", "label": "Midterm", "weight": 30, "ilos": ["ILO1"], "scores": {}, "iloTotals": {}}]}]\n'
                "}"
            ),
            "fwmap": (
                "{\n"
                '  "references": ["citation"],\n'
                '  "igas": [{"code": "IGA1", "title": "", "description": ""}],\n'
                '  "student_outcomes": [{"code": "SO1", "title": "", "description": ""}],\n'
                '  "cdio_skills": [{"code": "CDIO1", "title": "", "description": ""}],\n'
                '  "sdg_skills": [{"code": "SDG1", "title": "", "description": ""}],\n'
                '  "so_headers": ["1"],\n'
                '  "so_cpa_rows": [{"so_vals": ["ME"], "c": "", "p": "", "a": ""}],\n'
                '  "iga_headers": ["1"],\n'
                '  "iga_rows": [{"vals": ["ME"]}],\n'
                '  "cdio_headers": ["1"],\n'
                '  "sdg_headers": ["1"],\n'
                '  "cdio_sdg_rows": [{"cdio_vals": [""], "sdg_vals": [""]}]\n'
                "}"
            ),
            "ilofwmatrix": (
                "{\n"
                '  "so_headers": ["1"],\n'
                '  "so_cpa_rows": [{"so_vals": ["ME"], "c": "", "p": "", "a": ""}],\n'
                '  "iga_headers": ["1"],\n'
                '  "iga_rows": [{"vals": ["ME"]}],\n'
                '  "cdio_headers": ["1"],\n'
                '  "sdg_headers": ["1"],\n'
                '  "cdio_sdg_rows": [{"cdio_vals": [""], "sdg_vals": [""]}]\n'
                "}"
            ),
            "schedule": (
                "{\n"
                '  "tla_chapters": [{"chapter": "1", "topics": "", "weeks": "1", "outcomes": "", "ilo": "1", "ilo_refs": [1], "so": "", "delivery": ""}],\n'
                '  "schedule_methods": [{"name": "Major Examinations", "values": ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]}]\n'
                "}"
            ),
            "tos": (
                "{\n"
                '  "tos": [{"examLabel": "Prelim Examination", "topics": [{"topic": "", "hours_class": "", "bloom_pct": {"remember": "", "understand": "", "apply": "", "analyze": "", "evaluate": "", "create": ""}}]}]\n'
                "}"
            ),
            "grading": (
                "{\n"
                '  "grading_rows": [{"rating": "Excellent", "grade": "1.00", "range": "98 - 100"}],\n'
                '  "passing_grade": 75\n'
                "}"
            ),
        }

        section_instructions = {
            "policies": (
                "Fill policies and other_policies from this text. "
                "Leave grading_rows as an empty list unless this text itself is a grade scale."
            ),
            "header": (
                "CRITICAL MAPPING INSTRUCTIONS FOR HEADER:\n"
                "- Extract the full university name (e.g. Batangas State University) into 'university_name'.\n"
                "- Extract the college or department name (e.g. College of Informatics and Computing Sciences) into 'college'.\n"
                "- Extract the campus or branch name (e.g. Lipa Campus) into 'program'. This maps directly to the UI's Campus/Branch field.\n"
                "- Extract the physical address of the institution into 'document_title'. This maps directly to the UI's Address field.\n"
                "- Extract institutional or department contact info (phone/email) into 'institution_contact'."
            ),
            "outcomes": (
                "CRITICAL MAPPING INSTRUCTIONS FOR OUTCOMES:\n"
                "- For 'ilos', extract each course learning outcome as a list of strings.\n"
                "- For 'ilo_bloom', construct a parallel array mapping each ILO to its Bloom's Level and Verb.\n"
                "- For 'assessment_tasks', extract summative, project, and formative tasks.\n"
                "- For 'ats' (Assessment Components), extract all component categories (e.g., Major Examinations, Class Participation) "
                "with their overall weights (integer percentages), and for each component, list its sub-tasks in 'subs' with their "
                "individual weights, mapped ILOs (e.g., ['ILO1']), scores, and iloTotals."
            )
        }

        section_schema = schemas.get(section_key, "{}")
        instruction_text = section_instructions.get(section_key, "")

        if instruction_text:
            user = (
                f"Parse this '{section_key}' raw syllabus text segment for the course: {course_name} ({course_code or 'N/A'}).\n\n"
                f"{instruction_text}\n\n"
                f"RAW TEXT SEGMENT:\n{segment_text}\n\n"
                f"Return a valid JSON object matching this schema exactly:\n{section_schema}"
            )
        else:
            user = (
                f"Parse this '{section_key}' raw syllabus text segment for the course: {course_name} ({course_code or 'N/A'}).\n\n"
                f"RAW TEXT SEGMENT:\n{segment_text}\n\n"
                f"Return a valid JSON object matching this schema exactly:\n{section_schema}"
            )

        return system, user
