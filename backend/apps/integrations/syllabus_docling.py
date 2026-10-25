"""
Build a syllabus outline directly from a DoclingDocument tree
(section headers, texts, tables) — not via Markdown heuristics.
"""

from __future__ import annotations

import logging
import re

from .syllabus_structure import (
    MAX_COLUMNS,
    MAX_SECTIONS,
    MAX_SUBSECTIONS,
    _add_subsection,
    _clean_label,
    _is_noise_label,
    _new_section,
    _norm,
)

logger = logging.getLogger(__name__)

_KV_LABEL_RE = re.compile(r'^([^:]{1,80})\s*:\s*(.*)$')


def _item_text(item):
    text = getattr(item, 'text', None)
    if text:
        return str(text).strip()
    return ''


def _table_columns_and_body(table_item, doc):
    """Return (columns, body_lines) from a Docling TableItem."""
    columns = []
    body_lines = []
    try:
        df = table_item.export_to_dataframe(doc=doc)
        if df is not None and not df.empty:
            columns = [_clean_label(str(c)) for c in list(df.columns)][:MAX_COLUMNS]
            columns = [c for c in columns if c]
            for _, row in df.iterrows():
                cells = [str(v).strip() for v in row.tolist()]
                if any(cells):
                    body_lines.append(' | '.join(c for c in cells if c))
            return columns, body_lines
    except Exception:
        logger.debug('Docling dataframe export failed; trying markdown', exc_info=True)

    try:
        md = table_item.export_to_markdown(doc=doc)
        rows = []
        for line in (md or '').splitlines():
            if not line.strip().startswith('|'):
                continue
            if re.match(r'^\|\s*:?-{3,}', line.strip()):
                continue
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            if cells:
                rows.append(cells)
        if rows:
            columns = [_clean_label(c) for c in rows[0] if c][:MAX_COLUMNS]
            body_lines = [' | '.join(r) for r in rows]
    except Exception:
        logger.debug('Docling table markdown export failed', exc_info=True)
    return columns, body_lines


def _is_key_value_columns(columns, body_lines):
    if len(columns) == 2 and columns:
        return True
    # Single-column-ish "Label: value" lines already handled as text.
    return False


def build_outline_from_docling(doc):
    """
    Walk DoclingDocument items in reading order and build the same outline
    shape used by build_outline(markdown):
    [{label, subsections[{label, table_columns}], table_columns, body}]
    """
    sections = []
    seen = set()
    current = None
    current_sub = None
    pending_sub_table = False

    def start_section(raw_label):
        nonlocal current, current_sub, pending_sub_table
        label = _clean_label(raw_label)
        if _is_noise_label(label):
            return
        if _norm(label) in seen:
            current = next(s for s in sections if _norm(s['label']) == _norm(label))
        else:
            seen.add(_norm(label))
            current = _new_section(label)
            sections.append(current)
        current_sub = None
        pending_sub_table = False

    def start_subsection(raw_label):
        nonlocal current_sub, pending_sub_table
        label = _clean_label(raw_label)
        if _is_noise_label(label):
            return
        if current is None:
            start_section(raw_label)
            return
        _add_subsection(current, label)
        current_sub = next(
            (sub for sub in current['subsections'] if _norm(sub['label']) == _norm(label)),
            None,
        )
        pending_sub_table = current_sub is not None

    try:
        iterator = doc.iterate_items()
    except Exception:
        logger.exception('Docling iterate_items failed')
        return []

    for entry in iterator:
        item = entry[0] if isinstance(entry, tuple) else entry
        level = entry[1] if isinstance(entry, tuple) and len(entry) > 1 else 1
        name = type(item).__name__
        label_attr = str(getattr(item, 'label', '') or '')

        if name == 'SectionHeaderItem' or label_attr == 'section_header':
            text = _item_text(item)
            if not text:
                continue
            # Docling levels: treat shallow headers as sections, deeper as subsections
            if current is None or int(level or 1) <= 2:
                start_section(text)
            else:
                start_subsection(text)
                if current is not None:
                    current['body'].append(_clean_label(text) + ':')
            continue

        if name in {'ListItem', 'TextItem', 'ProofItem', 'FormulaItem'} or label_attr in {
            'text', 'list_item', 'caption', 'footnote', 'paragraph',
        }:
            text = _item_text(item)
            if not text or current is None:
                continue
            # ALL-CAPS short line → subsection
            letters = [c for c in text if c.isalpha()]
            if (
                letters
                and all(c.isupper() for c in letters)
                and 1 <= len(text.split()) <= 8
                and not text.endswith('.')
            ):
                start_subsection(text)
                current['body'].append(text)
                continue
            kv = _KV_LABEL_RE.match(text)
            if kv and 1 <= len(kv.group(1).split()) <= 6:
                clean = _clean_label(kv.group(1))
                if clean and not _is_noise_label(clean):
                    _add_subsection(current, clean)
            current['body'].append(text)
            pending_sub_table = False
            continue

        if name == 'TableItem' or label_attr == 'table':
            if current is None:
                continue
            columns, body_lines = _table_columns_and_body(item, doc)
            # 2-col label/value tables → subsections
            if len(columns) == 2 or _is_key_value_columns(columns, body_lines):
                # Prefer first column cells as subsection labels when body looks like KV
                try:
                    df = item.export_to_dataframe(doc=doc)
                    if df is not None and df.shape[1] == 2:
                        for _, row in df.iterrows():
                            left = _clean_label(str(row.iloc[0]))
                            right = str(row.iloc[1]).strip()
                            if left and not _is_noise_label(left):
                                _add_subsection(current, left)
                            current['body'].append(f'{left}: {right}'.strip(': '))
                        pending_sub_table = False
                        continue
                except Exception:
                    pass
            if columns:
                if pending_sub_table and current_sub is not None and not current_sub.get('table_columns'):
                    current_sub['table_columns'] = columns
                elif not current['table_columns']:
                    current['table_columns'] = columns
            current['body'].extend(body_lines)
            pending_sub_table = False
            continue

        # Skip pictures, page headers/footers furniture, etc.

    while len(sections) > 1 and not (
        sections[0]['body'] or sections[0]['subsections'] or sections[0]['table_columns']
    ):
        sections.pop(0)

    # Cap subsections
    for section in sections:
        section['subsections'] = section['subsections'][:MAX_SUBSECTIONS]
    return sections[:MAX_SECTIONS]


def section_confidence(section, parser='docling'):
    """Heuristic confidence for one outline/syllabus section."""
    base = 0.88 if parser == 'docling' else 0.62
    label = section.get('label') or ''
    score = base
    if not label:
        return 0.2
    if _is_noise_label(label):
        score -= 0.35
    if section.get('table_columns') or section.get('table_enabled'):
        score += 0.05
    subs = section.get('subsections') or []
    if subs:
        score += min(0.06, 0.02 * len(subs))
    body = section.get('body') or section.get('static_content') or ''
    if isinstance(body, list):
        body = '\n'.join(body)
    if section.get('is_static') and not str(body).strip():
        score -= 0.25
    if section.get('key') in {
        'basic', 'details', 'iloat', 'schedule', 'tos', 'grading', 'policies',
    }:
        score += 0.04
    return round(max(0.15, min(0.98, score)), 2)
