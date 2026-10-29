"""One course brief per course and document set.

Retrieval runs once. The passages are distilled into a short brief and cached,
so the next faculty member generating the same course does not pay for search
or for another distillation.
"""
import hashlib
import logging

from django.core.cache import cache

from apps.integrations.cot_prompt_builder import complete_syllabus_field
from apps.integrations.models import CourseFile
from apps.integrations.rag_service import generation_reference

logger = logging.getLogger(__name__)

BRIEF_TTL_SECONDS = 60 * 60 * 24 * 7
_PASSAGE_LIMIT = 8
_CHILD_CHARS = 500
_PARENT_CHARS = 400


def document_stamp(course, selected_doc_ids) -> str:
    """Identity of the completed uploads this brief was built from."""
    qs = CourseFile.objects.filter(course_id=course.course_id, rag_status="COMPLETED")
    if selected_doc_ids:
        qs = qs.filter(records_id__in=list(selected_doc_ids))
    rows = qs.order_by("records_id").values_list("records_id", "created_at")
    parts = [
        f"{record_id}:{created.isoformat() if created else ''}"
        for record_id, created in rows
    ]
    return "|".join(parts) or "none"


def brief_cache_key(course_id, stamp: str) -> str:
    digest = hashlib.sha256(stamp.encode("utf-8")).hexdigest()[:20]
    return f"atlas:course-brief:v1:{course_id}:{digest}"


def _clip(text, limit):
    body = " ".join(str(text or "").split())
    if len(body) <= limit:
        return body
    return body[: limit - 1].rstrip() + "…"


def _passages(chunks) -> str:
    blocks = []
    for index, chunk in enumerate((chunks or [])[:_PASSAGE_LIMIT], 1):
        child = _clip(chunk.get("text"), _CHILD_CHARS)
        parent = _clip(chunk.get("parent_text"), _PARENT_CHARS)
        if parent and parent != child:
            body = f"{child}\n{parent}"
        else:
            body = child or parent
        if body:
            blocks.append(f"[{index}] {body}")
    return "\n\n".join(blocks)


def _fallback_brief(course) -> str:
    title = getattr(course, "course_title", "") or "Course"
    code = getattr(course, "course_code", "") or ""
    label = f"{code} {title}".strip()
    return f"Course: {label}. No uploaded course passages were available."


def get_course_brief(course, *, institution_id, selected_doc_ids, llm, provider=None) -> tuple[str, bool]:
    """Return ``(brief, cache_hit)``. A hit does not search or call the model."""
    stamp = document_stamp(course, selected_doc_ids)
    key = brief_cache_key(course.course_id, stamp)
    cached = cache.get(key)
    if isinstance(cached, str) and cached.strip():
        return cached.strip(), True

    reference = generation_reference(
        f"{getattr(course, 'course_code', '')} {getattr(course, 'course_title', '')} outcomes topics assessment",
        course=course,
        institution_id=institution_id,
        top_k=6,
        selected_doc_ids=selected_doc_ids or None,
    )
    passages = _passages(reference.get("source_chunks"))
    if not passages:
        brief = _fallback_brief(course)
        cache.set(key, brief, BRIEF_TTL_SECONDS)
        return brief, False

    title = getattr(course, "course_title", "") or "Course"
    code = getattr(course, "course_code", "") or "N/A"
    system = (
        "You compress course source passages into one course brief. "
        "Reply with the brief only."
    )
    user = (
        f"Course: {title}\n"
        f"Course code: {code}\n\n"
        f"Passages:\n{passages}\n\n"
        "Write 400 to 800 tokens of plain text. Include only:\n"
        "- the course title and code\n"
        "- program outcomes named in the passages\n"
        "- the topic list\n"
        "- the assessment scheme\n"
        "Do not add a section that is not in the passages."
    )
    try:
        text, _provider = complete_syllabus_field(
            llm,
            section="tla_brief",
            messages=[{"role": "user", "content": user}],
            system=system,
            preferred_provider=provider,
            max_tokens=700,
        )
        brief = " ".join(str(text or "").split())
    except Exception:
        logger.exception("Course brief distillation failed for %s", code)
        brief = ""
    if len(brief) < 40:
        brief = _fallback_brief(course)
    elif len(brief) > 3600:
        brief = brief[:3599].rstrip() + "…"
    cache.set(key, brief, BRIEF_TTL_SECONDS)
    return brief, False
