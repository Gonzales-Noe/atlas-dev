"""
PII masking for RAG / syllabus text before chunking or LLM prompts.

Goals
-----
- Strip high-confidence personal data: emails, PH mobile numbers, signature blocks.
- Optionally mask *labeled* person names (Instructor:, Prepared by:, etc.).
- Do NOT blank bare proper nouns in academic content (Newton, Rizal, Darwin as topics).

The embedding vectors themselves are not searchable for PII; we scan the *text*
that is about to be embedded (and later retrieved into LLM prompts).
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Placeholders kept short so chunk token budgets stay stable.
EMAIL_PLACEHOLDER = "[EMAIL_REDACTED]"
PHONE_PLACEHOLDER = "[PHONE_REDACTED]"
SIGNATURE_PLACEHOLDER = "[SIGNATURE_BLOCK_REDACTED]"
NAME_PLACEHOLDER = "[NAME_REDACTED]"

# ── High-confidence patterns ────────────────────────────────────────────────

# Standard email (avoid matching markdown/email-like noise with spaces).
_EMAIL_RE = re.compile(
    r"(?<![A-Za-z0-9._%+-])"
    r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"
    r"(?![A-Za-z0-9._%+-])",
)

# Philippine mobiles:
#   09XXXXXXXXX, 09XX-XXX-XXXX, +639XXXXXXXXX, +63 9XX XXX XXXX, 639XXXXXXXXX
_PH_MOBILE_RE = re.compile(
    r"(?<!\d)"
    r"(?:"
    r"\+?63[\s\-.]?9\d{2}[\s\-.]?\d{3}[\s\-.]?\d{4}"
    r"|"
    r"09\d{2}[\s\-.]?\d{3}[\s\-.]?\d{4}"
    r")"
    r"(?!\d)",
)

# Landline-ish PH numbers often listed as contact (optional, still personal).
_PH_LANDLINE_RE = re.compile(
    r"(?<!\d)"
    r"(?:\+?63[\s\-.]?)?(?:\(?0?\d{1,4}\)?[\s\-.]?)?\d{3,4}[\s\-.]?\d{4}"
    r"(?!\d)",
)

# Signature / approval blocks: blank the line (and a few following short lines).
_SIGNATURE_HEADER_RE = re.compile(
    r"(?i)^\s*(?:"
    r"prepared\s+by|noted\s+by|checked\s+by|reviewed\s+by|verified\s+by|"
    r"approved\s+by|endorsed\s+by|recommending\s+approval|conforme|"
    r"signature|signed\s+by|faculty\s+signature|instructor'?s?\s+signature|"
    r"student'?s?\s+signature|over\s+printed\s+name|printed\s+name|"
    r"affix\s+signature|sign\s+here"
    r")\s*[:.\-]?\s*.*$",
)

# Underscore / dotted signature lines.
_SIGNATURE_LINE_RE = re.compile(
    r"(?i)^\s*(?:"
    r"_{5,}|-{5,}|\.{5,}|x{5,}|"
    r"\(?\s*signature\s*\)?|"
    r"\(?\s*printed\s+name\s*\)?"
    r")\s*$",
)

# Person-name token: First, optional Middle initial, then 0–3 more capitalized parts.
# Middle initial requires a trailing "." so "Maria Santos" is not split as "Maria" + "S".
# Use [ \t] (not \s) so names cannot span newlines into the next syllabus section.
_PERSON_NAME = (
    r"(?:dr\.?|prof\.?|eng(?:r)?\.?|mr\.?|mrs\.?|ms\.?|atty\.?)?[ \t]*"
    r"[A-Z][A-Za-z'\-]{1,40}"
    r"(?:[ \t]+[A-Z]\.)?"
    r"(?:[ \t]+[A-Z][A-Za-z'\-]{1,40}){0,3}"
)

# Labeled personal-name fields only (never bare "Rizal" in a topic sentence).
_LABELED_NAME_RE = re.compile(
    r"(?i)\b("
    r"instructor|faculty|professor|prof\.?|teacher|lecturer|"
    r"course\s+coordinator|program\s+chair|department\s+chair|"
    r"dean|encoded\s+by|submitted\s+by|authored\s+by|"
    r"contact\s+person|full\s+name|employee\s+name|"
    r"prepared\s+by|noted\s+by|approved\s+by|reviewed\s+by"
    r")[ \t]*[:\-][ \t]*"
    r"(" + _PERSON_NAME + r")"
)

# "Prof. Juan Dela Cruz" / "Mr. Juan Dela Cruz" on its own short line (signature-ish).
_TITLED_NAME_LINE_RE = re.compile(
    r"(?i)^[ \t]*"
    r"(?:dr\.?|prof\.?|eng(?:r)?\.?|mr\.?|mrs\.?|ms\.?|atty\.?)[ \t]+"
    r"[A-Z][A-Za-z'\-]{1,40}"
    r"(?:[ \t]+[A-Z]\.)?"
    r"(?:[ \t]+[A-Z][A-Za-z'\-]{1,40}){1,3}"
    r"[ \t]*$",
)

# Academic / historical name cues — if a "name-like" token appears near these,
# we treat it as content, not PII (defense in depth for labeled patterns).
_ACADEMIC_CONTEXT_RE = re.compile(
    r"(?i)\b(?:"
    r"theory|theorem|law|laws|principle|principles|equation|model|"
    r"algorithm|method|experiment|discovery|works?\s+of|according\s+to|"
    r"philosophy|of\s+[A-Z][a-z]+|"
    r"chapter|unit|lesson|topic|module|week\s+\d+|"
    r"history|literature|biography|studied|study\s+of|"
    r"named\s+after|eponym"
    r")\b",
)

_HIGH_CONFIDENCE_KINDS = frozenset({"email", "ph_mobile"})


@dataclass
class PiiFinding:
    kind: str
    snippet: str
    start: int
    end: int


@dataclass
class MaskResult:
    text: str
    counts: dict = field(default_factory=dict)
    findings_before: list = field(default_factory=list)


def name_masking_enabled() -> bool:
    raw = os.environ.get("PII_MASK_NAMES", "true").strip().lower()
    return raw not in ("0", "false", "no", "off")


def landline_masking_enabled() -> bool:
    """Off by default — landline regex can false-positive on IDs / page refs."""
    raw = os.environ.get("PII_MASK_LANDLINES", "false").strip().lower()
    return raw in ("1", "true", "yes", "on")


def scan_pii(text: str, *, include_names: bool | None = None) -> list[PiiFinding]:
    """Return leftover PII-like spans in *text* (for post-mask verification)."""
    if not text:
        return []
    if include_names is None:
        include_names = name_masking_enabled()

    findings: list[PiiFinding] = []

    for m in _EMAIL_RE.finditer(text):
        findings.append(PiiFinding("email", m.group(0), m.start(), m.end()))

    for m in _PH_MOBILE_RE.finditer(text):
        findings.append(PiiFinding("ph_mobile", m.group(0), m.start(), m.end()))

    if landline_masking_enabled():
        for m in _PH_LANDLINE_RE.finditer(text):
            # Skip spans already covered by mobile matches.
            if any(f.start <= m.start() < f.end for f in findings):
                continue
            findings.append(PiiFinding("ph_landline", m.group(0), m.start(), m.end()))

    if include_names:
        for m in _LABELED_NAME_RE.finditer(text):
            name = (m.group(2) or "").strip()
            if name and not _looks_academic_name_context(text, m.start(), m.end()):
                findings.append(PiiFinding("labeled_name", m.group(0)[:80], m.start(), m.end()))
        for m in _TITLED_NAME_LINE_RE.finditer(text):
            findings.append(PiiFinding("titled_name_line", m.group(0)[:80], m.start(), m.end()))

    for m in _SIGNATURE_HEADER_RE.finditer(text):
        findings.append(PiiFinding("signature_header", m.group(0)[:80], m.start(), m.end()))
    for m in _SIGNATURE_LINE_RE.finditer(text):
        findings.append(PiiFinding("signature_line", m.group(0)[:80], m.start(), m.end()))

    return findings


def _looks_academic_name_context(text: str, start: int, end: int) -> bool:
    """
    True when a match sits inside a clearly academic sentence on the *same line*.

    Only the current line is inspected so a following "Week 3 Topic: …" line
    cannot suppress masking of "Instructor: …" above it.
    """
    line_start = text.rfind("\n", 0, start) + 1
    line_end = text.find("\n", end)
    if line_end < 0:
        line_end = len(text)
    window = text[line_start:line_end]
    return bool(_ACADEMIC_CONTEXT_RE.search(window))


def _mask_signature_blocks(text: str) -> tuple[str, int]:
    """
    Replace signature/approval header lines and up to 3 following short lines
    (often printed name / designation / signature underscores).
    """
    lines = text.split("\n")
    out: list[str] = []
    masked = 0
    i = 0
    while i < len(lines):
        line = lines[i]
        if _SIGNATURE_HEADER_RE.match(line) or _SIGNATURE_LINE_RE.match(line):
            out.append(SIGNATURE_PLACEHOLDER)
            masked += 1
            i += 1
            # Swallow a few trailing short lines that usually hold the printed name.
            swallowed = 0
            while i < len(lines) and swallowed < 3:
                nxt = lines[i]
                if not nxt.strip():
                    out.append(nxt)
                    i += 1
                    continue
                if (
                    _SIGNATURE_HEADER_RE.match(nxt)
                    or _SIGNATURE_LINE_RE.match(nxt)
                    or _TITLED_NAME_LINE_RE.match(nxt)
                    or len(nxt.strip()) <= 80
                ):
                    # Skip the personal line rather than duplicating the placeholder.
                    i += 1
                    swallowed += 1
                    masked += 1
                    continue
                break
            continue
        out.append(line)
        i += 1
    return "\n".join(out), masked


def mask_pii(text: str, *, mask_names: bool | None = None) -> MaskResult:
    """
    Redact PII from *text*. Safe for academic content: bare topic names are kept.
    """
    if not text:
        return MaskResult(text="", counts={})

    if mask_names is None:
        mask_names = name_masking_enabled()

    before = scan_pii(text, include_names=mask_names)
    counts: dict[str, int] = {}
    out = text

    def _sub(pattern: re.Pattern, placeholder: str, kind: str, src: str) -> str:
        def repl(m: re.Match) -> str:
            counts[kind] = counts.get(kind, 0) + 1
            return placeholder

        return pattern.sub(repl, src)

    out = _sub(_EMAIL_RE, EMAIL_PLACEHOLDER, "email", out)
    out = _sub(_PH_MOBILE_RE, PHONE_PLACEHOLDER, "ph_mobile", out)

    if landline_masking_enabled():
        # Only replace landlines that look like contact lines (contain "tel" / "fax" / "phone").
        contact_line = re.compile(r"(?i)^\s*.{0,40}\b(?:tel|telephone|fax|phone|contact|landline)\b.{0,60}$")

        def landline_line_mask(line: str) -> str:
            if not contact_line.match(line):
                return line

            def repl(m: re.Match) -> str:
                counts["ph_landline"] = counts.get("ph_landline", 0) + 1
                return PHONE_PLACEHOLDER

            return _PH_LANDLINE_RE.sub(repl, line)

        out = "\n".join(landline_line_mask(ln) for ln in out.split("\n"))

    out, sig_n = _mask_signature_blocks(out)
    if sig_n:
        counts["signature_block"] = sig_n

    if mask_names:
        def labeled_repl(m: re.Match) -> str:
            # Keep academic "law of X" style false positives if somehow labeled.
            if _looks_academic_name_context(m.string, m.start(), m.end()):
                return m.group(0)
            counts["labeled_name"] = counts.get("labeled_name", 0) + 1
            label = m.group(1)
            return f"{label}: {NAME_PLACEHOLDER}"

        out = _LABELED_NAME_RE.sub(labeled_repl, out)

        def titled_line_repl(m: re.Match) -> str:
            counts["titled_name_line"] = counts.get("titled_name_line", 0) + 1
            return NAME_PLACEHOLDER

        out = _TITLED_NAME_LINE_RE.sub(titled_line_repl, out)

    if counts:
        logger.info("[ATLAS PII] Masked fields: %s", counts)

    return MaskResult(text=out, counts=counts, findings_before=before)


def assert_no_high_confidence_pii(text: str, *, context: str = "chunk") -> list[PiiFinding]:
    """
    Scan text after masking. High-confidence leftovers (email / PH mobile) raise.
    Softer kinds (signature/name) are logged and returned for the caller to remask.
    """
    leftover = scan_pii(text, include_names=name_masking_enabled())
    critical = [f for f in leftover if f.kind in _HIGH_CONFIDENCE_KINDS]
    if critical:
        preview = "; ".join(f"{f.kind}={f.snippet!r}" for f in critical[:5])
        raise ValueError(
            f"PII still present in {context} after masking ({len(critical)} hit(s)): {preview}"
        )
    soft = [f for f in leftover if f.kind not in _HIGH_CONFIDENCE_KINDS]
    if soft:
        logger.warning(
            "[ATLAS PII] Soft leftover in %s (%d): %s",
            context,
            len(soft),
            ", ".join(f.kind for f in soft[:8]),
        )
    return leftover


def mask_and_verify(text: str, *, context: str = "document") -> str:
    """
    Mask once, remask if soft leftovers remain, then require no email/mobile left.
    This is the text that may be embedded and later sent to LLMs.
    """
    result = mask_pii(text)
    out = result.text
    leftover = scan_pii(out)
    soft = [f for f in leftover if f.kind not in _HIGH_CONFIDENCE_KINDS]
    if soft:
        # Second pass catches signature/name lines that survived the first pass.
        out = mask_pii(out).text
    assert_no_high_confidence_pii(out, context=context)
    return out
