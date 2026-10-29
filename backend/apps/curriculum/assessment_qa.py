"""Score saved assessment items against the TOS blueprint and source passages.

Bloom labels and item counts are compared in code. A model call only judges
whether the keyed answer is supported by the retrieved passages. Short topics
share one call, and those calls run together.
"""
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

from apps.curriculum.consistency_checker import titles_match, verb_levels

logger = logging.getLogger(__name__)

SOURCE_CHECK_WORKERS = 2
SOURCE_CHECK_PACK = 8
_PASSAGE_CHAR_LIMIT = 3600

BLOOM_ORDER = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
SOURCE_LABELS = {'supported', 'unsupported', 'contradicted'}


def normalize_bloom_key(value):
    text = str(value or '').strip().lower()
    aliases = {
        'remembering': 'remember',
        'understanding': 'understand',
        'applying': 'apply',
        'analyzing': 'analyze',
        'analysing': 'analyze',
        'evaluating': 'evaluate',
        'creating': 'create',
    }
    return aliases.get(text, text)


def _ilo_numbers(value):
    found = []
    values = value if isinstance(value, list) else [value]
    for item in values:
        for part in re.split(r'[,;/]+', str(item or '')):
            digits = re.sub(r'\D', '', part)
            number = int(digits) if digits else 0
            if number > 0 and number not in found:
                found.append(number)
    return found


def _blueprint_index(sections):
    expected = {}
    for section in sections or []:
        if not isinstance(section, dict):
            continue
        for item in section.get('items') or []:
            if not isinstance(item, dict):
                continue
            try:
                number = int(item.get('item_number') or 0)
            except (TypeError, ValueError):
                number = 0
            if number > 0:
                expected[number] = item
    return expected


def check_against_blueprint(sections, saved_items):
    """Compare saved items with the TOS slot list. Source context is filled later."""
    expected = _blueprint_index(sections)
    saved_by_number = {}
    saved_order = []
    for item in saved_items or []:
        if not isinstance(item, dict):
            continue
        try:
            number = int(item.get('item_number') or 0)
        except (TypeError, ValueError):
            number = 0
        if number <= 0:
            continue
        saved_by_number[number] = item
        saved_order.append(number)

    allocation_details = []
    records = {}

    def record_for(item, number):
        item_id = str(item.get('item_id') or f'missing-{number}')
        return item_id

    numbers = sorted(set(expected) | set(saved_by_number))
    for number in numbers:
        slot = expected.get(number)
        saved = saved_by_number.get(number)
        details = []
        tos_ok = True
        bloom_ok = True
        if slot is None:
            tos_ok = False
            details.append(f'Item {number} is not in the TOS blueprint.')
            question = str((saved or {}).get('question_text') or '')
            bloom_label = normalize_bloom_key((saved or {}).get('bloom_level'))
        elif saved is None:
            tos_ok = False
            bloom_ok = False
            details.append(f'Item {number} is missing from the assessment.')
            question = ''
            bloom_label = normalize_bloom_key(slot.get('bloom_level'))
        else:
            if not titles_match(saved.get('section_title'), slot.get('section_title')):
                tos_ok = False
                details.append(
                    f"Item {number} topic “{saved.get('section_title') or ''}” "
                    f"does not match TOS topic “{slot.get('section_title') or ''}”."
                )
            expected_ilos = set(_ilo_numbers(slot.get('ilo_refs')))
            saved_ilos = set(_ilo_numbers(saved.get('ilo_refs')))
            if expected_ilos and not saved_ilos:
                tos_ok = False
                details.append(f'Item {number} has no ILO code from its TOS row.')
            elif expected_ilos and not saved_ilos <= expected_ilos:
                tos_ok = False
                details.append(f'Item {number} cites an ILO that is not on its TOS row.')
            slot_bloom = normalize_bloom_key(slot.get('bloom_level'))
            saved_bloom = normalize_bloom_key(saved.get('bloom_level'))
            bloom_label = saved_bloom or slot_bloom
            if saved_bloom != slot_bloom:
                bloom_ok = False
                details.append(
                    f"Item {number} is labeled {saved_bloom or 'blank'} "
                    f"and the TOS cell is {slot_bloom or 'blank'}."
                )
            question = str(saved.get('question_text') or '')
            levels = verb_levels(question)
            if levels and slot_bloom and slot_bloom not in levels:
                bloom_ok = False
                details.append(
                    f"Item {number} asks for {', '.join(sorted(levels))} "
                    f"while the TOS cell is {slot_bloom}."
                )
        if tos_ok and bloom_ok:
            details.append(f'Item {number} matches its TOS cell.')
        item = saved or slot or {}
        item_id = record_for(saved or {'item_id': f'missing-{number}'}, number)
        records[item_id] = {
            'item_id': item_id,
            'item_number': number,
            'section_title': str((saved or slot or {}).get('section_title') or ''),
            'tos_ok': tos_ok,
            'bloom_ok': bloom_ok,
            'source': 'pending',
            'evidence': '',
            'details': details,
            'question_text': question,
            'choices': (saved or {}).get('choices') or [],
            'correct_answer': str((saved or {}).get('correct_answer') or ''),
            'answer_key': str((saved or {}).get('answer_key') or ''),
        }

    expected_counts = {}
    for slot in expected.values():
        key = (
            str(slot.get('section_title') or '').strip().lower(),
            normalize_bloom_key(slot.get('bloom_level')),
        )
        expected_counts[key] = expected_counts.get(key, 0) + 1
    actual_counts = {}
    for item in saved_by_number.values():
        key = (
            str(item.get('section_title') or '').strip().lower(),
            normalize_bloom_key(item.get('bloom_level')),
        )
        actual_counts[key] = actual_counts.get(key, 0) + 1
    for key in sorted(set(expected_counts) | set(actual_counts)):
        expected_count = expected_counts.get(key, 0)
        actual_count = actual_counts.get(key, 0)
        if expected_count != actual_count:
            topic, bloom = key
            allocation_details.append(
                f"{topic or 'untitled'} / {bloom or 'unlabeled'}: "
                f"TOS {expected_count}, saved {actual_count}."
            )

    missing = [number for number in expected if number not in saved_by_number]
    if missing:
        allocation_details.append(
            'Missing item numbers: ' + ', '.join(str(number) for number in missing)
        )
    extra = [number for number in saved_order if number not in expected]
    if extra:
        allocation_details.append(
            'Items outside the TOS: ' + ', '.join(str(number) for number in extra)
        )

    return {
        'allocation_ok': not allocation_details,
        'allocation_details': allocation_details,
        'items': records,
    }


def source_batches(report, size=8):
    """Group items that share a topic so one retrieval serves several items."""
    groups = {}
    for record in (report.get('items') or {}).values():
        if str(record.get('item_id') or '').startswith('missing-'):
            continue
        if not str(record.get('question_text') or '').strip():
            continue
        key = str(record.get('section_title') or '').strip() or 'General'
        groups.setdefault(key, []).append(record)
    batches = []
    for topic, records in groups.items():
        ordered = sorted(records, key=lambda row: row.get('item_number') or 0)
        for start in range(0, len(ordered), size):
            batches.append({'topic': topic, 'items': ordered[start:start + size]})
    return batches


def pack_source_batches(batches, size=8, char_budget=0):
    """Join topic batches into one model call until the next batch would pass `size` items.

    ``source_batches`` already slices a long topic. This only combines shorter ones.
    ``char_budget`` splits a group before the prompt gets large enough to slow the reply.
    """
    packed = []
    current = []
    count = 0
    chars = 0
    for batch in batches or []:
        item_count = len(batch.get('items') or [])
        if item_count <= 0:
            continue
        weight = len(str(batch.get('passages') or '')) + 180 * item_count
        over_size = current and count + item_count > size
        over_chars = current and char_budget and chars + weight > char_budget
        if over_size or over_chars:
            packed.append(current)
            current = []
            count = 0
            chars = 0
        current.append(batch)
        count += item_count
        chars += weight
    if current:
        packed.append(current)
    return packed


def verdicts_without_passages(items):
    """Skip the model when a topic has nothing to judge the answer against."""
    verdicts = []
    for item in items or []:
        item_id = str(item.get('item_id') or '')
        if not item_id:
            continue
        verdicts.append({
            'item_id': item_id,
            'verdict': 'unsupported',
            'evidence': 'No source passage was retrieved for this topic.',
        })
    return verdicts


def source_check_max_tokens(item_count):
    """Room for one evidence sentence per item.

    A 60-token allowance cut the reply off, so the last items in a long
    batch came back with no verdict.
    """
    count = max(1, int(item_count or 1))
    return min(2048, max(384, count * 140))


def _clip_passages(text, limit=_PASSAGE_CHAR_LIMIT):
    text = str(text or '').strip()
    if len(text) <= limit:
        return text
    clipped = text[:limit].rsplit(' ', 1)[0].strip()
    return (clipped or text[:limit]) + '…'


def _item_payload(items):
    payload = []
    for item in items or []:
        choices = item.get('choices') or []
        rendered = []
        for index, choice in enumerate(choices):
            letter = chr(ord('A') + index)
            rendered.append(f"{letter}. {choice}")
        payload.append({
            'item_id': item.get('item_id'),
            'item_number': item.get('item_number'),
            'question_text': item.get('question_text'),
            'choices': rendered,
            'correct_answer': item.get('correct_answer'),
            'answer_key': item.get('answer_key'),
        })
    return payload


def grouped_source_check_prompt(groups):
    """One prompt for several topics. Each item is judged only on its own passages."""
    blocks = []
    for group in groups or []:
        passages = _clip_passages(group.get('passages')) or '(no passages retrieved)'
        blocks.append(
            f"Topic: {group.get('topic') or 'General'}\n\n"
            f"SOURCE PASSAGES:\n{passages}\n\n"
            f"ITEMS:\n{json.dumps(_item_payload(group.get('items')), ensure_ascii=False)}"
        )
    system = (
        'You check whether assessment answers are supported by the source passages. '
        'Judge each item only against the passages under its own topic. '
        'Reply with JSON only, no markdown.'
    )
    user = (
        "\n\n".join(blocks)
        + "\n\nFor each item decide one verdict:\n"
        "- supported: the passages already state the idea the keyed answer uses. "
        "A new case of that idea is supported. "
        "If the passages say a poor medical interface can cause harm, a new question about small touch targets on a hospital screen is supported.\n"
        "- unsupported: the keyed answer depends on a named heuristic, scale, or standard the passages never name\n"
        "- contradicted: those passages state the opposite of the keyed answer\n\n"
        'Return {"results": [{"item_id": "<id>", "verdict": "supported|unsupported|contradicted", '
        '"evidence": "<one sentence>"}]}'
    )
    return system, user


def source_check_prompt(topic, items, passages):
    return grouped_source_check_prompt([{
        'topic': topic,
        'items': items,
        'passages': passages,
    }])


def run_grouped_source_checks(groups, complete, workers=SOURCE_CHECK_WORKERS):
    """Run one model call per packed group. ``complete(group)`` returns the raw reply."""
    pending = [group for group in (groups or []) if group]
    if not pending:
        return [], []

    def one(group):
        return parse_source_results(complete(group))

    worker_count = max(1, min(int(workers or 1), len(pending)))
    if worker_count == 1:
        return _collect_group_results(pending, one)

    results = []
    errors = []
    with ThreadPoolExecutor(max_workers=worker_count) as pool:
        futures = {pool.submit(one, group): group for group in pending}
        for future in as_completed(futures):
            _take_group_result(futures[future], future.result, results, errors)
    return results, errors


def _collect_group_results(groups, one):
    results = []
    errors = []
    for group in groups:
        _take_group_result(group, lambda: one(group), results, errors)
    return results, errors


def _take_group_result(group, call, results, errors):
    topics = ', '.join(str(row.get('topic') or 'topic') for row in group)
    try:
        results.extend(call())
    except Exception as exc:
        logger.exception('Assessment source check failed for %s', topics)
        errors.append(f'{topics}: {exc}')


def _load_json_payload(text):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None


def _salvage_result_objects(text):
    """Keep finished verdict objects when the reply is cut off mid-array."""
    rows = []
    for match in re.finditer(r'\{[^{}]*\}', text):
        try:
            row = json.loads(match.group(0))
        except json.JSONDecodeError:
            continue
        if isinstance(row, dict) and row.get('item_id'):
            rows.append(row)
    return rows


def parse_source_results(raw):
    text = str(raw or '').strip()
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text).strip()
    payload = _load_json_payload(text)
    rows = None
    if isinstance(payload, dict):
        rows = payload.get('results')
    elif isinstance(payload, list):
        rows = payload
    if not isinstance(rows, list) or not rows:
        rows = _salvage_result_objects(text)
    if not isinstance(rows, list):
        return []
    parsed = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        verdict = str(row.get('verdict') or '').strip().lower()
        if verdict not in SOURCE_LABELS:
            verdict = 'unchecked'
        parsed.append({
            'item_id': str(row.get('item_id') or ''),
            'verdict': verdict,
            'evidence': str(row.get('evidence') or '').strip(),
        })
    return parsed


def source_check_failure_message(error):
    """One short reason when a model call fails, instead of every topic repeated."""
    text = str(error or '').strip()
    if not text:
        return ''
    if 'paused' in text.lower():
        return 'The source check did not run because the model keys are paused. Run it again after they reset.'
    parts = []
    for part in re.split(r';\s*', text):
        part = part.strip()
        if part and part not in parts:
            parts.append(part)
    return parts[0] if len(parts) > 1 else text


def apply_source_results(report, results, error=''):
    by_id = {row['item_id']: row for row in results or [] if row.get('item_id')}
    items = {}
    for item_id, record in (report.get('items') or {}).items():
        next_record = dict(record)
        next_record['details'] = list(record.get('details') or [])
        if str(item_id).startswith('missing-') or not str(record.get('question_text') or '').strip():
            next_record['source'] = 'unchecked'
            next_record['evidence'] = 'No saved question to check.'
        elif item_id in by_id:
            next_record['source'] = by_id[item_id]['verdict']
            next_record['evidence'] = by_id[item_id]['evidence']
        else:
            next_record['source'] = 'unchecked'
            next_record['evidence'] = (
                source_check_failure_message(error)
                or 'The source check did not return a verdict for this item.'
            )
        next_record.pop('choices', None)
        next_record.pop('correct_answer', None)
        next_record.pop('answer_key', None)
        next_record.pop('question_text', None)
        items[item_id] = next_record
    return _finalize({
        'allocation_ok': report.get('allocation_ok', False),
        'allocation_details': list(report.get('allocation_details') or []),
        'items': items,
    })


def _finalize(report):
    items = report.get('items') or {}
    passed = 0
    for record in items.values():
        record['passed'] = bool(
            record.get('tos_ok') and record.get('bloom_ok') and record.get('source') == 'supported'
        )
        if record['passed']:
            passed += 1
    ready = bool(items) and passed == len(items) and report.get('allocation_ok')
    return {
        'allocation_ok': bool(report.get('allocation_ok')),
        'allocation_details': list(report.get('allocation_details') or []),
        'summary': {
            'items': len(items),
            'passed': passed,
            'failed': len(items) - passed,
        },
        'ready_to_approve': ready,
        'items': items,
    }


def approval_blockers(report, notes_by_item_id, allocation_note=''):
    """An item may be approved when it passed, or when the faculty wrote an override note."""
    if not isinstance(report, dict) or not report.get('items'):
        return ['Run the quality check before approving.']
    notes = notes_by_item_id or {}
    blockers = []
    if not report.get('allocation_ok') and not str(allocation_note or '').strip():
        blockers.extend(report.get('allocation_details') or ['TOS allocation does not match the saved items.'])
    for item_id, record in report['items'].items():
        note = str(notes.get(item_id) or notes.get(str(record.get('item_number'))) or '').strip()
        if record.get('passed'):
            continue
        if note:
            continue
        blockers.append(
            f"Item {record.get('item_number')} needs a pass or an override note."
        )
    return blockers
