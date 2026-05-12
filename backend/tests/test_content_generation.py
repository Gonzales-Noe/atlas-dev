"""
Content-generation comparison test for all LLM providers.

Sends a realistic module-generation request ("Analytics Techniques and Tools")
through CoTPromptBuilder → LLMService for every provider, then scores each
response on structure completeness, length, and section coverage so you can
decide which provider to use.

Run from repo root:
    .venv\\Scripts\\python.exe backend/tests/test_content_generation.py

Filter providers:
    .venv\\Scripts\\python.exe backend/tests/test_content_generation.py --providers gemini,groq,anthropic

Save full responses to a file:
    .venv\\Scripts\\python.exe backend/tests/test_content_generation.py --save-output results.txt

Increase token budget (default 1500):
    .venv\\Scripts\\python.exe backend/tests/test_content_generation.py --max-tokens 2500
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import textwrap
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DIVIDER = "=" * 76
SUB_DIV = "-" * 76
PASS_MARK = "[PASS]"
FAIL_MARK = "[FAIL]"
WARN_MARK = "[WARN]"

DEFAULT_PROVIDERS = ["gemini", "gpt", "groq", "anthropic", "openrouter"]

# The five required section headings produced by CoTPromptBuilder.build_module_prompt
REQUIRED_SECTIONS = [
    "MODULE OVERVIEW",
    "MODULE LEARNING OUTCOMES",
    "INSTRUCTIONAL SEQUENCE",
    "FORMATIVE ASSESSMENT",
    "INSTRUCTIONAL MATERIALS",
]

# Module parameters for the generation task
COURSE_NAME   = "Business Analytics"
MODULE_TITLE  = "Analytics Techniques and Tools"
WEEK_NUMBER   = 4


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare LLM providers on a realistic module-generation task."
    )
    parser.add_argument(
        "--providers",
        default=",".join(DEFAULT_PROVIDERS),
        help="Comma-separated list of providers to test.",
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=1500,
        help="Token budget per provider (default: 1500).",
    )
    parser.add_argument(
        "--save-output",
        metavar="FILE",
        default=None,
        help="Write the full report (including raw responses) to a text file.",
    )
    return parser.parse_args()


def normalize_providers(raw: str) -> list[str]:
    providers = [p.strip().lower() for p in raw.split(",") if p.strip()]
    invalid = [p for p in providers if p not in DEFAULT_PROVIDERS]
    if invalid:
        raise ValueError(
            f"Unknown provider(s): {', '.join(invalid)}. "
            f"Valid: {', '.join(DEFAULT_PROVIDERS)}"
        )
    if not providers:
        raise ValueError("No providers specified.")
    return providers


# ---------------------------------------------------------------------------
# Django bootstrap
# ---------------------------------------------------------------------------

def configure_django() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    backend_root = repo_root / "backend"
    sys.path.insert(0, str(repo_root))
    sys.path.insert(0, str(backend_root))

    # Load .env so API keys are available (mirrors what manage.py does)
    try:
        from dotenv import load_dotenv  # type: ignore
        env_file = backend_root / ".env"
        if env_file.exists():
            load_dotenv(str(env_file))
    except ImportError:
        pass  # python-dotenv not installed; rely on shell environment

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "atlas.settings.dev")
    import django
    django.setup()


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def score_response(text: str) -> dict:
    """
    Return a dict with individual scores and a total out of 100.

    Scoring rubric
    ──────────────
    word_count      (30 pts)  — rewards longer, richer output up to ~700 words
    sections_found  (40 pts)  — 8 pts per required section heading detected
    has_mlo_bullets (10 pts)  — at least two bullet/numbered MLO lines
    has_table_rows  (10 pts)  — evidence of a time-plan / table (|  or numbered rows)
    no_truncation   (10 pts)  — response doesn't look cut off mid-sentence
    """
    words = text.split()
    word_count = len(words)

    # Word-count score (30 pts, cap at 700 words)
    wc_score = min(30, round((word_count / 700) * 30))

    # Section coverage (8 pts each, 40 pts total)
    upper = text.upper()
    sections_hit = sum(1 for s in REQUIRED_SECTIONS if s in upper)
    section_score = sections_hit * 8

    # MLO bullets: lines that start with a dash, bullet, or digit followed by dot/paren
    mlo_pattern = re.compile(r"^\s*[-•*]\s+.+|^\s*\d+[.)]\s+.+", re.MULTILINE)
    bullet_lines = mlo_pattern.findall(text)
    mlo_score = 10 if len(bullet_lines) >= 2 else (5 if len(bullet_lines) == 1 else 0)

    # Table rows: pipe-delimited or repeated whitespace columns
    table_pattern = re.compile(r"\|.+\|", re.MULTILINE)
    has_table = bool(table_pattern.search(text))
    table_score = 10 if has_table else 0

    # Truncation check: last non-empty line ends with punctuation or a closing word
    lines = [l for l in text.splitlines() if l.strip()]
    last_line = lines[-1].strip() if lines else ""
    truncated = not bool(re.search(r"[.!?:\"'`)\]}\-–—]$", last_line))
    truncation_score = 0 if truncated else 10

    total = wc_score + section_score + mlo_score + table_score + truncation_score

    return {
        "word_count":        word_count,
        "wc_score":          wc_score,
        "sections_found":    sections_hit,
        "section_score":     section_score,
        "mlo_score":         mlo_score,
        "table_score":       table_score,
        "truncation_score":  truncation_score,
        "total":             total,
        "truncated":         truncated,
    }


def score_label(total: int) -> str:
    if total >= 85:
        return "Excellent"
    if total >= 70:
        return "Good"
    if total >= 50:
        return "Fair"
    return "Poor"


# ---------------------------------------------------------------------------
# Report helpers
# ---------------------------------------------------------------------------

def fmt_score_row(label: str, score: int, max_score: int) -> str:
    bar_len = round((score / max_score) * 20) if max_score else 0
    bar = "#" * bar_len + "." * (20 - bar_len)
    return f"  {label:<24} {score:>3}/{max_score:<3}  [{bar}]"


def print_scorecard(provider: str, sc: dict, elapsed: float) -> None:
    total = sc["total"]
    print(f"\n  Score breakdown for: {provider.upper()}")
    print(f"  {'─' * 50}")
    print(fmt_score_row("Word count",           sc["wc_score"],         30))
    print(fmt_score_row("Sections detected",    sc["section_score"],    40))
    print(fmt_score_row("MLO bullets",          sc["mlo_score"],        10))
    print(fmt_score_row("Table / time-plan",    sc["table_score"],      10))
    print(fmt_score_row("Clean ending",         sc["truncation_score"], 10))
    print(f"  {'─' * 50}")
    print(f"  TOTAL  {total}/100  →  {score_label(total)}")
    print(f"  Words: {sc['word_count']}   Sections found: {sc['sections_found']}/5"
          f"   Time: {elapsed:.1f}s")
    if sc["truncated"]:
        print(f"  {WARN_MARK} Response may be truncated — try --max-tokens with a higher value.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    args = parse_args()

    output_lines: list[str] = []

    def emit(line: str = "") -> None:
        """Print and optionally collect for file output."""
        print(line)
        output_lines.append(line)

    emit(f"\n{DIVIDER}")
    emit("  ATLAS Content-Generation Model Comparison")
    emit(f"  Task: Generate a teaching module — \"{MODULE_TITLE}\"")
    emit(f"  Course: {COURSE_NAME}  |  Week: {WEEK_NUMBER}")
    emit(DIVIDER)

    try:
        providers = normalize_providers(args.providers)
    except ValueError as exc:
        emit(f"{FAIL_MARK} {exc}")
        return 2

    try:
        configure_django()
    except Exception as exc:
        emit(f"{FAIL_MARK} Django setup failed: {exc}")
        return 2

    from apps.integrations.llm_service import LLMService
    from apps.integrations.cot_prompt_builder import CoTPromptBuilder

    llm = LLMService()

    # Build the prompt once (no RAG chunks — pure model quality test)
    system_prompt, user_prompt = CoTPromptBuilder.build_module_prompt(
        course_name=COURSE_NAME,
        module_title=MODULE_TITLE,
        week_number=WEEK_NUMBER,
        context_chunks=[],          # no RAG material — tests model's own knowledge
        extra_instructions="",
    )

    emit(f"\nMax tokens per provider : {args.max_tokens}")
    emit(f"Providers to test       : {', '.join(providers)}")
    emit(f"RAG context             : none (pure model knowledge test)\n")

    results: list[dict] = []

    for provider in providers:
        provider_backend, model = llm.get_provider_and_model(provider)
        emit(f"\n{DIVIDER}")
        emit(f"  Provider : {provider.upper()}   →   {provider_backend}/{model}")
        emit(SUB_DIV)

        t_start = time.perf_counter()
        try:
            response = llm.generate_response(
                messages=[{"role": "user", "content": user_prompt}],
                provider_choice=provider,
                system=system_prompt,
                max_tokens=args.max_tokens,
            )
            elapsed = time.perf_counter() - t_start

            if not isinstance(response, str) or not response.strip():
                emit(f"{FAIL_MARK} {provider}: empty or non-text response")
                results.append({"provider": provider, "model": model, "error": "empty response",
                                 "elapsed": elapsed, "score": None, "response": ""})
                continue

            sc = score_response(response)
            print_scorecard(provider, sc, elapsed)
            emit("")

            # Preview (first 400 chars, wrapped)
            preview = response.strip()[:400].replace("\n", " ")
            emit("  Response preview (first 400 chars):")
            emit(textwrap.fill(preview, width=72, initial_indent="  ", subsequent_indent="  "))

            results.append({
                "provider": provider,
                "model":    model,
                "error":    None,
                "elapsed":  elapsed,
                "score":    sc,
                "response": response,
            })

        except Exception as exc:
            elapsed = time.perf_counter() - t_start
            msg = str(exc).strip() or repr(exc)
            emit(f"{FAIL_MARK} {provider}: {msg}")
            results.append({"provider": provider, "model": model, "error": msg,
                             "elapsed": elapsed, "score": None, "response": ""})

    # ------------------------------------------------------------------
    # Summary table
    # ------------------------------------------------------------------
    emit(f"\n\n{DIVIDER}")
    emit("  SUMMARY — Module Generation Quality Ranking")
    emit(DIVIDER)

    header = f"  {'Provider':<14} {'Model':<40} {'Score':>5}  {'Grade':<10}  {'Time':>6}  Status"
    emit(header)
    emit(f"  {'─'*14}  {'─'*40}  {'─'*5}  {'─'*10}  {'─'*6}  {'─'*10}")

    # Sort by score descending (errors go last)
    ranked = sorted(
        results,
        key=lambda r: r["score"]["total"] if r["score"] else -1,
        reverse=True,
    )
    for r in ranked:
        if r["score"]:
            total = r["score"]["total"]
            grade = score_label(total)
            status = PASS_MARK
            score_str = f"{total:>5}"
        else:
            total = -1
            grade = "Error"
            status = FAIL_MARK
            score_str = "  N/A"

        model_short = r["model"][:40]
        emit(
            f"  {r['provider']:<14} {model_short:<40} {score_str}  {grade:<10}  "
            f"{r['elapsed']:>5.1f}s  {status}"
        )

    # Winner callout
    winners = [r for r in ranked if r["score"] and r["score"]["total"] >= 70]
    if winners:
        best = winners[0]
        emit(f"\n  Recommended: {best['provider'].upper()} ({best['model']}) "
             f"— score {best['score']['total']}/100")
    else:
        emit(f"\n  {WARN_MARK} No provider scored ≥ 70. Try increasing --max-tokens.")

    # ------------------------------------------------------------------
    # Save full responses if requested
    # ------------------------------------------------------------------
    if args.save_output:
        try:
            save_path = Path(args.save_output)
            with save_path.open("w", encoding="utf-8") as fh:
                fh.write("\n".join(output_lines))
                fh.write("\n\n" + DIVIDER + "\n")
                fh.write("  FULL RESPONSES\n")
                fh.write(DIVIDER + "\n\n")
                for r in ranked:
                    fh.write(f"{'='*76}\n")
                    fh.write(f"  PROVIDER: {r['provider'].upper()}  |  MODEL: {r['model']}\n")
                    fh.write(f"{'='*76}\n")
                    if r["response"]:
                        fh.write(r["response"])
                    else:
                        fh.write(f"(No response — error: {r['error']})")
                    fh.write("\n\n")
            emit(f"\n  Full responses saved to: {save_path.resolve()}")
        except OSError as exc:
            emit(f"\n  {WARN_MARK} Could not save output: {exc}")

    emit(f"\n{DIVIDER}\n")

    errors = [r for r in results if r["error"]]
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
