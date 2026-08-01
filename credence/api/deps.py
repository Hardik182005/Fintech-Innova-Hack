"""FastAPI dependencies: DB session, sandbox bearer auth, tenant scoping."""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import Depends, Header, HTTPException
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

import credence.immutability  # noqa: F401 — registers ORM immutability guard
from credence.config import get_settings
from credence.db import Base, make_engine, make_session_factory
from credence.models import User
from credence.services.identity import authenticate

_engine: Engine | None = None
_factory: sessionmaker[Session] | None = None


def init_engine(engine: Engine | None = None) -> Engine:
    """Initialize (or override, in tests) the process engine."""
    global _engine, _factory
    _engine = engine or make_engine(get_settings().database_url)
    Base.metadata.create_all(_engine)  # sandbox bootstrap; Alembic owns prod schema
    _factory = make_session_factory(_engine)
    return _engine


def get_engine() -> Engine:
    if _engine is None:
        init_engine()
    return _engine  # type: ignore[return-value]


def get_session() -> Iterator[Session]:
    if _factory is None:
        init_engine()
    session = _factory()  # type: ignore[misc]
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_current_user(
    session: Session = Depends(get_session),
    authorization: str = Header(default=""),
) -> User:
    token = authorization.removeprefix("Bearer ").strip()
    user = authenticate(session, token)
    if user is None:
        raise HTTPException(status_code=401, detail="invalid or missing bearer token")
    return user


def require_demo_token(x_demo_token: str = Header(default="")) -> None:
    settings = get_settings()
    if not settings.demo_enabled:
        raise HTTPException(status_code=403, detail="demo endpoints are sandbox-only")
    if x_demo_token != settings.demo_reset_token:
        raise HTTPException(status_code=403, detail="invalid demo token")
