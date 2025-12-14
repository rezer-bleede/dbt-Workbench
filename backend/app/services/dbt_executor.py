import asyncio
import json
import os
import shutil
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple
import hashlib

from app.core.config import get_settings
from app.core.watcher_manager import get_watcher
from app.database.connection import SessionLocal
from app.database.models import models as db_models
from app.schemas.execution import (
    DbtCommand, RunStatus, RunSummary, RunDetail, 
    LogMessage, ArtifactInfo
)


class DbtExecutor:
    def __init__(self):
        self.settings = get_settings()
        self.active_runs: Dict[str, subprocess.Popen] = {}
        self.run_history: Dict[str, RunDetail] = {}
        # Per-run filesystem context
        self.run_artifacts: Dict[str, str] = {}  # run_id -> per-run artifacts directory
        self.run_workspace_artifacts: Dict[str, str] = {}  # run_id -> workspace artifacts root
        self.run_workspace_ids: Dict[str, Optional[int]] = {}  # run_id -> workspace id
        self.run_project_paths: Dict[str, str] = {}  # run_id -> dbt project path
        
    def generate_run_id(self) -> str:
        """Generate a unique run identifier."""
        return str(uuid.uuid4())
    
    def _get_dbt_command(self, command: DbtCommand, parameters: Dict[str, Any]) -> List[str]:
        """Build the dbt command with parameters."""
        cmd = ["dbt"]
        cmd.extend(command.value.split())
        
        # Add default profiles directory if not specified
        if "profiles_dir" not in parameters:
            profiles_dir = os.path.abspath(self.settings.dbt_profiles_path)
            if os.path.exists(profiles_dir):
                cmd.extend(["--profiles-dir", profiles_dir])
        
        # Add common parameters
        if "select" in parameters:
            cmd.extend(["--select", parameters["select"]])
        if "exclude" in parameters:
            cmd.extend(["--exclude", parameters["exclude"]])
        if "vars" in parameters:
            cmd.extend(["--vars", json.dumps(parameters["vars"])])
        if "profiles_dir" in parameters:
            cmd.extend(["--profiles-dir", parameters["profiles_dir"]])
        if "profile" in parameters:
            cmd.extend(["--profile", parameters["profile"]])
        if "target" in parameters:
            cmd.extend(["--target", parameters["target"]])
        if "full_refresh" in parameters and parameters["full_refresh"]:
            cmd.append("--full-refresh")
        if "fail_fast" in parameters and parameters["fail_fast"]:
            cmd.append("--fail-fast")
        
        # Command-specific parameters
        if command == DbtCommand.TEST:
            if "store_failures" in parameters and parameters["store_failures"]:
                cmd.append("--store-failures")
        elif command == DbtCommand.DOCS_GENERATE:
            if "no_compile" in parameters and parameters["no_compile"]:
                cmd.append("--no-compile")
        
        return cmd
    
    def _create_artifacts_directory(self, run_id: str, base_artifacts_path: str) -> str:
        """Create a directory for storing run artifacts for a specific workspace."""
        artifacts_dir = Path(base_artifacts_path) / "runs" / run_id
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        return str(artifacts_dir)
    
    def _calculate_file_checksum(self, file_path: str) -> str:
        """Calculate SHA256 checksum of a file."""
        sha256_hash = hashlib.sha256()
        try:
            with open(file_path, "rb") as f:
                for byte_block in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(byte_block)
            return sha256_hash.hexdigest()
        except Exception:
            return ""
    
    def _capture_artifacts(self, run_id: str) -> List[ArtifactInfo]:
        """Capture dbt artifacts after run completion.

        This copies artifacts into a per-run directory and also updates the
        workspace-scoped "current state" artifacts directory so other services
        (like ArtifactService) can read the latest state.
        """
        artifacts: List[ArtifactInfo] = []
        artifacts_dir = self.run_artifacts.get(run_id)
        if not artifacts_dir:
            return artifacts

        # Resolve workspace-specific context for this run
        base_artifacts_path = self.run_workspace_artifacts.get(run_id, self.settings.dbt_artifacts_path)
        project_path_str = self.run_project_paths.get(run_id, self.settings.dbt_project_path)

        artifact_files = [
            "manifest.json",
            "run_results.json",
            "catalog.json",
            "sources.json",
            "index.html",  # from docs generate
        ]

        project_path = Path(project_path_str)
        target_dir = project_path / "target"

        for filename in artifact_files:
            source_file = target_dir / filename
            if not source_file.exists():
                continue

            # Copy to run-specific artifacts directory
            dest_file = Path(artifacts_dir) / filename
            shutil.copy2(source_file, dest_file)

            # Also copy to the workspace-scoped artifacts root (current state)
            current_state_file = Path(base_artifacts_path) / filename
            current_state_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_file, current_state_file)

            # Notify watcher to update cache immediately for this workspace
            try:
                watcher = get_watcher(str(base_artifacts_path))
                watcher.on_file_changed(filename)
            except Exception as e:
                # Don't fail the run if watcher update fails
                print(f"Failed to notify watcher: {e}")

            stat = dest_file.stat()
            artifacts.append(
                ArtifactInfo(
                    filename=filename,
                    size_bytes=stat.st_size,
                    last_modified=datetime.fromtimestamp(stat.st_mtime),
                    checksum=self._calculate_file_checksum(str(dest_file)),
                )
            )

        return artifacts
    
    async def start_run(
        self,
        command: DbtCommand,
        parameters: Dict[str, Any],
        description: Optional[str] = None,
        workspace_id: Optional[int] = None,
        artifacts_path: Optional[str] = None,
        project_path: Optional[str] = None,
    ) -> str:
        """Start a new dbt run.

        The run is associated with an optional workspace. If workspace context
        is provided, filesystem paths (project and artifacts) are resolved
        for that workspace; otherwise global defaults are used.
        """
        run_id = self.generate_run_id()

        # Enforce concurrent run limit
        active_count = len([r for r in self.active_runs.values() if r.poll() is None])
        if active_count >= self.settings.max_concurrent_runs:
            raise RuntimeError(f"Maximum concurrent runs ({self.settings.max_concurrent_runs}) exceeded")

        # Resolve workspace-specific paths if needed
        resolved_artifacts_root = artifacts_path
        resolved_project_path = project_path

        if workspace_id is not None and (resolved_artifacts_root is None or resolved_project_path is None):
            db = SessionLocal()
            try:
                workspace = (
                    db.query(db_models.Workspace)
                    .filter(db_models.Workspace.id == workspace_id)
                    .first()
                )
                if workspace and resolved_artifacts_root is None:
                    resolved_artifacts_root = workspace.artifacts_path

                if resolved_project_path is None:
                    repo = (
                        db.query(db_models.GitRepository)
                        .filter(db_models.GitRepository.workspace_id == workspace_id)
                        .first()
                    )
                    if repo:
                        resolved_project_path = repo.directory
            finally:
                db.close()

        # Fall back to global defaults when nothing is resolved
        if resolved_artifacts_root is None:
            resolved_artifacts_root = self.settings.dbt_artifacts_path
        if resolved_project_path is None:
            resolved_project_path = self.settings.dbt_project_path

        # Create initial run record
        run_detail = RunDetail(
            run_id=run_id,
            command=command,
            status=RunStatus.QUEUED,
            start_time=datetime.now(),
            parameters=parameters,
            description=description,
            log_lines=[],
        )
        self.run_history[run_id] = run_detail

        # Store workspace context for the run
        self.run_workspace_ids[run_id] = workspace_id
        self.run_workspace_artifacts[run_id] = resolved_artifacts_root
        self.run_project_paths[run_id] = resolved_project_path

        # Create per-run artifacts directory under the workspace artifacts root
        run_artifacts_dir = self._create_artifacts_directory(run_id, resolved_artifacts_root)
        self.run_artifacts[run_id] = run_artifacts_dir
        run_detail.artifacts_path = run_artifacts_dir

        return run_id
    
    async def execute_run(self, run_id: str) -> None:
        """Execute the dbt run in a subprocess."""
        if run_id not in self.run_history:
            raise ValueError(f"Run {run_id} not found")

        run_detail = self.run_history[run_id]
        run_detail.status = RunStatus.RUNNING

        # Resolve project path for this run (workspace-scoped if available)
        project_path_str = self.run_project_paths.get(run_id, self.settings.dbt_project_path)

        try:
            # Build command
            cmd = self._get_dbt_command(run_detail.command, run_detail.parameters)

            # Start subprocess in the project directory
            process = subprocess.Popen(
                cmd,
                cwd=project_path_str,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True,
            )

            self.active_runs[run_id] = process

            # Read output line by line
            line_number = 0
            while True:
                line = process.stdout.readline()
                if not line and process.poll() is not None:
                    break

                if line:
                    line = line.rstrip()
                    line_number += 1
                    run_detail.log_lines.append(line)

                    # Limit log buffer size
                    if len(run_detail.log_lines) > self.settings.log_buffer_size:
                        run_detail.log_lines = run_detail.log_lines[-self.settings.log_buffer_size :]

            # Wait for completion
            return_code = process.wait()

            # Update run status
            run_detail.end_time = datetime.now()
            run_detail.duration_seconds = (run_detail.end_time - run_detail.start_time).total_seconds()

            if return_code == 0:
                run_detail.status = RunStatus.SUCCEEDED
                # Capture artifacts on success
                artifacts = self._capture_artifacts(run_id)
                run_detail.artifacts_available = len(artifacts) > 0
            else:
                run_detail.status = RunStatus.FAILED
                run_detail.error_message = f"dbt command failed with exit code {return_code}"

        except Exception as e:
            run_detail.status = RunStatus.FAILED
            run_detail.error_message = str(e)
            run_detail.end_time = datetime.now()
            if run_detail.start_time:
                run_detail.duration_seconds = (run_detail.end_time - run_detail.start_time).total_seconds()

        finally:
            # Persist run summary to database run history
            try:
                db = SessionLocal()
                db_run = db.query(db_models.Run).filter(db_models.Run.run_id == run_id).first()
                workspace_id = self.run_workspace_ids.get(run_id)

                if not db_run:
                    db_run = db_models.Run(
                        run_id=run_id,
                        command=run_detail.command.value,
                        timestamp=run_detail.start_time,
                        status=run_detail.status.value,
                        summary={
                            "description": run_detail.description,
                            "error_message": run_detail.error_message,
                            "duration_seconds": run_detail.duration_seconds,
                            "artifacts_available": run_detail.artifacts_available,
                        },
                        workspace_id=workspace_id,
                    )
                else:
                    db_run.status = run_detail.status.value
                    db_run.timestamp = run_detail.start_time
                    db_run.summary = {
                        "description": run_detail.description,
                        "error_message": run_detail.error_message,
                        "duration_seconds": run_detail.duration_seconds,
                        "artifacts_available": run_detail.artifacts_available,
                    }
                    if db_run.workspace_id is None and workspace_id is not None:
                        db_run.workspace_id = workspace_id

                db.add(db_run)
                db.commit()
            except Exception:
                # Database persistence failures must not affect run execution lifecycle
                pass
            finally:
                if "db" in locals():
                    db.close()

            # Clean up process tracking
            if run_id in self.active_runs:
                del self.active_runs[run_id]
    
    async def stream_logs(self, run_id: str) -> AsyncGenerator[LogMessage, None]:
        """Stream logs for a running dbt command."""
        if run_id not in self.run_history:
            raise ValueError(f"Run {run_id} not found")
        
        run_detail = self.run_history[run_id]
        last_line = 0
        
        while True:
            # Yield new log lines
            current_lines = len(run_detail.log_lines)
            if current_lines > last_line:
                for i in range(last_line, current_lines):
                    yield LogMessage(
                        run_id=run_id,
                        timestamp=datetime.now(),
                        level="INFO",
                        message=run_detail.log_lines[i],
                        line_number=i + 1
                    )
                last_line = current_lines
            
            # Check if run is complete
            if run_detail.status in [RunStatus.SUCCEEDED, RunStatus.FAILED, RunStatus.CANCELLED]:
                break
            
            # Wait before checking again
            await asyncio.sleep(0.1)
    
    def get_run_status(self, run_id: str, workspace_id: Optional[int] = None) -> Optional[RunSummary]:
        """Get the current status of a run, optionally scoped to a workspace."""
        if run_id in self.run_history:
            run_detail = self.run_history[run_id]
            stored_workspace_id = self.run_workspace_ids.get(run_id)
            if workspace_id is not None and stored_workspace_id is not None and stored_workspace_id != workspace_id:
                return None

            return RunSummary(
                run_id=run_detail.run_id,
                command=run_detail.command,
                status=run_detail.status,
                start_time=run_detail.start_time,
                end_time=run_detail.end_time,
                duration_seconds=run_detail.duration_seconds,
                description=run_detail.description,
                error_message=run_detail.error_message,
                artifacts_available=run_detail.artifacts_available,
            )

        # Fallback to DB
        try:
            db = SessionLocal()
            query = db.query(db_models.Run).filter(db_models.Run.run_id == run_id)
            if workspace_id is not None:
                query = query.filter(
                    (db_models.Run.workspace_id == workspace_id)
                    | (db_models.Run.workspace_id.is_(None))
                )
            run = query.first()
            if not run:
                return None

            # If the run was previously unscoped, pin it to this workspace
            if workspace_id is not None and run.workspace_id is None:
                run.workspace_id = workspace_id
                db.add(run)
                db.commit()

            # If the run belongs to a different workspace, hide it
            if workspace_id is not None and run.workspace_id is not None and run.workspace_id != workspace_id:
                return None

            summary = run.summary or {}
            return RunSummary(
                run_id=run.run_id,
                command=DbtCommand(run.command) if run.command else DbtCommand.RUN,
                status=RunStatus(run.status) if run.status else RunStatus.FAILED,
                start_time=run.timestamp,
                end_time=None,
                duration_seconds=summary.get("duration_seconds"),
                description=summary.get("description"),
                error_message=summary.get("error_message"),
                artifacts_available=summary.get("artifacts_available", False),
            )
        except Exception as e:
            print(f"Error fetching run status: {e}")
            return None
        finally:
            if "db" in locals():
                db.close()

    def get_run_detail(self, run_id: str, workspace_id: Optional[int] = None) -> Optional[RunDetail]:
        """Get detailed information about a run, optionally scoped to a workspace."""
        # Check in-memory history first
        if run_id in self.run_history:
            stored_workspace_id = self.run_workspace_ids.get(run_id)
            if workspace_id is not None and stored_workspace_id is not None and stored_workspace_id != workspace_id:
                return None
            return self.run_history[run_id]

        # Fallback to DB
        try:
            db = SessionLocal()
            query = db.query(db_models.Run).filter(db_models.Run.run_id == run_id)
            if workspace_id is not None:
                query = query.filter(
                    (db_models.Run.workspace_id == workspace_id)
                    | (db_models.Run.workspace_id.is_(None))
                )
            run = query.first()
            if not run:
                return None

            # Pin unscoped runs to the requesting workspace
            if workspace_id is not None and run.workspace_id is None:
                run.workspace_id = workspace_id
                db.add(run)
                db.commit()

            if workspace_id is not None and run.workspace_id is not None and run.workspace_id != workspace_id:
                return None

            summary = run.summary or {}
            return RunDetail(
                run_id=run.run_id,
                command=DbtCommand(run.command) if run.command else DbtCommand.RUN,
                status=RunStatus(run.status) if run.status else RunStatus.FAILED,
                start_time=run.timestamp,
                end_time=None,
                duration_seconds=summary.get("duration_seconds"),
                description=summary.get("description"),
                error_message=summary.get("error_message"),
                artifacts_available=summary.get("artifacts_available", False),
                parameters={},  # Parameters are not persisted in the DB model today
                log_lines=[],  # Logs are not persisted in DB currently
                artifacts_path=None,  # Artifacts path reconstruction would require additional metadata
            )
        except Exception as e:
            print(f"Error fetching run detail: {e}")
            return None
        finally:
            if "db" in locals():
                db.close()

    def get_run_history(
        self,
        page: int = 1,
        page_size: int = 20,
        workspace_id: Optional[int] = None,
    ) -> Tuple[List[RunSummary], int]:
        """Get paginated run history from database, scoped to a workspace if provided."""
        try:
            db = SessionLocal()
            offset = (page - 1) * page_size

            query = db.query(db_models.Run)
            if workspace_id is not None:
                query = query.filter(db_models.Run.workspace_id == workspace_id)

            total_count = query.count()
            runs = (
                query.order_by(db_models.Run.timestamp.desc())
                .offset(offset)
                .limit(page_size)
                .all()
            )

            history: List[RunSummary] = []
            for run in runs:
                summary = run.summary or {}
                history.append(
                    RunSummary(
                        run_id=run.run_id,
                        command=DbtCommand(run.command) if run.command else DbtCommand.RUN,
                        status=RunStatus(run.status) if run.status else RunStatus.FAILED,
                        start_time=run.timestamp,
                        end_time=None,  # DB model doesn't store end_time explicitly
                        duration_seconds=summary.get("duration_seconds"),
                        description=summary.get("description"),
                        error_message=summary.get("error_message"),
                        artifacts_available=summary.get("artifacts_available", False),
                    )
                )
            return history, total_count
        except Exception as e:
            print(f"Error fetching run history: {e}")
            return [], 0
        finally:
            if "db" in locals():
                db.close()
    
    def get_run_artifacts(self, run_id: str) -> List[ArtifactInfo]:
        """Get artifacts for a specific run."""
        artifacts_path = self.run_artifacts.get(run_id)
        if not artifacts_path or not os.path.exists(artifacts_path):
            return []
        
        artifacts = []
        for filename in os.listdir(artifacts_path):
            file_path = os.path.join(artifacts_path, filename)
            if os.path.isfile(file_path):
                stat = os.stat(file_path)
                artifacts.append(ArtifactInfo(
                    filename=filename,
                    size_bytes=stat.st_size,
                    last_modified=datetime.fromtimestamp(stat.st_mtime),
                    checksum=self._calculate_file_checksum(file_path)
                ))
        
        return artifacts
    
    def cancel_run(self, run_id: str) -> bool:
        """Cancel a running dbt command."""
        if run_id in self.active_runs:
            process = self.active_runs[run_id]
            if process.poll() is None:  # Still running
                process.terminate()
                if run_id in self.run_history:
                    self.run_history[run_id].status = RunStatus.CANCELLED
                    self.run_history[run_id].end_time = datetime.now()
                return True
        return False
    
    def cleanup_old_runs(self) -> None:
        """Clean up old runs to maintain limits."""
        # Clean up run history
        if len(self.run_history) > self.settings.max_run_history:
            runs = list(self.run_history.items())
            runs.sort(key=lambda x: x[1].start_time)

            # Remove oldest runs
            to_remove = len(runs) - self.settings.max_run_history
            for i in range(to_remove):
                run_id, _ = runs[i]
                self.run_history.pop(run_id, None)
                self.run_workspace_ids.pop(run_id, None)
                self.run_workspace_artifacts.pop(run_id, None)
                self.run_project_paths.pop(run_id, None)

        # Clean up artifact sets
        if len(self.run_artifacts) > self.settings.max_artifact_sets:
            artifacts = list(self.run_artifacts.items())
            # Sort by run start time (from run_history)
            artifacts.sort(
                key=lambda x: self.run_history.get(
                    x[0],
                    RunDetail(
                        run_id=x[0],
                        command=DbtCommand.RUN,
                        status=RunStatus.FAILED,
                        start_time=datetime.min,
                        parameters={},
                        description=None,
                        log_lines=[],
                    ),
                ).start_time
            )

            # Remove oldest artifact sets
            to_remove = len(artifacts) - self.settings.max_artifact_sets
            for i in range(to_remove):
                run_id, artifacts_path = artifacts[i]
                # Remove directory
                if os.path.exists(artifacts_path):
                    shutil.rmtree(artifacts_path, ignore_errors=True)
                self.run_artifacts.pop(run_id, None)
                self.run_workspace_ids.pop(run_id, None)
                self.run_workspace_artifacts.pop(run_id, None)
                self.run_project_paths.pop(run_id, None)


# Global executor instance
executor = DbtExecutor()