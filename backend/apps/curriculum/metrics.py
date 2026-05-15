"""
metrics.py — Curriculum quality metrics (Python port of PEA's governor.js).

All functions are pure and synchronous. Zero database calls.
Accepts the syllabus_content dict stored in Syllabus.syllabus_content.

Metrics:
    IC  — ILO Coverage
    AM  — Assessment Mapping
    CBI — Cognitive Balance Index
    SC  — Schedule Coverage
    FA  — Framework Alignment
    CRI — Course Readiness Index (composite)
"""

import re
import math

# ── Bloom taxonomy lookup ──────────────────────────────────────────────────────

BLOOM_LEVELS = {
    # Remember (1)
    "remember": 1, "recall": 1, "identify": 1, "define": 1, "list": 1, "name": 1,
    # Understand (2)
    "understand": 2, "explain": 2, "describe": 2, "summarize": 2, "classify": 2, "discuss": 2,
    # Apply (3)
    "apply": 3, "use": 3, "implement": 3, "solve": 3, "demonstrate": 3, "execute": 3,
    # Analyze (4)
    "analyze": 4, "compare": 4, "differentiate": 4, "examine": 4, "break": 4, "organize": 4,
    # Evaluate (5)
    "evaluate": 5, "assess": 5, "judge": 5, "critique": 5, "justify": 5, "argue": 5,
    # Create (6)
    "create": 6, "design": 6, "develop": 6, "construct": 6, "produce": 6, "formulate": 6,
}

BLOOM_NAMES = {1: "Remember", 2: "Understand", 3: "Apply", 4: "Analyze", 5: "Evaluate", 6: "Create"}

ASSESSMENT_BLOOM_MIN = {
    "exam": 4, "midterm": 4, "final": 5, "preliminary": 3,
    "quiz": 2, "recitation": 2,
    "laboratory": 3, "lab": 3, "activity": 3,
    "project": 6, "portfolio": 5,
    "report": 5, "reporting": 5, "presentation": 5,
    "performance": 4,
}

STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "by", "for", "from",
    "has", "have", "he", "her", "him", "his", "how", "i", "in", "is", "it",
    "its", "of", "on", "or", "she", "so", "that", "the", "their", "them",
    "they", "this", "to", "was", "we", "were", "what", "which", "who",
    "will", "with", "you", "your",
}

# ── Text helpers ───────────────────────────────────────────────────────────────

def _tokenize(text):
    tokens = re.sub(r"[^a-z0-9\s]", " ", (text or "").lower()).split()
    return [t for t in tokens if len(t) > 1 and t not in STOP_WORDS]


def _jaccard(tokens_a, tokens_b):
    set_a, set_b = set(tokens_a), set(tokens_b)
    if not set_a and not set_b:
        return 0.0
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union if union else 0.0


def _extract_bloom_verb(text):
    for word in (text or "").lower().split():
        clean = re.sub(r"[^a-z]", "", word)
        if clean in BLOOM_LEVELS:
            return clean, BLOOM_LEVELS[clean]
    return None, 0


def _detect_assessment_bloom_min(label):
    lower = (label or "").lower()
    for keyword, level in ASSESSMENT_BLOOM_MIN.items():
        if keyword in lower:
            return level
    return 0


def _std_dev(values):
    if not values:
        return 0.0
    mean = sum(values) / len(values)
    variance = sum((v - mean) ** 2 for v in values) / len(values)
    return math.sqrt(variance)


# ── Syllabus data extraction helpers ──────────────────────────────────────────

def _extract_ilos(content):
    """
    Return a list of dicts: {id, text, bloomLevel, bloomVerb}.
    Handles both plain-string ILOs (legacy) and object ILOs with bloom fields.
    """
    raw = content.get("ilos", [])
    ilo_bloom = content.get("ilo_bloom", [])  # [{level, verb}]
    result = []
    for i, item in enumerate(raw):
        if isinstance(item, dict):
            text = item.get("text", "")
            bloom_level_name = item.get("bloomLevel", None)
            bloom_verb = item.get("bloomVerb", None)
        else:
            text = str(item)
            bloom_info = ilo_bloom[i] if i < len(ilo_bloom) else {}
            bloom_level_name = bloom_info.get("level", None)
            bloom_verb = bloom_info.get("verb", None)

        # Auto-detect bloom if not explicitly set
        if not bloom_verb:
            bloom_verb, _ = _extract_bloom_verb(text)
        bloom_num = BLOOM_LEVELS.get((bloom_verb or "").lower(), 0)

        result.append({
            "id": f"ILO{i + 1}",
            "text": text,
            "bloomLevel": bloom_level_name or (BLOOM_NAMES.get(bloom_num) if bloom_num else None),
            "bloomVerb": bloom_verb,
            "bloomNum": bloom_num,
        })
    return result


def _extract_assessment_tasks(content):
    """
    Return a list of flat assessment task dicts with bloom metadata.
    Expands subs[] if present.
    """
    raw = content.get("assessment_tasks", [])
    result = []
    for at in raw:
        code = at.get("code", "")
        label = at.get("task", at.get("label", code))
        weight_raw = at.get("weight", 0)
        try:
            weight = float(weight_raw)
        except (TypeError, ValueError):
            weight = 0.0
        # Normalise from percentage to decimal if needed
        if weight > 1.5:
            weight = weight / 100.0

        _, sub_bloom_min = _extract_bloom_verb(label)
        assessment_bloom_min = _detect_assessment_bloom_min(label) or sub_bloom_min

        subs = at.get("subs", [])
        if subs:
            for sub in subs:
                sub_code = sub.get("code", code)
                sub_label = sub.get("label", sub_code)
                sub_w_raw = sub.get("weight", 0)
                try:
                    sub_w = float(sub_w_raw)
                except (TypeError, ValueError):
                    sub_w = 0.0
                if sub_w > 1.5:
                    sub_w = sub_w / 100.0
                _, sub_bm = _extract_bloom_verb(sub_label)
                result.append({
                    "code": sub_code,
                    "label": sub_label,
                    "weight": sub_w,
                    "assessmentBloomMin": _detect_assessment_bloom_min(sub_label) or sub_bm,
                })
        else:
            result.append({
                "code": code,
                "label": label,
                "weight": weight,
                "assessmentBloomMin": assessment_bloom_min,
            })
    return result


def _extract_tos(content):
    return content.get("tos", [])


def _extract_schedule(content):
    """Returns tla_chapters as schedule entries."""
    return content.get("tla_chapters", [])


# ── Mapping functions ──────────────────────────────────────────────────────────

def _map_ilo_assessments(ilos, ats):
    """
    Maps each ILO to each assessment task using verb match + keyword overlap.
    Returns list of {iloId, assessmentCode, weight, strength, iloBloomLevel, assessmentBloomMin}.
    (RAG component is 0 here — not available server-side at metric time.)
    """
    results = []
    for ilo in ilos:
        ilo_text = ilo.get("text", "")
        ilo_bloom_num = ilo.get("bloomNum", 0)
        ilo_verb = ilo.get("bloomVerb")
        ilo_tokens = _tokenize(ilo_text)

        for at in ats:
            at_label = at.get("label", "")
            at_tokens = _tokenize(at_label)
            _, at_bloom_num = _extract_bloom_verb(at_label)
            at_bloom_min = at.get("assessmentBloomMin", 0)

            # Verb match score
            at_verb, _ = _extract_bloom_verb(at_label)
            if ilo_verb and at_verb and ilo_verb == at_verb:
                verb_match = 1.0
            elif ilo_bloom_num and at_bloom_num and ilo_bloom_num == at_bloom_num:
                verb_match = 0.5
            else:
                verb_match = 0.0

            keyword_score = _jaccard(ilo_tokens, at_tokens)
            # No RAG available at compute time — weight the two available signals
            strength = min(1.0, 0.60 * verb_match + 0.40 * keyword_score)

            results.append({
                "iloId": ilo["id"],
                "assessmentCode": at["code"],
                "weight": at["weight"],
                "strength": strength,
                "iloBloomLevel": ilo_bloom_num,
                "assessmentBloomMin": at_bloom_min,
            })
    return results


# ── Metric functions ───────────────────────────────────────────────────────────

def ilo_coverage(ilos, mappings, threshold=0.3):
    """IC — fraction of ILOs with at least one mapping above threshold."""
    if not ilos:
        return 0.0
    covered_ids = {m["iloId"] for m in mappings if m.get("strength", 0) > threshold}
    return len(covered_ids) / len(ilos)


def assessment_mapping(mappings):
    """AM — weighted average mapping strength across all ILO-AT pairs."""
    if not mappings:
        return 0.0
    weighted_sum = sum(m.get("weight", 0) * m.get("strength", 0) for m in mappings)
    total_weight = sum(m.get("weight", 0) for m in mappings)
    return weighted_sum / total_weight if total_weight > 0 else 0.0


def cognitive_balance_index(tos_data):
    """
    CBI — Bloom-level distribution health from TOS.
    Returns None if no TOS bloom data is present.
    """
    if not tos_data:
        return None

    totals = {1: 0.0, 2: 0.0, 3: 0.0, 4: 0.0, 5: 0.0, 6: 0.0}
    has_data = False

    for entry in tos_data:
        bloom_dist = entry.get("bloom_dist") or entry.get("bloomDistribution") or {}
        for level_key, pct in bloom_dist.items():
            try:
                num = int(level_key)
            except (ValueError, TypeError):
                # Accept named levels too
                name_map = {"remember": 1, "understand": 2, "apply": 3,
                            "analyze": 4, "evaluate": 5, "create": 6}
                num = name_map.get(str(level_key).lower(), 0)
            if 1 <= num <= 6:
                try:
                    totals[num] += float(pct or 0)
                    has_data = True
                except (TypeError, ValueError):
                    pass

    if not has_data:
        return None

    total = sum(totals.values())
    if total == 0:
        return None

    distribution = [v / total for v in totals.values()]
    return max(0.0, min(1.0, 1.0 - _std_dev(distribution) / 0.5))


def framework_alignment(mappings):
    """
    FA — fraction of ILO-AT pairs where ILO Bloom level >= assessment minimum.
    Returns None when no pairs have Bloom data.
    """
    bloom_pairs = [
        m for m in mappings
        if (m.get("iloBloomLevel") or 0) > 0 and (m.get("assessmentBloomMin") or 0) > 0
    ]
    if not bloom_pairs:
        return None
    compatible = [m for m in bloom_pairs if m["iloBloomLevel"] >= m["assessmentBloomMin"]]
    return len(compatible) / len(bloom_pairs)


def schedule_coverage(schedule):
    """
    SC — fraction of schedule entries with instructional content.
    Returns None when schedule is empty.
    """
    if not schedule:
        return None
    covered = sum(
        1 for entry in schedule
        if entry.get("topics") or entry.get("topic") or entry.get("outcomes")
    )
    return covered / len(schedule)


def course_readiness_index(ic, am, cbi, sc, fa, weights=None):
    """
    CRI — composite of all available metrics, dynamically weighted.
    """
    w = weights or {"ic": 0.25, "am": 0.25, "cbi": 0.20, "sc": 0.15, "fa": 0.15}
    numerator = w["ic"] * ic + w["am"] * am
    denominator = w["ic"] + w["am"]
    if cbi is not None:
        numerator += w["cbi"] * cbi
        denominator += w["cbi"]
    if sc is not None:
        numerator += w["sc"] * sc
        denominator += w["sc"]
    if fa is not None:
        numerator += w["fa"] * fa
        denominator += w["fa"]
    return numerator / denominator if denominator > 0 else 0.0


# ── Thresholds ─────────────────────────────────────────────────────────────────

THRESHOLDS = {
    "CRI_FAIL":    0.50,   # Below this = fundamentally broken
    "CRI_WARN":    0.70,   # Below this = needs attention
    "IC_MIN":      0.75,   # ILO Coverage minimum
    "AM_MIN":      0.60,   # Assessment Mapping minimum
}


def grade_metric(value, metric_key):
    """Return 'good' | 'warn' | 'fail' for a single metric value."""
    if value is None:
        return "na"
    mn = THRESHOLDS.get(f"{metric_key}_MIN", 0.60)
    if value >= mn:
        return "good"
    if value >= mn * 0.75:
        return "warn"
    return "fail"


# ── Main entry point ───────────────────────────────────────────────────────────

def compute_metrics(syllabus_content: dict) -> dict:
    """
    Compute all curriculum quality metrics from a syllabus_content dict.

    Returns:
        {
          ic, am, cbi, sc, fa, cri,
          grades: {ic, am, cbi, sc, fa, cri},
          detail: {mappings, ilo_count, at_count, tos_count, schedule_count},
        }
    """
    if not syllabus_content or not isinstance(syllabus_content, dict):
        return _empty_result()

    ilos = _extract_ilos(syllabus_content)
    ats = _extract_assessment_tasks(syllabus_content)
    tos_data = _extract_tos(syllabus_content)
    schedule = _extract_schedule(syllabus_content)

    if not ilos or not ats:
        return _empty_result(
            ilo_count=len(ilos),
            at_count=len(ats),
            error="Insufficient data: need at least one ILO and one assessment task.",
        )

    mappings = _map_ilo_assessments(ilos, ats)

    ic = ilo_coverage(ilos, mappings)
    am = assessment_mapping(mappings)
    cbi = cognitive_balance_index(tos_data)
    sc = schedule_coverage(schedule)
    fa = framework_alignment(mappings)
    cri = course_readiness_index(ic, am, cbi, sc, fa)

    def _pct(v):
        return round(v * 100, 1) if v is not None else None

    return {
        "ic": _pct(ic),
        "am": _pct(am),
        "cbi": _pct(cbi),
        "sc": _pct(sc),
        "fa": _pct(fa),
        "cri": _pct(cri),
        "grades": {
            "ic": grade_metric(ic, "IC"),
            "am": grade_metric(am, "AM"),
            "cbi": grade_metric(cbi, "CBI") if cbi is not None else "na",
            "sc": grade_metric(sc, "SC") if sc is not None else "na",
            "fa": grade_metric(fa, "FA") if fa is not None else "na",
            "cri": "good" if cri >= 0.70 else ("warn" if cri >= 0.50 else "fail"),
        },
        "detail": {
            "ilo_count": len(ilos),
            "at_count": len(ats),
            "tos_count": len(tos_data),
            "schedule_count": len(schedule),
            "mapped_ilos": len({m["iloId"] for m in mappings if m["strength"] > 0.3}),
        },
        "bloom_summary": _bloom_summary(ilos),
        "error": None,
    }


def _bloom_summary(ilos):
    dist = {name: 0 for name in BLOOM_NAMES.values()}
    untagged = 0
    for ilo in ilos:
        num = ilo.get("bloomNum", 0)
        if num and num in BLOOM_NAMES:
            dist[BLOOM_NAMES[num]] += 1
        else:
            untagged += 1
    return {"distribution": dist, "untagged": untagged}


def _empty_result(ilo_count=0, at_count=0, error=None):
    return {
        "ic": None, "am": None, "cbi": None, "sc": None, "fa": None, "cri": None,
        "grades": {"ic": "na", "am": "na", "cbi": "na", "sc": "na", "fa": "na", "cri": "na"},
        "detail": {"ilo_count": ilo_count, "at_count": at_count,
                   "tos_count": 0, "schedule_count": 0, "mapped_ilos": 0},
        "bloom_summary": {"distribution": {n: 0 for n in BLOOM_NAMES.values()}, "untagged": 0},
        "error": error,
    }
