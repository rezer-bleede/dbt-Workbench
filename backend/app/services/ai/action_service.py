from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.core.auth import WorkspaceContext
from app.database.models import models as db_models
from app.schemas.execution import DbtCommand
from app.schemas.sql_workspace import SqlQueryRequest
from app.services import git_service
from app.services.ai.audit_service import AiAuditService
from app.services.dbt_executor import executor
from app.services.sql_workspace_service import get_sql_workspace_service_for_path


class ActionProposalError(RuntimeError):
    pass


class AiActionService:
    def __init__(self):
        self.audit_service = AiAuditService()

    def _validate_pending(self, proposal: db_models.AiActionProposal) -> None:
        if proposal.status != "pending":
            raise ActionProposalError(f"Proposal is not pending (status={proposal.status})")
        if proposal.expires_at and proposal.expires_at < datetime.utcnow():
            raise ActionProposalError("Proposal has expired")

    async def confirm_and_execute(
        self,
        *,
        db: Session,
        workspace: WorkspaceContext,
        proposal: db_models.AiActionProposal,
        user_id: Optional[int],
        username: Optional[str],
        background_tasks: Optional[BackgroundTasks] = None,
    ) -> Dict[str, Any]:
        self._validate_pending(proposal)

        if proposal.proposal_type == "sql_execute":
            result = self._execute_sql(workspace, proposal.payload)
            self.audit_service.update_action_status(
                db,
                proposal=proposal,
                status="executed",
                result_payload=result,
                confirmed_by_user_id=user_id,
            )
            self.audit_service.record_action_audit(
                db,
                workspace_id=workspace.id or 0,
                user_id=user_id,
                username=username,
                action="ai.action.confirm",
                resource="sql_execute",
                metadata={"proposal_id": proposal.proposal_id},
            )
            return result

        if proposal.proposal_type == "dbt_run":
            result = await self._execute_dbt_run(
                db=db,
                workspace=workspace,
                payload=proposal.payload,
                background_tasks=background_tasks,
            )
            self.audit_service.update_action_status(
                db,
                proposal=proposal,
                status="executed",
                result_payload=result,
                confirmed_by_user_id=user_id,
            )
            self.audit_service.record_action_audit(
                db,
                workspace_id=workspace.id or 0,
                user_id=user_id,
                username=username,
                action="ai.action.confirm",
                resource="dbt_run",
                metadata={"proposal_id": proposal.proposal_id},
            )
            return result

        raise ActionProposalError(f"Unsupported proposal type: {proposal.proposal_type}")

    def reject(
        self,
        *,
        db: Session,
        workspace: WorkspaceContext,
        proposal: db_models.AiActionProposal,
        user_id: Optional[int],
        username: Optional[str],
    ) -> Dict[str, Any]:
        self._validate_pending(proposal)
        self.audit_service.update_action_status(
            db,
            proposal=proposal,
            status="rejected",
            result_payload={"message": "Rejected by user"},
            confirmed_by_user_id=user_id,
        )
        self.audit_service.record_action_audit(
            db,
            workspace_id=workspace.id or 0,
            user_id=user_id,
            username=username,
            action="ai.action.reject",
            resource=proposal.proposal_type,
            metadata={"proposal_id": proposal.proposal_id},
        )
        return {
            "proposal_id": proposal.proposal_id,
            "status": "rejected",
        }

    def _execute_sql(self, workspace: WorkspaceContext, payload: Dict[str, Any]) -> Dict[str, Any]:
        sql = payload.get("sql")
        if not sql:
            raise ActionProposalError("Missing SQL in proposal payload")

        request = SqlQueryRequest(
            sql=sql,
            environment_id=payload.get("environment_id"),
            row_limit=payload.get("row_limit"),
            include_profiling=bool(payload.get("include_profiling", False)),
            mode="sql",
        )
        service = get_sql_workspace_service_for_path(workspace.artifacts_path, workspace.id)
        result = service.execute_query(request)
        return result.model_dump()

    async def _execute_dbt_run(
        self,
        *,
        db: Session,
        workspace: WorkspaceContext,
        payload: Dict[str, Any],
        background_tasks: Optional[BackgroundTasks],
    ) -> Dict[str, Any]:
        command_raw = str(payload.get("command") or "run")
        try:
            command = DbtCommand(command_raw)
        except ValueError as exc:
            raise ActionProposalError(f"Unsupported dbt command: {command_raw}") from exc

        parameters = payload.get("parameters") or {}

        project_path = None
        if workspace.id:
            repo = git_service.get_repository(db, workspace.id)
            if repo and repo.directory:
                project_path = repo.directory

        run_id = await executor.start_run(
            command=command,
            parameters=parameters,
            description="AI confirmed execution",
            project_path=project_path,
            artifacts_path=workspace.artifacts_path,
            workspace_id=workspace.id,
        )
        if background_tasks is not None:
            background_tasks.add_task(executor.execute_run, run_id)
        else:
            # Fallback for callers without background task orchestration.
            await executor.execute_run(run_id)

        run_status = executor.get_run_status(run_id)
        return run_status.model_dump() if run_status else {"run_id": run_id}
