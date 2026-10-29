"""Compare a saved syllabus timeline with the modules generated from it.

The check is structural. A model is asked only when a module title and the
week topic are close in wording and the string rules cannot decide.
"""
import json
import re
from datetime import datetime, timezone

READING_HEADING = re.compile(
    r'^(?:required\s+|recommended\s+|supplementary\s+)?'
    r'(?:reading(?:\s*list)?|readings|references?|bibliography|text\s*books?|textbooks?)\b',
    re.IGNORECASE,
)
TOPIC_LABEL = re.compile(
    r'^(topics?|lecture(?:\s*/\s*discussion)?|discussion)\s*:',
    re.IGNORECASE,
)

BLOOM_VERBS = {
    'remember': {
        'define', 'list', 'name', 'identify', 'recall', 'recognize', 'recognise',
        'state', 'label', 'match', 'select', 'memorize', 'memorise',
    },
    'understand': {
        'explain', 'describe', 'summarize', 'summarise', 'interpret', 'classify',
        'discuss', 'paraphrase', 'illustrate', 'outline', 'clarify', 'compare',
    },
    'apply': {
        'apply', 'use', 'implement', 'execute', 'demonstrate', 'solve', 'compute',
        'operate', 'calculate', 'show',
    },
    'analyze': {
        'analyze', 'analyse', 'differentiate', 'organize', 'organise', 'examine',
        'contrast', 'distinguish', 'investigate', 'compare',
    },
    'evaluate': {
        'evaluate', 'judge', 'critique', 'justify', 'assess', 'argue', 'defend',
        'appraise', 'recommend',
    },
    'create': {
        'create', 'design', 'develop', 'construct', 'produce', 'formulate',
        'compose', 'generate', 'invent', 'build',
    },
}


def normalize_topic_key(value):
    return re.sub(r'[^a-z0-9]+', ' ', str(value or '').lower()).strip()


def topic_tokens(value):
    stopwords = {
        'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'your',
        'their', 'course', 'module', 'section', 'topic', 'week', 'of', 'to', 'in',
    }
    return {
        token
        for token in re.findall(r'[a-z0-9]+', str(value or '').lower())
        if len(token) > 2 and token not in stopwords
    }


def titles_match(left, right):
    a = normalize_topic_key(left)
    b = normalize_topic_key(right)
    if not a or not b:
        return False
    if a == b or a in b or b in a:
        return True
    ta, tb = topic_tokens(a), topic_tokens(b)
    if not ta or not tb:
        return False
    return (len(ta & tb) / min(len(ta), len(tb))) >= 0.6


def title_overlap(left, right):
    ta, tb = topic_tokens(left), topic_tokens(right)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / min(len(ta), len(tb))


def is_lecture_discussion(delivery):
    compact = ''.join(ch for ch in str(delivery or '').lower() if ch.isalnum())
    return compact == 'lecturediscussion' or ('lecture' in compact and 'discussion' in compact)


def verb_levels(text):
    match = re.match(r'[A-Za-z]+', str(text or '').strip())
    if not match:
        return set()
    verb = match.group(0).lower()
    return {level for level, verbs in BLOOM_VERBS.items() if verb in verbs}


def ilo_numbers(value):
    found = []

    def add(raw):
        digits = re.sub(r'\D', '', str(raw or ''))
        number = int(digits) if digits else 0
        if number > 0 and number not in found:
            found.append(number)

    if isinstance(value, list):
        for item in value:
            for number in ilo_numbers(item):
                if number not in found:
                    found.append(number)
        return found
    for part in re.split(r'[,;/]+', str(value or '')):
        add(part)
    return found


def _lecture_lines(raw):
    """Topic lines with indent preserved, skipping a reading-list tail."""
    kept = []
    skipping = False
    for raw_line in str(raw or '').splitlines():
        if not raw_line.strip():
            continue
        indented = raw_line.startswith((' ', '\t'))
        stripped = re.sub(r'^(?:[-*•–—]|\d+[.)])\s*', '', raw_line.strip()).strip()
        if not stripped:
            continue
        if READING_HEADING.search(stripped):
            skipping = True
            continue
        if TOPIC_LABEL.search(stripped):
            skipping = False
            rest = re.sub(r'^.*?:\s*', '', stripped).strip()
            if rest and not READING_HEADING.search(rest):
                kept.append((False, rest))
            continue
        if skipping:
            continue
        kept.append((indented, stripped))
    return kept


def parse_topics_cell(raw):
    kept = _lecture_lines(raw)
    lines = [text for _, text in kept]
    if not kept:
        return {
            'title': '',
            'subtopics': [],
            'activity': '',
            'lines': [],
            'structured': False,
        }
    unindented = [index for index, (indented, _) in enumerate(kept) if not indented]
    indented_texts = [text for indented, text in kept if indented]
    if indented_texts and unindented:
        title = kept[unindented[0]][1]
        activity = kept[unindented[-1]][1] if len(unindented) >= 2 else ''
        start, end = unindented[0], unindented[-1] if len(unindented) >= 2 else len(kept)
        subtopics = [
            text for index, (indented, text) in enumerate(kept)
            if indented and start < index < end
        ] or indented_texts
        return {
            'title': title,
            'subtopics': subtopics,
            'activity': activity,
            'lines': lines,
            'structured': True,
        }
    return {
        'title': lines[0],
        'subtopics': [],
        'activity': '',
        'lines': lines,
        'structured': False,
    }


def _week_number(chapter, index):
    try:
        number = int(str((chapter or {}).get('chapter') or '').strip())
    except (TypeError, ValueError):
        number = 0
    return number or (index + 1)


def lecture_weeks(syllabus_content):
    """One row per lecture/discussion week, matching the Module tab."""
    content = syllabus_content if isinstance(syllabus_content, dict) else {}
    chapters = content.get('tla_chapters') or []
    by_week = {}
    for index, chapter in enumerate(chapters):
        if not isinstance(chapter, dict) or not is_lecture_discussion(chapter.get('delivery')):
            continue
        parsed = parse_topics_cell(chapter.get('topics'))
        if not parsed['lines']:
            continue
        week = _week_number(chapter, index)
        refs = ilo_numbers(chapter.get('ilo'))
        for number in ilo_numbers(chapter.get('ilo_refs')):
            if number not in refs:
                refs.append(number)
        existing = by_week.get(week)
        if existing is None:
            by_week[week] = {
                'week': week,
                'lines': list(parsed['lines']),
                'title': parsed['title'],
                'subtopics': list(parsed['subtopics']),
                'activity': parsed['activity'],
                'structured': parsed['structured'],
                'ilo_refs': refs,
                'outcome': str(chapter.get('outcomes') or '').strip(),
            }
            continue
        for line in parsed['lines']:
            if not any(line.lower() == item.lower() for item in existing['lines']):
                existing['lines'].append(line)
        for subtopic in parsed['subtopics']:
            if not any(subtopic.lower() == item.lower() for item in existing['subtopics']):
                existing['subtopics'].append(subtopic)
        if parsed['structured']:
            existing['structured'] = True
            if not existing['title']:
                existing['title'] = parsed['title']
            if parsed['activity']:
                existing['activity'] = parsed['activity']
        for number in refs:
            if number not in existing['ilo_refs']:
                existing['ilo_refs'].append(number)
        if not existing['outcome']:
            existing['outcome'] = str(chapter.get('outcomes') or '').strip()
    rows = []
    for week in sorted(by_week):
        row = by_week[week]
        row['topic'] = '; '.join(row['lines'])
        rows.append(row)
    return rows


def _bloom_levels_for(ilo_bloom, numbers):
    levels = set()
    bloom_rows = ilo_bloom if isinstance(ilo_bloom, list) else []
    for number in numbers:
        entry = bloom_rows[number - 1] if 0 < number <= len(bloom_rows) else None
        if not isinstance(entry, dict):
            continue
        text = str(entry.get('level') or '').strip().lower()
        aliases = {
            'remembering': 'remember',
            'understanding': 'understand',
            'applying': 'apply',
            'analyzing': 'analyze',
            'analysing': 'analyze',
            'evaluating': 'evaluate',
            'creating': 'create',
        }
        level = aliases.get(text, text)
        if level in BLOOM_VERBS:
            levels.add(level)
    return levels


def _module_subtopic_titles(module_content):
    titles = []
    for subtopic in (module_content or {}).get('subtopics') or []:
        if isinstance(subtopic, dict):
            title = str(subtopic.get('title') or '').strip()
            if title:
                titles.append(title)
    return titles


def _pick_module(candidates, week_row):
    if not candidates:
        return None
    joined = week_row.get('topic') or ''
    title = week_row.get('title') or ''

    def score(module):
        name = module.get('module_title') or ''
        if normalize_topic_key(name) == normalize_topic_key(joined):
            return 3
        if title and titles_match(name, title):
            return 2
        if titles_match(name, joined):
            return 2
        return 1 if title_overlap(name, joined) > 0 else 0

    return max(candidates, key=score)


def _check_row(week_row, module, ilo_bloom, duplicate_count):
    checks = []
    module_content = module.get('module_content') if isinstance(module, dict) else None
    module_content = module_content if isinstance(module_content, dict) else {}

    if module is None:
        checks.append({
            'code': 'timeline',
            'ok': False,
            'detail': f"Week {week_row['week']} has no module.",
        })
        checks.append({
            'code': 'topic',
            'ok': False,
            'detail': 'There is no module title to compare with the syllabus topic.',
        })
        checks.append({
            'code': 'competency',
            'ok': False,
            'detail': 'There is no module to compare with the week ILOs.',
        })
        return checks, False

    if duplicate_count > 1:
        checks.append({
            'code': 'timeline',
            'ok': False,
            'detail': (
                f"Week {week_row['week']} has {duplicate_count} modules. "
                f"The check used “{module.get('module_title') or 'Untitled'}”."
            ),
        })
    else:
        checks.append({
            'code': 'timeline',
            'ok': True,
            'detail': f"Week {week_row['week']} has one module.",
        })

    module_title = module.get('module_title') or ''
    topic_ok = titles_match(module_title, week_row.get('topic')) or titles_match(
        module_title, week_row.get('title'),
    )
    needs_review = (not topic_ok) and title_overlap(module_title, week_row.get('topic')) >= 0.34
    if topic_ok:
        topic_detail = 'The module title matches the week topic.'
    elif needs_review:
        topic_detail = (
            f"Module title “{module_title}” is close to “{week_row.get('title') or week_row.get('topic')}” "
            'and needs a wording review.'
        )
    else:
        topic_detail = (
            f"Module title “{module_title}” does not match "
            f"“{week_row.get('title') or week_row.get('topic')}”."
        )
    checks.append({'code': 'topic', 'ok': topic_ok, 'detail': topic_detail})

    expected_subtopics = week_row.get('subtopics') or []
    module_subtopics = _module_subtopic_titles(module_content)
    if not week_row.get('structured') or not expected_subtopics:
        checks.append({
            'code': 'subtopics',
            'ok': True,
            'detail': 'The topics cell has no indented subtopics to match.',
        })
    else:
        missing = [
            title for title in expected_subtopics
            if not any(titles_match(title, candidate) for candidate in module_subtopics)
        ]
        checks.append({
            'code': 'subtopics',
            'ok': not missing,
            'detail': (
                'Module subtopics cover the indented syllabus lines.'
                if not missing
                else 'Missing subtopics: ' + '; '.join(missing)
            ),
        })

    activity = week_row.get('activity') or ''
    short_activity = module_content.get('short_activity') if isinstance(module_content.get('short_activity'), dict) else {}
    activity_title = str(short_activity.get('title') or '').strip()
    if not activity:
        checks.append({
            'code': 'activity',
            'ok': True,
            'detail': 'The topics cell has no separate activity line.',
        })
    else:
        activity_ok = titles_match(activity, activity_title)
        checks.append({
            'code': 'activity',
            'ok': activity_ok,
            'detail': (
                'The short activity matches the syllabus activity line.'
                if activity_ok
                else f"Syllabus activity “{activity}” does not match module activity “{activity_title or 'none'}”."
            ),
        })

    expected_ilos = week_row.get('ilo_refs') or []
    module_ilos = ilo_numbers(module_content.get('ilo_refs'))
    objectives = [
        str(item).strip()
        for item in (module_content.get('learning_objectives') or [])
        if str(item).strip()
    ]
    expected_levels = _bloom_levels_for(ilo_bloom, expected_ilos)
    problems = []
    if not expected_ilos:
        problems.append(f"Week {week_row['week']} has no ILO code.")
    if not objectives:
        problems.append('The module has no learning objectives.')
    extra = [number for number in module_ilos if number not in expected_ilos]
    if extra:
        problems.append(
            'Module ILO codes '
            + ', '.join(str(number) for number in extra)
            + ' are not on this week.'
        )
    if expected_levels:
        for objective in objectives:
            levels = verb_levels(objective)
            if levels and levels.isdisjoint(expected_levels):
                problems.append(f"Objective “{objective}” is outside the week’s Bloom levels.")
                break
        outcome_levels = verb_levels(week_row.get('outcome'))
        if outcome_levels and outcome_levels.isdisjoint(expected_levels):
            problems.append('The topic outcome verb does not match the week’s ILO Bloom levels.')
    ilo_label = ', '.join(str(number) for number in expected_ilos) or 'none'
    checks.append({
        'code': 'competency',
        'ok': not problems,
        'detail': ' '.join(problems) if problems else f"Objectives stay inside ILO {ilo_label}.",
    })
    return checks, needs_review


def _summarize(rows, orphans):
    aligned = sum(1 for row in rows if row['status'] == 'aligned')
    missing = sum(1 for row in rows if row['status'] == 'missing')
    issues = sum(1 for row in rows if row['status'] == 'issues')
    return {
        'weeks': len(rows),
        'aligned': aligned,
        'missing': missing,
        'issues': issues,
        'orphans': len(orphans),
    }


def check_consistency(syllabus_content, modules):
    """Return a week-by-week alignment report. ``modules`` are plain dicts."""
    content = syllabus_content if isinstance(syllabus_content, dict) else {}
    weeks = lecture_weeks(content)
    ilo_bloom = content.get('ilo_bloom') or []
    module_rows = [module for module in (modules or []) if isinstance(module, dict)]
    by_week = {}
    for module in module_rows:
        try:
            week = int(module.get('week_number') or 0)
        except (TypeError, ValueError):
            week = 0
        if week <= 0:
            continue
        by_week.setdefault(week, []).append(module)

    rows = []
    used_ids = set()
    for week_row in weeks:
        candidates = by_week.get(week_row['week']) or []
        chosen = _pick_module(candidates, week_row)
        checks, needs_review = _check_row(week_row, chosen, ilo_bloom, len(candidates))
        if chosen is None:
            status = 'missing'
        elif all(check['ok'] for check in checks):
            status = 'aligned'
        else:
            status = 'issues'
        if chosen is not None:
            used_ids.add(str(chosen.get('module_id') or ''))
        rows.append({
            'week': week_row['week'],
            'topic': week_row.get('topic') or '',
            'title': week_row.get('title') or '',
            'ilo_refs': week_row.get('ilo_refs') or [],
            'module_id': str(chosen.get('module_id')) if chosen else None,
            'module_title': (chosen or {}).get('module_title') or '',
            'status': status,
            'needs_topic_review': bool(needs_review and status != 'aligned'),
            'checks': checks,
        })

    week_numbers = {row['week'] for row in rows}
    orphans = []
    for module in module_rows:
        module_id = str(module.get('module_id') or '')
        try:
            week = int(module.get('week_number') or 0)
        except (TypeError, ValueError):
            week = 0
        if module_id in used_ids:
            continue
        if week in week_numbers:
            continue
        orphans.append({
            'module_id': module_id,
            'module_title': module.get('module_title') or '',
            'week_number': week,
            'detail': f"Week {week or '—'} is not a Lecture/Discussion row on the syllabus.",
        })

    return {
        'summary': _summarize(rows, orphans),
        'needs_review': any(row.get('needs_topic_review') for row in rows),
        'rows': rows,
        'orphans': orphans,
    }


def stamp_module_ilos(module_content, syllabus_content, week_number):
    """Store the week’s ILO codes on the module so later edits can be checked."""
    content = dict(module_content or {})
    try:
        week = int(week_number)
    except (TypeError, ValueError):
        week = 0
    match = next((row for row in lecture_weeks(syllabus_content) if row['week'] == week), None)
    if match is not None:
        content['ilo_refs'] = list(match.get('ilo_refs') or [])
    return content


def topic_review_prompts(report):
    pending = [
        {
            'week': row['week'],
            'syllabus_topic': row.get('title') or row.get('topic'),
            'module_title': row.get('module_title'),
        }
        for row in (report.get('rows') or [])
        if row.get('needs_topic_review')
    ]
    system = (
        'You compare syllabus topic titles with module titles. '
        'Reply with JSON only, no markdown.'
    )
    user = (
        'For each pair, decide whether the two titles name the same teaching topic.\n'
        'Wording may differ. A different subject is not a match.\n'
        'Return {"results": [{"week": <number>, "aligned": true|false, "reason": "<short>"}]}\n\n'
        f'{json.dumps(pending, ensure_ascii=False, indent=2)}'
    )
    return system, user


def parse_topic_judgments(raw):
    text = str(raw or '').strip()
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text).strip()
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if not match:
            return []
        try:
            payload = json.loads(match.group(0))
        except json.JSONDecodeError:
            return []
    rows = payload.get('results') if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        return []
    judgments = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            week = int(row.get('week'))
        except (TypeError, ValueError):
            continue
        judgments.append({
            'week': week,
            'aligned': bool(row.get('aligned')),
            'reason': str(row.get('reason') or '').strip(),
        })
    return judgments


def apply_topic_judgments(report, judgments):
    by_week = {item['week']: item for item in judgments or []}
    rows = []
    for row in report.get('rows') or []:
        next_row = dict(row)
        next_row['checks'] = [dict(check) for check in row.get('checks') or []]
        judgment = by_week.get(row.get('week'))
        if judgment and row.get('needs_topic_review'):
            for check in next_row['checks']:
                if check.get('code') != 'topic':
                    continue
                if judgment['aligned']:
                    check['ok'] = True
                    check['detail'] = judgment['reason'] or 'The titles name the same topic.'
                else:
                    check['ok'] = False
                    check['detail'] = judgment['reason'] or check.get('detail')
            next_row['needs_topic_review'] = False
            if all(check['ok'] for check in next_row['checks']):
                next_row['status'] = 'aligned'
            elif next_row['status'] != 'missing':
                next_row['status'] = 'issues'
        rows.append(next_row)
    orphans = report.get('orphans') or []
    return {
        'summary': _summarize(rows, orphans),
        'needs_review': any(row.get('needs_topic_review') for row in rows),
        'rows': rows,
        'orphans': orphans,
    }


def checked_now():
    return datetime.now(timezone.utc).isoformat()
