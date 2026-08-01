.PHONY: install test lint typecheck security api up down opa-test all

install:
	uv sync

test:
	uv run pytest tests/unit -q

lint:
	uv run ruff check credence tests

typecheck:
	uv run mypy credence

security:
	uv run bandit -r credence -q

api:
	uv run uvicorn credence.api.app:app --reload --port 8000

up:
	docker compose up -d postgres opa

down:
	docker compose down

opa-test:
	docker run --rm -v $(CURDIR)/credence/policy/rego:/policies openpolicyagent/opa:1.4.2 test /policies -v

all: lint typecheck test
