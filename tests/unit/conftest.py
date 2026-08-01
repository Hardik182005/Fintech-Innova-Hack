import pytest
from sqlalchemy.orm import Session

import credence.immutability  # noqa: F401 — registers the ORM immutability guard
from credence.db import Base, make_engine, make_session_factory


@pytest.fixture
def session() -> Session:
    engine = make_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    factory = make_session_factory(engine)
    s = factory()
    yield s
    s.close()
    engine.dispose()
