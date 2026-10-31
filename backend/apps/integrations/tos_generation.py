"""AI-assisted Table of Specifications (TOS) generation.

A course's assigned college year level decides the Bloom's Taxonomy levels an
examination should target:

    1st year      Remember and Understand
    2nd year      Apply
    3rd year      Analyze
    4th year +    Evaluate and Create

The LLM proposes a Bloom split for every selected TLA chapter inside that
policy. A deterministic fallback still returns a complete, valid TOS when no
provider answers, so the faculty never loses the draft they asked for.
"""

import json
import logging
import re

logger = logging.getLogger(__name__)

BLOOM_ORDER = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']

_BLOOM_ALIASES = {
    'remembering': 'remember',
    'remember': 'remember',
    'understanding': 'understand',
    'understand': 'understand',
    'applying': 'apply',
    'apply': 'apply',
    'analyzing': 'analyze',
    'analysing': 'analyze',
    'analysis': 'analyze',
    'analyze': 'analyze',
    'evaluating': 'evaluate',
    'evaluate': 'evaluate',
    'evaluation': 'evaluate',
    'creating': 'create',
    'create': 'create',
    'creation': 'create',
}

_YEAR_WORDS = {
    'freshman': 1,
    'first': 1,
    'sophomore': 2,
    'second': 2,
    'junior': 3,
    'third': 3,
    'senior': 4,
    'fourth': 4,
    'fifth': 5,
}

_YEAR_POLICIES = {
    1: {
        'label': '1st Year',
        'levels': ['remember', 'understand'],
        'weights': [50, 50],
        'summary': 'Remember and Understand',
    },
    2: {
        'label': '2nd Year',
        'levels': ['apply'],
        'weights': [100],
        'summary': 'Apply',
    },
    3: {
        'label': '3rd Year',
        'levels': ['analyze'],
        'weights': [100],
        'summary': 'Analyze',
    },
    4: {
        'label': '4th Year and above',
        'levels': ['evaluate', 'create'],
        'weights': [50, 50],
        'summary': 'Evaluate and Create',
    },
}


def year_number(year_level):
    """Read the college year from free text such as '2nd Year' or 'Third'."""
    text = str(year_level or '').strip().lower()
    match = re.search(r'\d+', text)
    if match:
        return int(match.group(0))
    for word, number in _YEAR_WORDS.items():
        if re.search(rf'\b{word}\b', text):
            return number
    return 0


def bloom_policy_for_year(year_level, custom_weights=None):
    """Return the institutional Bloom policy for a year level.

    Faculty may override the default split. Custom weights are clamped to the
    year's allowed levels and renormalized to 100 so the policy stays valid.
    Unknown or empty year levels fall back to the 1st-year profile so the
    generator always has a valid target.
    """
    number = year_number(year_level)
    if number >= 4:
        key = 4
    elif number in _YEAR_POLICIES:
        key = number
    else:
        key = 1
    policy = dict(_YEAR_POLICIES[key])
    policy['year_number'] = key
    policy['allowed_keys'] = list(policy['levels'])
    weights = _custom_weights(policy['levels'], custom_weights) or list(policy['weights'])
    policy['weights'] = weights
    policy['weight_map'] = dict(zip(policy['levels'], weights))
    return policy


def _custom_weights(levels, raw):
    """Read faculty-entered percentages for the policy levels, or None."""
    if isinstance(raw, dict):
        values = [raw.get(level) for level in levels]
    elif isinstance(raw, (list, tuple)):
        values = list(raw[:len(levels)]) + [0] * max(0, len(levels) - len(raw))
    else:
        return None
    numbers = []
    for value in values:
        try:
            number = float(value)
        except (TypeError, ValueError):
            number = 0.0
        numbers.append(min(100.0, max(0.0, number)))
    if sum(numbers) <= 0:
        return None
    return _allocate(100, numbers)


def _allocate(total, weights):
    """Largest-remainder split of ``total`` so the parts add up exactly."""
    target = max(0, int(round(total or 0)))
    safe = [max(0.0, float(weight or 0)) for weight in weights]
    weight_sum = sum(safe)
    if target <= 0 or not safe:
        return [0 for _ in safe]
    if weight_sum <= 0:
        return [0 for _ in safe]

    raw = [(weight / weight_sum) * target for weight in safe]
    parts = [int(value) for value in raw]
    remaining = target - sum(parts)
    order = sorted(
        range(len(raw)),
        key=lambda index: (-(raw[index] - parts[index]), index),
    )
    for index in order[:remaining]:
        parts[index] += 1
    return parts


def policy_bloom_pct(policy):
    """A full 100% split across the policy levels."""
    levels = policy.get('levels') or ['remember']
    parts = _allocate(100, policy.get('weights') or [1] * len(levels))
    pct = {key: 0 for key in BLOOM_ORDER}
    for key, value in zip(levels, parts):
        pct[key] = value
    return pct


def _normalize_bloom_key(value):
    return _BLOOM_ALIASES.get(str(value or '').strip().lower(), '')


def _normalize_pct(raw, policy):
    """Keep only allowed Bloom levels and force the row to total 100%."""
    allowed = policy.get('allowed_keys') or []
    source = raw if isinstance(raw, dict) else {}
    # Accept capitalized keys and '-ing' spellings from the model.
    normalized = {}
    for raw_key, raw_value in source.items():
        key = _BLOOM_ALIASES.get(str(raw_key or '').strip().lower())
        if key and key not in normalized:
            normalized[key] = raw_value
    values = []
    for key in allowed:
        try:
            number = float(normalized.get(key) or 0)
        except (TypeError, ValueError):
            number = 0.0
        values.append(max(0.0, number))
    if sum(values) <= 0:
        return policy_bloom_pct(policy)
    parts = _allocate(100, values)
    pct = {key: 0 for key in BLOOM_ORDER}
    for key, value in zip(allowed, parts):
        pct[key] = value
    return pct


def fallback_topics(chapters, policy, weekly_hours=3):
    """Deterministic TOS rows used when the LLM is unavailable."""
    try:
        weekly_hours = float(weekly_hours or 3)
    except (TypeError, ValueError):
        weekly_hours = 3.0
    weekly_hours = min(12.0, max(0.5, weekly_hours))
    pct = policy_bloom_pct(policy)

    topics = []
    for chapter in chapters or []:
        span = chapter.get('span') or 1
        try:
            span = max(1.0, float(span))
        except (TypeError, ValueError):
            span = 1.0
        topics.append(
            {
                'topic': chapter.get('title') or '',
                'ilos': list(chapter.get('ilos') or []),
                'hours_class': round(span * weekly_hours, 1),
                'bloom_pct': dict(pct),
            }
        )
    return topics


def _chapter_payload(chapters):
    payload = []
    for index, chapter in enumerate(chapters or []):
        payload.append(
            {
                'index': index + 1,
                'title': str(chapter.get('title') or '')[:140],
                'week': chapter.get('week') or '',
                'weeks_covered': chapter.get('span') or 1,
                'ilos': list(chapter.get('ilos') or []),
                'topic_outcomes': str(chapter.get('outcomes') or '')[:240],
            }
        )
    return payload


def build_tos_prompt(course, chapters, policy, total_items, total_minutes, weekly_hours, extra_instructions=''):
    """System and user prompts for a strict-JSON TOS draft."""
    levels = policy.get('levels') or []
    weight_map = policy.get('weight_map') or {}
    level_rules = ', '.join(f'{key} {weight_map.get(key, 0)}%' for key in levels)
    allowed_list = ', '.join(levels)

    system = (
        'You are an expert university assessment designer. '
        'Build a Table of Specifications (TOS) as strict JSON. '
        'Return JSON only, with no markdown and no commentary.'
    )

    user = f"""Create the TOS topic rows for one college examination.

Course: {course.get('course_title') or ''} ({course.get('course_code') or ''})
Year level: {policy.get('label') or ''}
Institutional Bloom target for this year level: {policy.get('summary') or ''} ({level_rules})
Exam: {course.get('exam_label') or 'Examination'}
Total test items: {total_items}
Total exam minutes: {total_minutes}
Weekly class hours: {weekly_hours}

Selected TLA chapters (cover every chapter, in this order):
{json.dumps(_chapter_payload(chapters), ensure_ascii=False, indent=2)}

Rules:
1. Return exactly one topic row per selected chapter, in the same order.
2. "topic" is the chapter's teaching topic title (short and specific).
3. "ilos" copies the ILO references attached to that chapter, e.g. ["ILO1","ILO2"].
4. "hours_class" is the class hours for the chapter. Use weeks_covered x weekly class hours, unless the chapter clearly needs less.
5. "bloom_pct" contains ONLY these levels: {allowed_list}. Every row's percentages MUST add up to exactly 100.
6. Respect the institutional target: {policy.get('summary')}. Do not use Bloom levels outside {allowed_list}.
7. Keep the row order and cover all content; do not invent chapters outside the list.
{"8. Extra faculty instructions: " + str(extra_instructions)[:600] if extra_instructions else ""}

Return this shape:
{{
  "topics": [
    {{
      "topic": "Chapter topic title",
      "ilos": ["ILO1"],
      "hours_class": 6,
      "bloom_pct": {{{", ".join(f'"{key}": 0' for key in levels)}}}
    }}
  ]
}}
"""
    return system, user


def _extract_json(raw):
    text = str(raw or '').strip()
    if not text:
        raise ValueError('Empty response.')
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start = text.find('{')
    end = text.rfind('}')
    if start >= 0 and end > start:
        return json.loads(text[start:end + 1])
    start = text.find('[')
    end = text.rfind(']')
    if start >= 0 and end > start:
        return json.loads(text[start:end + 1])
    raise ValueError('No JSON object found in the response.')


def _normalize_ilos(raw, fallback):
    values = raw if isinstance(raw, list) else []
    ilos = []
    for value in values:
        digits = re.sub(r'\D', '', str(value or ''))
        if not digits:
            continue
        key = f'ILO{int(digits)}'
        if key not in ilos:
            ilos.append(key)
    return ilos or list(fallback or [])


def _safe_hours(value, chapter, weekly_hours):
    try:
        span = max(1.0, float(chapter.get('span') or 1))
    except (TypeError, ValueError):
        span = 1.0
    try:
        weekly = max(0.5, float(weekly_hours or 3))
    except (TypeError, ValueError):
        weekly = 3.0
    default = span * weekly
    try:
        hours = float(value)
    except (TypeError, ValueError):
        hours = default
    if hours <= 0:
        hours = default
    return round(min(default * 2, hours), 1)


def parse_topics(raw, chapters, policy, weekly_hours=3):
    """Turn an LLM reply into clean TOS rows, one per selected chapter."""
    payload = _extract_json(raw)
    if isinstance(payload, dict):
        items = payload.get('topics') or payload.get('rows') or payload.get('tos')
    else:
        items = payload
    if not isinstance(items, list) or not items:
        raise ValueError('The response did not include TOS topics.')

    rows = []
    for index, chapter in enumerate(chapters or []):
        item = items[index] if index < len(items) and isinstance(items[index], dict) else {}
        title = str(item.get('topic') or item.get('title') or item.get('label') or '').strip()
        if not title:
            title = str(chapter.get('title') or '').strip()
        if not title:
            continue
        rows.append(
            {
                'topic': title[:180],
                'ilos': _normalize_ilos(item.get('ilos'), chapter.get('ilos')),
                'hours_class': _safe_hours(item.get('hours_class') or item.get('hours'), chapter, weekly_hours),
                'bloom_pct': _normalize_pct(item.get('bloom_pct') or item.get('bloom'), policy),
            }
        )
    return rows


def generate_topics(
    llm,
    course,
    chapters,
    policy,
    total_items,
    total_minutes,
    weekly_hours=3,
    extra_instructions='',
    preferred_provider=None,
):
    """Ask the LLM for TOS rows; returns (topics, provider_used).

    Raises on any provider/parse failure so the caller can use the
    deterministic fallback.
    """
    system, user = build_tos_prompt(
        course, chapters, policy, total_items, total_minutes, weekly_hours, extra_instructions,
    )
    result = llm.generate_response_with_fallback(
        [{'role': 'user', 'content': user}],
        preferred_provider=preferred_provider,
        system=system,
        max_tokens=2048,
        return_provider=True,
    )
    if isinstance(result, tuple):
        raw, provider_used = result[:2]
    else:
        raw, provider_used = result, None
    topics = parse_topics(raw, chapters, policy, weekly_hours)
    return topics, provider_used
