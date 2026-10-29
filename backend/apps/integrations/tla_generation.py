"""Batched Teaching, Learning, and Assessment generation.

One course brief is shared by the plan and the row batches. Week numbers,
ILO and SO indexes, and delivery are not given that brief: the indexes are
a short digit map, and the week numbers are assigned in code.
"""
import json
import re

TLA_BATCH = 5


def build_tla_rows_prompt(course_name, course_code, course_brief, rows, neighbors):
    """One JSON reply for up to five topic rows, plus the rows beside them."""
    system = (
        "You write Topics / Reading List cells and one topic outcome per row. "
        "Reply with JSON only. No markdown."
    )
    lines = [
        f"Course: {course_name}",
        f"Course code: {course_code or 'N/A'}",
        "",
        "Course brief:",
        (course_brief or "").strip() or "(No course brief.)",
        "",
    ]
    beside = [item for item in (neighbors or []) if str(item.get("title") or "").strip()]
    if beside:
        lines.append("Nearby topics. Do not repeat them:")
        for item in beside[:2]:
            lines.append(f"- {item.get('weeks') or ''} {item.get('title') or ''}".strip())
        lines.append("")
    lines.append("Write these rows, in this order.")
    for index, row in enumerate(rows, 1):
        weeks = str(row.get("weeks") or "").strip()
        title = str(row.get("title") or "").strip()
        span = int(row.get("span") or 1)
        if span >= 2:
            shape = (
                "Two weeks. 1 to 3 topic titles. Under each, indent 1 or 2 subtopics "
                "with five spaces. Then a blank line and one activity title."
            )
        else:
            shape = "One week. The topic title, then one indented subtopic. No activity."
        lines.append(f"{index}. Weeks {weeks}. Title: {title or 'continue the sequence'}. {shape}")
    lines.append("")
    lines.append(
        "Topics are titles only. No sentences, week numbers, vertical bars, or markdown. "
        "Each outcome is one sentence, one imperative verb, 7 to 12 words."
    )
    lines.append('Return {"rows":[{"topics":"...","outcome":"..."}]} with one object per row, in order.')
    return system, "\n".join(lines)


def parse_tla_rows(text, count):
    """Pull ``count`` topic/outcome pairs out of a JSON reply."""
    raw = str(text or "").strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw).strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start < 0 or end < start:
        start = raw.find("[")
        end = raw.rfind("]")
    if start < 0 or end < start:
        return []
    try:
        payload = json.loads(raw[start:end + 1])
    except json.JSONDecodeError:
        return []
    items = payload.get("rows") if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        return []
    rows = []
    for item in items:
        if not isinstance(item, dict):
            continue
        topics = str(item.get("topics") or "").strip()
        outcome = str(item.get("outcome") or "").strip()
        if topics or outcome:
            rows.append({"topics": topics, "outcome": outcome})
    return rows[:count]


def module_max_tokens(subtopic_count):
    """Room for one chapter's JSON. Reasoning tokens share this budget, so it stays large enough to finish."""
    count = max(1, int(subtopic_count or 1))
    return min(2048, max(1800, 1000 + 160 * count))


def assessment_batch_max_tokens(item_count):
    """Completion room for a short multiple-choice batch.

    Groq's free tier allows about 8,000 tokens per request and per minute.
    OpenRouter's free tier is 50 requests a day, so one batch call replaces
    a call per item. The reply is a few short JSON objects, not a chapter.
    """
    count = max(1, int(item_count or 1))
    return min(1200, max(480, 160 * count))


def map_max_tokens(row_count):
    """Digit lines only. A single index is a handful of tokens; a table is still small."""
    count = max(1, int(row_count or 1))
    return min(96, max(16, count * 8))
