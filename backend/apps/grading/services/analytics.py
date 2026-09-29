"""
Descriptive analytics over bubble-sheet scans, grouped through the `blocks` roster.

Item analysis follows the classical upper/lower 27% procedure used for
teacher-made tests:
  1. Score every paper and rank from highest to lowest.
  2. Take the upper 27% (U group) and lower 27% (L group); set aside the middle 46%.
  3. Per item, count correct answers in each group (U, L).
  4. Difficulty      P = (U + L) / 2n
  5. Discrimination  D = (U - L) / n
  6. Distractor analysis: every wrong option should attract >= 5% of examinees
     and more of the L group than the U group.
  7. Test reliability via KR-20 = k/(k-1) * (1 - sum(p*q) / variance_of_totals).
"""

from __future__ import annotations

import math
import re
from collections import defaultdict
from statistics import mean, median, pstdev

from django.db.models import Q

from apps.grading.models import BubbleSheetScan, BubbleSheetTemplate
from apps.integrations.models import AssessmentItem, Block

UNASSIGNED = "Unassigned"
DEFAULT_PASSING_PERCENT = 50.0
UPPER_LOWER_FRACTION = 0.27
FUNCTIONAL_DISTRACTOR_MIN = 0.05
MASTERY_THRESHOLD = 75.0
NEAR_MASTERY_THRESHOLD = 50.0

BLOOM_LEVELS = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"]
_BLOOM_PREFIXES = {
    "rem": "Remember",
    "kno": "Remember",
    "und": "Understand",
    "com": "Understand",
    "app": "Apply",
    "ana": "Analyze",
    "eva": "Evaluate",
    "cre": "Create",
    "syn": "Create",
}

SR_CODE_RE = re.compile(r"^\d{2}-\d{4,6}$")


def normalize_student_id(value) -> str:
    return str(value).strip() if value is not None else ""


def is_valid_student_id(value) -> bool:
    return bool(SR_CODE_RE.match(normalize_student_id(value)))


def normalize_bloom(value) -> str | None:
    text = str(value or "").strip().lower()
    return _BLOOM_PREFIXES.get(text[:3]) if text else None


def _to_float(value, default=None):
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _answer_key(template: BubbleSheetTemplate) -> dict[int, str]:
    key = {}
    for k, v in (template.answer_key or {}).items():
        try:
            key[int(k)] = str(v).strip().upper()[:1]
        except (TypeError, ValueError):
            continue
    return {k: v for k, v in key.items() if v}


def _response(responses: dict, item_no: int) -> str:
    raw = (responses or {}).get(str(item_no))
    if raw is None:
        raw = (responses or {}).get(f"{item_no:02d}")
    value = str(raw or "").strip().upper()[:1]
    return "" if value in ("", "?") else value


def item_metadata_by_assessment(assessment_ids) -> dict[str, dict[int, dict]]:
    """{assessment_id: {item_number: {"bloom": str|None, "question": str}}}"""
    out: dict[str, dict[int, dict]] = defaultdict(dict)
    if not assessment_ids:
        return out
    for item in AssessmentItem.objects.filter(assessment_id__in=assessment_ids):
        rubric = item.rubric if isinstance(item.rubric, dict) else {}
        try:
            number = int(rubric.get("item_number"))
        except (TypeError, ValueError):
            continue
        out[str(item.assessment_id)][number] = {
            "bloom": normalize_bloom(rubric.get("bloom_level")),
            "question": item.question_text or "",
        }
    return out


# ── Records ───────────────────────────────────────────────────────────────────


def latest_scans(templates) -> list[BubbleSheetScan]:
    """Latest scan per (template, student). Unidentified scans are kept individually."""
    latest: dict[tuple, BubbleSheetScan] = {}
    scans = (
        BubbleSheetScan.objects
        .filter(template__in=templates)
        .order_by("created_at")
    )
    for scan in scans:
        sid = normalize_student_id(scan.student_identifier)
        key = (scan.template_id, sid) if sid else (scan.template_id, str(scan.scan_id))
        latest[key] = scan
    return list(latest.values())


def blocks_for(student_ids) -> dict[str, Block]:
    ids = {normalize_student_id(s) for s in student_ids if normalize_student_id(s)}
    if not ids:
        return {}
    return {
        b.student_id: b
        for b in Block.objects.select_related("section").filter(student_id__in=ids)
    }


def block_grade(block) -> str:
    return (block.grade_level.strip() if block and block.grade_level else "") or UNASSIGNED


def block_section(block) -> str:
    return (block.section_name.strip() if block else "") or UNASSIGNED


def build_records(templates, identified_only=True) -> list[dict]:
    """One flat record per graded paper, enriched with block + passing info."""
    templates = list(templates)
    by_id = {t.template_id: t for t in templates}
    scans = latest_scans(templates)
    if identified_only:
        scans = [s for s in scans if is_valid_student_id(s.student_identifier)]
    blocks = blocks_for(s.student_identifier for s in scans)

    records = []
    for scan in scans:
        template = by_id[scan.template_id]
        sid = normalize_student_id(scan.student_identifier)
        block = blocks.get(sid)
        max_score = _to_float(scan.max_score) or float(template.total_items or 0)
        score_raw = _to_float(scan.score_raw, 0.0)
        percent = _to_float(scan.score_percent)
        if percent is None:
            percent = (score_raw / max_score * 100) if max_score else 0.0
        passing = _to_float(template.passing_score, DEFAULT_PASSING_PERCENT)
        records.append({
            "scan_id": str(scan.scan_id),
            "template": template,
            "student_id": sid,
            "identified": is_valid_student_id(sid),
            "grade_level": block_grade(block),
            "section": block_section(block),
            "score": score_raw,
            "max_score": max_score,
            "percent": round(percent, 2),
            "passing_percent": passing,
            "passed": percent >= passing,
            "flagged": bool(scan.is_flagged),
            "responses": scan.responses or {},
            "scanned_at": scan.created_at,
        })
    return records


def filter_records(records, grade_level=None, section=None):
    if grade_level:
        records = [r for r in records if r["grade_level"] == grade_level]
    if section:
        records = [r for r in records if r["section"] == section]
    return records


# ── Descriptive statistics ────────────────────────────────────────────────────


def summarize(records) -> dict:
    n = len(records)
    if not n:
        return {
            "count": 0, "passed": 0, "failed": 0, "pass_rate": None,
            "mean_percent": None, "median_percent": None, "sd_percent": None,
            "min_percent": None, "max_percent": None,
            "mean_score": None, "mean_max_score": None,
        }
    pcts = [r["percent"] for r in records]
    passed = sum(1 for r in records if r["passed"])
    return {
        "count": n,
        "passed": passed,
        "failed": n - passed,
        "pass_rate": round(passed / n * 100, 1),
        "mean_percent": round(mean(pcts), 1),
        "median_percent": round(median(pcts), 1),
        "sd_percent": round(pstdev(pcts), 1) if n > 1 else 0.0,
        "min_percent": round(min(pcts), 1),
        "max_percent": round(max(pcts), 1),
        "mean_score": round(mean(r["score"] for r in records), 2),
        "mean_max_score": round(mean(r["max_score"] for r in records), 2),
    }


def group_summaries(records, key_fn, label_fn, extra_fn=None) -> list[dict]:
    groups: dict[str, list] = defaultdict(list)
    for r in records:
        groups[key_fn(r)].append(r)
    out = []
    for key, rows in groups.items():
        row = {"key": key, "label": label_fn(rows[0]), **summarize(rows)}
        if extra_fn:
            row.update(extra_fn(rows[0]))
        out.append(row)
    out.sort(key=lambda g: (g["label"] == UNASSIGNED, g["label"].lower()))
    return out


def score_distribution(records, bucket_size=10) -> list[dict]:
    buckets = [
        {"from": lo, "to": min(lo + bucket_size, 100), "count": 0}
        for lo in range(0, 100, bucket_size)
    ]
    for r in records:
        idx = min(int(r["percent"] // bucket_size), len(buckets) - 1)
        buckets[max(idx, 0)]["count"] += 1
    return buckets


def _section_key(r):
    return r["section"]


def _course_key(r):
    return str(r["template"].course_id)


def _course_label(r):
    return r["template"].course.course_code


def _assessment_key(r):
    t = r["template"]
    return str(t.assessment_id or t.template_id)


def _assessment_label(r):
    t = r["template"]
    return t.assessment.title if t.assessment_id else t.name


# ── Bloom mastery ─────────────────────────────────────────────────────────────


def _empty_bloom():
    return {level: {"correct": 0, "attempts": 0} for level in BLOOM_LEVELS}


def _bloom_finalize(counts, item_counts=None) -> dict:
    out = {}
    for level in BLOOM_LEVELS:
        c = counts[level]
        mastery = round(c["correct"] / c["attempts"] * 100, 1) if c["attempts"] else None
        out[level] = {
            "correct": c["correct"],
            "attempts": c["attempts"],
            "mastery": mastery,
            "items": (item_counts or {}).get(level, 0),
        }
    return out


def bloom_mastery(records, item_meta) -> dict:
    """Mastery % per Bloom level = correct answers / attempts on items tagged with that level."""
    overall = _empty_bloom()
    items_per_level: dict[str, set] = defaultdict(set)
    grouped = {"section": defaultdict(_empty_bloom), "course": defaultdict(_empty_bloom),
               "assessment": defaultdict(_empty_bloom)}
    labels = {"section": {}, "course": {}, "assessment": {}}
    per_student: dict[str, dict] = defaultdict(_empty_bloom)
    untagged_items = set()

    for r in records:
        t = r["template"]
        key = _answer_key(t)
        meta = item_meta.get(str(t.assessment_id), {}) if t.assessment_id else {}
        group_keys = {
            "section": (_section_key(r), r["section"]),
            "course": (_course_key(r), _course_label(r)),
            "assessment": (_assessment_key(r), _assessment_label(r)),
        }
        for dim, (gk, gl) in group_keys.items():
            labels[dim][gk] = gl
        for item_no, correct_letter in key.items():
            level = (meta.get(item_no) or {}).get("bloom")
            if not level:
                untagged_items.add((t.template_id, item_no))
                continue
            items_per_level[level].add((t.template_id, item_no))
            hit = 1 if _response(r["responses"], item_no) == correct_letter else 0
            targets = [overall] + [grouped[dim][gk] for dim, (gk, _) in group_keys.items()]
            if r["identified"]:
                targets.append(per_student[r["student_id"]])
            for bucket in targets:
                bucket[level]["attempts"] += 1
                bucket[level]["correct"] += hit

    item_counts = {level: len(v) for level, v in items_per_level.items()}

    def dim_rows(dim):
        rows = [
            {"key": gk, "label": labels[dim][gk], "levels": _bloom_finalize(counts)}
            for gk, counts in grouped[dim].items()
        ]
        rows.sort(key=lambda g: (g["label"] == UNASSIGNED, g["label"].lower()))
        return rows

    students = []
    for sid, counts in per_student.items():
        levels = _bloom_finalize(counts)
        students.append({
            "student_id": sid,
            "levels": {lvl: v["mastery"] for lvl, v in levels.items()},
        })
    students.sort(key=lambda s: s["student_id"])

    return {
        "levels": BLOOM_LEVELS,
        "mastery_threshold": MASTERY_THRESHOLD,
        "near_mastery_threshold": NEAR_MASTERY_THRESHOLD,
        "overall": _bloom_finalize(overall, item_counts),
        "by_section": dim_rows("section"),
        "by_course": dim_rows("course"),
        "by_assessment": dim_rows("assessment"),
        "students": students,
        "tagged_items": sum(item_counts.values()),
        "untagged_items": len(untagged_items),
    }


# ── Item analysis ─────────────────────────────────────────────────────────────


def difficulty_label(p: float) -> str:
    if p >= 0.86:
        return "Very Easy"
    if p >= 0.71:
        return "Easy"
    if p >= 0.30:
        return "Moderate"
    if p >= 0.15:
        return "Difficult"
    return "Very Difficult"


def discrimination_label(d: float) -> str:
    if d < 0:
        return "Negative"
    if d >= 0.40:
        return "Very Good"
    if d >= 0.30:
        return "Good"
    if d >= 0.20:
        return "Marginal"
    return "Poor"


def item_decision(p: float, d: float) -> str:
    if d < 0:
        return "Discard"
    moderate = 0.30 <= p <= 0.70
    acceptable = 0.15 <= p <= 0.85
    if moderate and d >= 0.30:
        return "Retain"
    if acceptable and d >= 0.40:
        return "Retain"
    if not acceptable and d < 0.20:
        return "Discard"
    return "Revise"


def reliability_label(kr20: float | None) -> str:
    if kr20 is None:
        return "Not enough data"
    if kr20 >= 0.90:
        return "Excellent"
    if kr20 >= 0.80:
        return "Very Good"
    if kr20 >= 0.70:
        return "Good"
    if kr20 >= 0.60:
        return "Somewhat Low"
    if kr20 >= 0.50:
        return "Needs Revision"
    return "Questionable"


def item_analysis(records, template: BubbleSheetTemplate, item_meta: dict[int, dict] | None = None) -> dict:
    item_meta = item_meta or {}
    key = _answer_key(template)
    choices = [chr(ord("A") + i) for i in range(max(2, min(template.num_choices or 4, 5)))]
    records = [r for r in records if r["template"].template_id == template.template_id]
    n_total = len(records)

    base = {
        "template_id": str(template.template_id),
        "template_name": template.name,
        "choices": choices,
        "keyed_items": len(key),
    }
    if not key:
        return {**base, "available": False, "reason": "This exam has no answer key yet.", "items": []}
    if n_total < 2:
        return {**base, "available": False,
                "reason": "At least 2 scanned papers are needed for item analysis.", "items": []}

    item_numbers = sorted(key)
    # Step 1: score every paper against the key and rank highest → lowest.
    scored = []
    for r in records:
        marks = {i: (_response(r["responses"], i) == key[i]) for i in item_numbers}
        scored.append((sum(marks.values()), r, marks))
    scored.sort(key=lambda x: x[0], reverse=True)
    totals = [s[0] for s in scored]

    # Step 2: upper and lower 27% groups (never overlapping).
    n_group = max(1, int(round(n_total * UPPER_LOWER_FRACTION)))
    n_group = min(n_group, n_total // 2)
    upper = scored[:n_group]
    lower = scored[-n_group:]

    variance = pstdev(totals) ** 2 if n_total > 1 else 0.0
    mean_total = mean(totals)
    sd_total = math.sqrt(variance)

    items = []
    sum_pq = 0.0
    for i in item_numbers:
        correct_letter = key[i]
        # Step 3: tally correct answers per group.
        u = sum(1 for _, _, m in upper if m[i])
        l = sum(1 for _, _, m in lower if m[i])
        r_all = sum(1 for _, _, m in scored if m[i])
        # Steps 4–5: indices.
        p = (u + l) / (2 * n_group)
        d = (u - l) / n_group
        p_all = r_all / n_total
        sum_pq += p_all * (1 - p_all)

        point_biserial = None
        if sd_total > 0 and 0 < r_all < n_total:
            mean_correct = mean(t for t, _, m in scored if m[i])
            mean_wrong = mean(t for t, _, m in scored if not m[i])
            point_biserial = round(
                (mean_correct - mean_wrong) / sd_total * math.sqrt(p_all * (1 - p_all)), 3
            )

        # Step 6: distractor analysis.
        options = []
        issues = []
        for letter in choices + [""]:
            up = sum(1 for _, r, _ in upper if _response(r["responses"], i) == letter)
            lo = sum(1 for _, r, _ in lower if _response(r["responses"], i) == letter)
            total = sum(1 for _, r, _ in scored if _response(r["responses"], i) == letter)
            if letter == "" and total == 0:
                continue
            is_key = letter == correct_letter
            share = total / n_total
            functional = None
            if letter and not is_key:
                functional = share >= FUNCTIONAL_DISTRACTOR_MIN and lo >= up
                if share < FUNCTIONAL_DISTRACTOR_MIN:
                    issues.append(f"{letter} is chosen by fewer than 5% (non-functional)")
                elif up > lo:
                    issues.append(f"{letter} attracts more upper-group students (possible ambiguity)")
            options.append({
                "option": letter or "Omit",
                "is_key": is_key,
                "upper": up,
                "lower": lo,
                "total": total,
                "percent": round(share * 100, 1),
                "functional": functional,
            })

        meta = item_meta.get(i) or {}
        items.append({
            "item_number": i,
            "correct_answer": correct_letter,
            "bloom_level": meta.get("bloom"),
            "question": meta.get("question") or "",
            "upper_correct": u,
            "lower_correct": l,
            "total_correct": r_all,
            "difficulty": round(p, 3),
            "difficulty_all": round(p_all, 3),
            "discrimination": round(d, 3),
            "point_biserial": point_biserial,
            "difficulty_label": difficulty_label(p),
            "discrimination_label": discrimination_label(d),
            "decision": item_decision(p, d),
            "options": options,
            "distractor_issues": issues,
        })

    k = len(item_numbers)
    kr20 = None
    if k > 1 and variance > 0:
        kr20 = round((k / (k - 1)) * (1 - sum_pq / variance), 3)

    decisions = {"Retain": 0, "Revise": 0, "Discard": 0}
    difficulty_mix = defaultdict(int)
    for it in items:
        decisions[it["decision"]] += 1
        difficulty_mix[it["difficulty_label"]] += 1

    return {
        **base,
        "available": True,
        "items": items,
        "summary": {
            "examinees": n_total,
            "group_size": n_group,
            "items": k,
            "mean_score": round(mean_total, 2),
            "sd_score": round(sd_total, 2),
            "kr20": kr20,
            "reliability": reliability_label(kr20),
            "mean_difficulty": round(mean(it["difficulty"] for it in items), 3),
            "mean_discrimination": round(mean(it["discrimination"] for it in items), 3),
            "decisions": decisions,
            "difficulty_mix": dict(difficulty_mix),
        },
    }


# ── Roster ────────────────────────────────────────────────────────────────────


def course_roster(course_id, extra_sections=None) -> list[dict]:
    """
    Students linked to a course: everyone scanned on the course's bubble sheets,
    plus every block member of a section that takes the course (section_courses,
    or a section named in course_load.section).
    """
    templates = BubbleSheetTemplate.objects.filter(course_id=course_id)
    scanned_ids = {
        normalize_student_id(s)
        for s in BubbleSheetScan.objects.filter(template__in=templates)
        .values_list("student_identifier", flat=True)
        if is_valid_student_id(s)
    }
    blocks = dict(blocks_for(scanned_ids))
    section_names = {s.strip() for s in (extra_sections or []) if s and s.strip()}
    course_blocks = Block.objects.select_related("section").filter(
        Q(section__courses=course_id) | Q(section__section_name__in=section_names)
    ).distinct()
    for b in course_blocks:
        blocks[b.student_id] = b

    roster = []
    for sid in sorted(scanned_ids | set(blocks)):
        b = blocks.get(sid)
        roster.append({
            "student_id": sid,
            "grade_level": block_grade(b),
            "section": block_section(b),
            "section_id": str(b.section_id) if b and b.section_id else None,
            "in_blocks": b is not None,
        })
    return roster


def scan_coverage(templates, records, rosters, grade_level=None, section=None) -> dict:
    """
    Roster students per exam and section still missing a scanned paper.
    `rosters` maps course_id → course_roster(); `records` are already filtered.
    """
    scanned = defaultdict(set)
    for r in records:
        if r["identified"]:
            scanned[r["template"].template_id].add(r["student_id"])

    pending = []
    expected_total = scanned_total = 0
    for t in templates:
        students = filter_records(rosters.get(t.course_id, []), grade_level, section)
        by_section = defaultdict(list)
        for s in students:
            by_section[s["section"]].append(s["student_id"])
        for sec, ids in by_section.items():
            done = scanned[t.template_id]
            missing = sorted(sid for sid in ids if sid not in done)
            expected_total += len(ids)
            scanned_total += len(ids) - len(missing)
            if missing:
                pending.append({
                    "template_id": str(t.template_id),
                    "assessment_title": t.assessment.title if t.assessment_id else t.name,
                    "course_code": t.course.course_code,
                    "section": sec,
                    "total": len(ids),
                    "scanned": len(ids) - len(missing),
                    "missing": missing,
                })
    pending.sort(key=lambda p: (p["course_code"], p["assessment_title"], p["section"] == UNASSIGNED, p["section"].lower()))
    return {
        "complete": not pending,
        "expected": expected_total,
        "scanned": scanned_total,
        "pending": pending,
    }


def sorted_options(values) -> list[str]:
    return sorted({v for v in values if v}, key=lambda v: (v == UNASSIGNED, v.lower()))
