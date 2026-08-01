# ADR-006: Self-hosted open-weight models only; no runtime LLM APIs

Status: accepted · 2026-08-01

**Decision.** The deployed runtime never calls OpenAI, Anthropic, Gemini, or
any hosted LLM API. Inference runs on vLLM inside the project's GCP network
(private GKE endpoint) using open weights. Configurable profiles per spec §6.2
(accuracy: Qwen3-30B-A3B + Gemma verifier; cost: Qwen3-14B class; degraded:
deterministic-only with fixture extraction and no auto-approval). Profile
selection is gated on a reproducible benchmark (spec §6.3), not model size.

The LLM layer is advisory only: structured extraction, recommendation,
critique, explanation — all Pydantic-validated with evidence IDs, orchestrated
by a fixed LangGraph state machine (no free-roaming loops, max one
analyst/critic revision). No model output can trigger a financial action; the
deterministic decision service and OPA sit between every model artifact and
money. Claude Code is a development tool only and is not a runtime dependency.
