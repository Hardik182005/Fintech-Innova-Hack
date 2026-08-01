"""The evaluation harness: a labelled corpus and a runner that executes it
against real system code.

`cases.py` holds the corpus — expectations drawn from the spec's fail-closed
rules, not from what the code currently does. `runner.py` executes every case
against the production passport service, decision engine and model gateway,
and writes one EvaluationResult per case so credence.api.system_intelligence
can publish four of the six Assurance Score components from measured results
rather than reporting not_evaluated.
"""

from credence.evaluation.cases import (
    AGREEMENT,
    ALL_CASES,
    CONTAINMENT,
    DECISION_CASES,
    EVIDENCE_CASES,
    GROUNDING,
    IDENTITY,
    IDENTITY_CASES,
)
from credence.evaluation.runner import (
    EVALUATION_STAGE,
    CaseOutcome,
    EvaluationRun,
    run_decision_cases,
    run_evaluation_suite,
    run_evidence_cases,
    run_identity_cases,
)

__all__ = [
    "AGREEMENT",
    "ALL_CASES",
    "CONTAINMENT",
    "DECISION_CASES",
    "EVALUATION_STAGE",
    "EVIDENCE_CASES",
    "GROUNDING",
    "IDENTITY",
    "IDENTITY_CASES",
    "CaseOutcome",
    "EvaluationRun",
    "run_decision_cases",
    "run_evaluation_suite",
    "run_evidence_cases",
    "run_identity_cases",
]
