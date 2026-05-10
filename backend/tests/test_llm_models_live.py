"""
Live LLM provider smoke test.

This script verifies that each selected provider/model in LLMService can:
1) accept a prompt
2) generate a non-empty textual response

Run from repo root:
    .venv\\Scripts\\python.exe backend/tests/test_llm_models_live.py

Optional:
    .venv\\Scripts\\python.exe backend/tests/test_llm_models_live.py --providers gemini,gpt,groq,anthropic,openrouter
    .venv\\Scripts\\python.exe backend/tests/test_llm_models_live.py --max-tokens 120
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


DIVIDER = "=" * 72
PASS_MARK = "[PASS]"
FAIL_MARK = "[FAIL]"
WARN_MARK = "[WARN]"

DEFAULT_PROVIDERS = ["ollama", "gemini", "gpt", "groq", "anthropic", "openrouter"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a live generation check for selected LLM providers."
    )
    parser.add_argument(
        "--providers",
        default=",".join(DEFAULT_PROVIDERS),
        help="Comma-separated providers (ollama,gemini,gpt,groq,anthropic,openrouter)",
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=120,
        help="Max tokens for each provider request (default: 120)",
    )
    parser.add_argument(
        "--prompt",
        default=(
            "Create a concise two-sentence explanation of outcomes-based education "
            "for college instructors."
        ),
        help="Prompt sent to each selected provider",
    )
    return parser.parse_args()


def normalize_providers(raw_value: str) -> list[str]:
    providers = [p.strip().lower() for p in raw_value.split(",") if p.strip()]
    invalid = [p for p in providers if p not in DEFAULT_PROVIDERS]
    if invalid:
        raise ValueError(
            f"Unsupported provider(s): {', '.join(invalid)}. "
            f"Valid values: {', '.join(DEFAULT_PROVIDERS)}"
        )
    if not providers:
        raise ValueError("No providers were specified.")
    return providers


def configure_django() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    backend_root = repo_root / "backend"

    sys.path.insert(0, str(repo_root))
    sys.path.insert(0, str(backend_root))

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "atlas.settings.dev")

    import django  # pylint: disable=import-outside-toplevel

    django.setup()


def is_valid_generation(text: str) -> bool:
    if not text:
        return False
    stripped = text.strip()
    if len(stripped) < 20:
        return False
    words = stripped.split()
    return len(words) >= 4


def main() -> int:
    print(f"\n{DIVIDER}")
    print("  ATLAS Live LLM Provider Test")
    print(DIVIDER)

    args = parse_args()

    try:
        providers = normalize_providers(args.providers)
    except ValueError as exc:
        print(f"{FAIL_MARK} {exc}")
        return 2

    try:
        configure_django()
    except Exception as exc:  # pragma: no cover - startup failure path
        print(f"{FAIL_MARK} Django setup failed: {exc}")
        return 2

    from apps.integrations.llm_service import LLMService  # pylint: disable=import-outside-toplevel

    llm = LLMService()
    failures: list[str] = []

    print(f"Prompt: {args.prompt}")
    print(f"Providers: {', '.join(providers)}")
    print(f"Max tokens: {args.max_tokens}\n")

    for provider in providers:
        provider_backend, model = llm.get_provider_and_model(provider)
        print(f"{DIVIDER}\nTesting provider='{provider}' mapped to {provider_backend}/{model}")

        try:
            generated = llm.generate_response(
                messages=[{"role": "user", "content": args.prompt}],
                provider_choice=provider,
                max_tokens=args.max_tokens,
            )

            if not isinstance(generated, str):
                failures.append(
                    f"{provider}: response is not text (type={type(generated).__name__})"
                )
                print(f"{FAIL_MARK} {provider}: non-text response")
                continue

            if not is_valid_generation(generated):
                preview = generated.strip().replace("\n", " ")[:180]
                failures.append(f"{provider}: empty/too-short generation. preview='{preview}'")
                print(f"{FAIL_MARK} {provider}: generation is empty or too short")
                continue

            preview = generated.strip().replace("\n", " ")[:180]
            print(f"{PASS_MARK} {provider}: generated content received")
            print(f"Preview: {preview}")

        except Exception as exc:  # noqa: BLE001 - live API test should capture provider errors
            message = str(exc).strip() or repr(exc)
            failures.append(f"{provider}: {message}")
            print(f"{FAIL_MARK} {provider}: {message}")

    print(f"\n{DIVIDER}")
    if failures:
        print(f"{FAIL_MARK} Live LLM provider test failed for {len(failures)} provider(s):")
        for failure in failures:
            print(f" - {failure}")
        return 1

    print(f"{PASS_MARK} All selected providers returned generated content.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
