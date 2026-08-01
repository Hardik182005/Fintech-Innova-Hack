"""`python -m credence.evaluation` — run the corpus and print what it found.

Exits non-zero when a case fails, so the suite is usable as a gate. A failing
case is a finding about the system, not a broken test: the exit code says the
Assurance Score is below 100%, and the printed detail says which invariant
gave way.

    uv run python -m credence.evaluation                # configured provider
    uv run python -m credence.evaluation --gateway fixture
    uv run python -m credence.evaluation --gateway ollama --json
"""

from __future__ import annotations

import argparse
import json
import sys

from credence.api.deps import get_engine
from credence.config import get_settings
from credence.db import make_session_factory
from credence.evaluation.runner import run_evaluation_suite
from credence.modelgw.gateway import FixtureModelGateway, OllamaGateway


def _build_gateway(choice: str):
    if choice == "fixture":
        return FixtureModelGateway()
    if choice == "ollama":
        return OllamaGateway(get_settings())
    provider = get_settings().model_provider
    # "disabled" builds no gateway at all; the suite falls back to the
    # deterministic fixture rather than silently skipping two metrics.
    return OllamaGateway(get_settings()) if provider == "ollama" else FixtureModelGateway()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m credence.evaluation")
    parser.add_argument(
        "--gateway",
        choices=("auto", "fixture", "ollama"),
        default="auto",
        help="model gateway to evaluate against (default: the configured provider)",
    )
    parser.add_argument(
        "--organization-id",
        default=None,
        help="tenant to attribute the stage-telemetry row to; omit to skip telemetry",
    )
    parser.add_argument("--json", action="store_true", help="print the summary as JSON")
    args = parser.parse_args(argv)

    session = make_session_factory(get_engine())()
    try:
        run = run_evaluation_suite(
            session,
            gateway=_build_gateway(args.gateway),
            organization_id=args.organization_id,
        )
        session.commit()
    finally:
        session.close()

    summary = run.summary()
    if args.json:
        print(json.dumps(summary, indent=2, sort_keys=True))
    else:
        print(f"model_profile: {summary['model_profile']}")
        for metric, stats in summary["metrics"].items():
            rate = stats["rate_ppm"]
            pct = "n/a" if rate is None else f"{rate / 10_000:.2f}%"
            print(f"  {metric:38s} {stats['passed']:>2}/{stats['total']:<2}  {pct}")
        for name, reason in summary["skipped_metrics"].items():
            print(f"  {name:38s} SKIPPED — {reason}")
        for failure in summary["failed_cases"]:
            print(f"\nFAILED {failure['case']} [{failure['kind']}]")
            print(json.dumps(failure["detail"], indent=4, sort_keys=True))
        print(f"\n{summary['cases_passed']}/{summary['cases_run']} cases passed")

    return 1 if run.failures else 0


if __name__ == "__main__":
    sys.exit(main())
