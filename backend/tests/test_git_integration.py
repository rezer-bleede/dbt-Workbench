from pathlib import Path

import pytest
from fastapi import HTTPException
from git import Repo
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database.connection import Base
from app.database.models import models as db_models
from app.schemas.git import WriteFileRequest
from app.services import git_service


@pytest.fixture()
def db_session(tmp_path_factory, monkeypatch):
    repo_root = tmp_path_factory.mktemp("repos")
    monkeypatch.setenv("GIT_REPOS_BASE_PATH", str(repo_root))
    monkeypatch.setenv("SINGLE_PROJECT_MODE", "true")
    from app.core.config import get_settings

    get_settings.cache_clear()
    workspace_root = Path(get_settings().git_repos_base_path) / "default"
    workspace_root.mkdir(parents=True, exist_ok=True)

    engine = create_engine("sqlite:///:memory:")
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()

    workspace = db_models.Workspace(
        id=1,
        key="default",
        name="Test Workspace",
        description="",
        artifacts_path=str(tmp_path_factory.mktemp("artifacts")),
        is_active=True,
    )
    session.add(workspace)
    session.commit()
    session.workspace_root = workspace_root
    yield session
    session.close()
    get_settings.cache_clear()


def _create_remote_repo(tmp_path: Path) -> Repo:
    repo = Repo.init(tmp_path)
    sample = tmp_path / "README.md"
    sample.write_text("hello", encoding="utf-8")
    repo.git.add(sample)
    repo.index.commit("initial")
    return repo


def test_connect_status_and_commit(tmp_path, db_session):
    remote_repo = _create_remote_repo(tmp_path / "remote")
    branch = remote_repo.active_branch.name
    local_path = Path(db_session.workspace_root) / "local"

    summary = git_service.connect_repository(
        db_session,
        workspace_id=1,
        remote_url=str(remote_repo.working_tree_dir),
        branch=branch,
        directory=str(local_path),
        provider="local",
        user_id=99,
        username="tester",
    )

    assert summary.remote_url == str(remote_repo.working_tree_dir)
    status = git_service.get_status(db_session, 1)
    assert status.branch == branch
    assert status.is_clean is True

    write_request = WriteFileRequest(path="models/example.sql", content="select 1", message="confirm")
    validation = git_service.write_file(db_session, 1, write_request, user_id=99, username="tester")
    assert validation.is_valid is True
    assert (local_path / "models" / "example.sql").exists()

    commit_hash = git_service.commit_changes(
        db_session,
        workspace_id=1,
        message="add example",
        files=None,
        user_id=99,
        username="tester",
    )
    assert len(commit_hash) == 40

    history = git_service.history(db_session, 1)
    assert history[0].message == "add example"


def test_validation_blocks_invalid_yaml(tmp_path, db_session):
    remote_repo = _create_remote_repo(tmp_path / "remote_yaml")
    branch = remote_repo.active_branch.name
    local_path = Path(db_session.workspace_root) / "yaml_local"
    git_service.connect_repository(
        db_session,
        workspace_id=1,
        remote_url=str(remote_repo.working_tree_dir),
        branch=branch,
        directory=str(local_path),
        provider="local",
        user_id=None,
        username=None,
    )

    bad_yaml = "profiles: [::bad"
    validation = git_service.write_file(
        db_session,
        1,
        WriteFileRequest(path="profiles.yml", content=bad_yaml, message="ack"),
        user_id=None,
        username=None,
    )
    assert validation.is_valid is False
    assert validation.errors


def test_path_traversal_is_blocked(tmp_path, db_session):
    remote_repo = _create_remote_repo(tmp_path / "remote_secure")
    branch = remote_repo.active_branch.name
    local_path = Path(db_session.workspace_root) / "secure_local"

    git_service.connect_repository(
        db_session,
        workspace_id=1,
        remote_url=str(remote_repo.working_tree_dir),
        branch=branch,
        directory=str(local_path),
        provider="local",
        user_id=None,
        username=None,
    )

    with pytest.raises(HTTPException) as excinfo:
        git_service.write_file(
            db_session,
            1,
            WriteFileRequest(path="../escape.sql", content="select 1", message="confirm"),
            user_id=None,
            username=None,
        )
    assert excinfo.value.status_code == 400
    assert excinfo.value.detail["error"] == "forbidden_path"
