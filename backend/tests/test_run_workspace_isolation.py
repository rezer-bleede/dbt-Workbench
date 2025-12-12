import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database.connection import Base
from app.database.models import models as db_models
from app.database.services import dbt_service


def _session():
    engine = create_engine("sqlite:///:memory:")
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    return TestingSessionLocal()


def _make_workspace(session, key: str) -> db_models.Workspace:
    workspace = db_models.Workspace(
        key=key,
        name=f"Workspace {key}",
        description=None,
        artifacts_path=f"/tmp/{key}",
        created_at=datetime.datetime.utcnow(),
        updated_at=datetime.datetime.utcnow(),
        is_active=True,
    )
    session.add(workspace)
    session.commit()
    session.refresh(workspace)
    return workspace


def _make_run(session, workspace_id: int, idx: int) -> db_models.Run:
    run = db_models.Run(
        run_id=f"run-{workspace_id}-{idx}",
        command="dbt test",
        timestamp=datetime.datetime.utcnow(),
        status="success",
        summary={"ok": True},
        workspace_id=workspace_id,
    )
    session.add(run)
    session.commit()
    session.refresh(run)
    return run


def test_run_queries_are_scoped_to_workspace():
    session = _session()
    workspace_one = _make_workspace(session, "one")
    workspace_two = _make_workspace(session, "two")

    run_one = _make_run(session, workspace_one.id, 1)
    _make_run(session, workspace_two.id, 2)

    runs_in_one = dbt_service.get_runs(session, workspace_id=workspace_one.id)
    assert [r.id for r in runs_in_one] == [run_one.id]

    runs_all = dbt_service.get_runs(session)
    assert len(runs_all) == 2


def test_get_run_respects_workspace_context():
    session = _session()
    workspace_one = _make_workspace(session, "one")
    workspace_two = _make_workspace(session, "two")

    run_one = _make_run(session, workspace_one.id, 1)
    _make_run(session, workspace_two.id, 2)

    fetched_same = dbt_service.get_run(session, run_one.id, workspace_id=workspace_one.id)
    assert fetched_same is not None

    fetched_other = dbt_service.get_run(session, run_one.id, workspace_id=workspace_two.id)
    assert fetched_other is None
