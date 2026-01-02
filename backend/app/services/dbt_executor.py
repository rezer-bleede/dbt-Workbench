import asyncio
import json
import os
import shutil
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, AsyncGenerator
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
        self.run_artifacts: Dict[str, str] = {}  # run_id -> artifacts_path
        
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
    
    def _create_artifacts_directory(self, run_id: str) -> str:
        """Create a directory for storing run artifacts."""
        artifacts_dir = Path(self.settings.dbt_artifacts_path) / "runs" / run_id
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
        """Capture dbt artifacts after run completion."""
        artifacts = []
        artifacts_dir = self.run_artifacts.get(run_id)
        if not artifacts_dir:
            return artifacts
        
        project_path = Path(self.settings.dbt_project_path)
        target_dir = project_path / "target"

        if not target_dir.exists():
            return artifacts

        # Copy full target directory so the complete docs site (including assets)
        # is available for the current run and the latest snapshot.
        destinations = [Path(artifacts_dir), Path(self.settings.dbt_artifacts_path)]
        for destination in destinations:
            shutil.copytree(target_dir, destination, dirs_exist_ok=True)

        # Standard dbt artifacts we want metadata for and to notify the watcher about
        artifact_files = [
            "manifest.json",
            "run_results.json",
            "catalog.json",
            "sources.json",
            "index.html",  # from docs generate
        ]
        
        for filename in artifact_files:
            copied_file = Path(artifacts_dir) / filename
            if copied_file.exists():
                # Notify watcher to update cache immediately
                try:
                    watcher = get_watcher(self.settings.dbt_artifacts_path)
                    watcher.on_file_changed(filename)
                except Exception as e:
                    # Don't fail the run if watcher update fails
                    print(f"Failed to notify watcher: {e}")

                # Create artifact info
                stat = copied_file.stat()
                artifacts.append(ArtifactInfo(
                    filename=filename,
                    size_bytes=stat.st_size,
                    last_modified=datetime.fromtimestamp(stat.st_mtime),
                    checksum=self._calculate_file_checksum(str(copied_file))
                ))
        
        return artifacts
    
    async def start_run(
        self, 
        command: DbtCommand, 
        parameters: Dict[str, Any],
        description: Optional[str] = None,
        project_path: Optional[str] = None
    ) -> str:
        """Start a new dbt run."""
        run_id = self.generate_run_id()
        
        # Check concurrent run limit
        active_count = len([r for r in self.active_runs.values() if r.poll() is None])
        if active_count >= self.settings.max_concurrent_runs:
            raise RuntimeError(f"Maximum concurrent runs ({self.settings.max_concurrent_runs}) exceeded")
        
        # Create run record
        run_detail = RunDetail(
            run_id=run_id,
            command=command,
            status=RunStatus.QUEUED,
            start_time=datetime.now(),
            parameters=parameters,
            description=description,
            log_lines=[],
            project_path=project_path
        )
        
        self.run_history[run_id] = run_detail
        
        # Create artifacts directory
        artifacts_path = self._create_artifacts_directory(run_id)
        self.run_artifacts[run_id] = artifacts_path
        run_detail.artifacts_path = artifacts_path
        
        return run_id
    
    async def execute_run(self, run_id: str) -> None:
        """Execute the dbt run in a subprocess."""
        if run_id not in self.run_history:
            raise ValueError(f"Run {run_id} not found")
        
        run_detail = self.run_history[run_id]
        run_detail.status = RunStatus.RUNNING
        
        try:
            # Build command
            cmd = self._get_dbt_command(run_detail.command, run_detail.parameters)
            
            # Determine working directory: prefer run-specific project path, fallback to default
            cwd = run_detail.project_path if run_detail.project_path else self.settings.dbt_project_path
            if not os.path.isabs(cwd):
                cwd = os.path.abspath(cwd)
            
            # Start subprocess
            process = subprocess.Popen(
                cmd,
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True
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
                        run_detail.log_lines = run_detail.log_lines[-self.settings.log_buffer_size:]
            
            # Wait for completion
            return_code = process.wait()
            
            # Update run status
            run_detail.end_time = datetime.now()
            run_detail.duration_seconds = (
                run_detail.end_time - run_detail.start_time
            ).total_seconds()
            
            if return_code == 0:
                run_detail.status = RunStatus.SUCCEEDED
                # Capture artifacts on success
                artifacts = self._capture_artifacts(run_id)
                run_detail.artifacts_available = len(artifacts) > 0
            else:
                run_detail.status = RunStatus.FAILED
                run_detail.error_message = f"dbt command failed with exit code {return_code}"
                if not run_detail.log_lines:
                    run_detail.log_lines.append(run_detail.error_message)

        except Exception as e:
            run_detail.status = RunStatus.FAILED
            run_detail.error_message = str(e)
            run_detail.end_time = datetime.now()
            if run_detail.start_time:
                run_detail.duration_seconds = (
                    run_detail.end_time - run_detail.start_time
                ).total_seconds()
            # Ensure the error is visible in log streams even if no subprocess output exists
            if not run_detail.log_lines:
                run_detail.log_lines.append(run_detail.error_message)

        finally:
            # Persist run summary to database run history
            try:
                db = SessionLocal()
                db_run = db.query(db_models.Run).filter(db_models.Run.run_id == run_id).first()
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
                db.add(db_run)
                db.commit()
            except Exception:
                # Database persistence failures must not affect run execution lifecycle
                pass
            finally:
                if 'db' in locals():
                    db.close()

            # Clean up
            if run_id in self.active_runs:
                del self.active_runs[run_id]
    
    async def stream_logs(self, run_id: str) -> AsyncGenerator[LogMessage, None]:
        """Stream logs for a running dbt command."""
        if run_id not in self.run_history:
            raise ValueError(f"Run {run_id} not found")
        
        run_detail = self.run_history[run_id]
        last_line = 0
        emitted_final = False

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
                if not emitted_final and last_line == current_lines:
                    message = run_detail.error_message or f"Run finished with status {run_detail.status.value}"
                    level = "ERROR" if run_detail.error_message else "INFO"
                    yield LogMessage(
                        run_id=run_id,
                        timestamp=datetime.now(),
                        level=level,
                        message=message,
                        line_number=last_line + 1,
                    )
                    emitted_final = True
                break

            # Wait before checking again
            await asyncio.sleep(0.1)
    
    def get_run_status(self, run_id: str) -> Optional[RunSummary]:
        """Get the current status of a run."""
        if run_id in self.run_history:
            run_detail = self.run_history[run_id]
            return RunSummary(
                run_id=run_detail.run_id,
                command=run_detail.command,
                status=run_detail.status,
                start_time=run_detail.start_time,
                end_time=run_detail.end_time,
                duration_seconds=run_detail.duration_seconds,
                description=run_detail.description,
                error_message=run_detail.error_message,
                artifacts_available=run_detail.artifacts_available
            )
            
        # Fallback to DB
        try:
            db = SessionLocal()
            run = db.query(db_models.Run).filter(db_models.Run.run_id == run_id).first()
            if run:
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
                    artifacts_available=summary.get("artifacts_available", False)
                )
            return None
        except Exception as e:
            print(f"Error fetching run status: {e}")
            return None
        finally:
            if 'db' in locals():
                db.close()
    
    def get_run_detail(self, run_id: str) -> Optional[RunDetail]:
        """Get detailed information about a run."""
        # Check memory first
        if run_id in self.run_history:
            return self.run_history[run_id]
            
        # Fallback to DB
        try:
            db = SessionLocal()
            run = db.query(db_models.Run).filter(db_models.Run.run_id == run_id).first()
            if run:
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
                    parameters={}, # Parameters not currently stored in Run model root, maybe in summary?
                    log_lines=[], # Logs are not persisted in DB currently
                    artifacts_path=None # Artifacts path reconstruction logic needed if we want to serve them
                )
            return None
        except Exception as e:
            print(f"Error fetching run detail: {e}")
            return None
        finally:
            if 'db' in locals():
                db.close()
    
    def get_run_history(self, page: int = 1, page_size: int = 20) -> List[RunSummary]:
        """Get paginated run history from database."""
        try:
            db = SessionLocal()
            offset = (page - 1) * page_size
            
            # Query runs from DB
            runs = db.query(db_models.Run).order_by(
                db_models.Run.timestamp.desc()
            ).offset(offset).limit(page_size).all()
            
            history = []
            for run in runs:
                summary = run.summary or {}
                history.append(RunSummary(
                    run_id=run.run_id,
                    command=DbtCommand(run.command) if run.command else DbtCommand.RUN,
                    status=RunStatus(run.status) if run.status else RunStatus.FAILED,
                    start_time=run.timestamp,
                    end_time=None, # DB model doesn't explicitly store end_time in root, implied in summary or duration
                    duration_seconds=summary.get("duration_seconds"),
                    description=summary.get("description"),
                    error_message=summary.get("error_message"),
                    artifacts_available=summary.get("artifacts_available", False)
                ))
            return history
        except Exception as e:
            print(f"Error fetching run history: {e}")
            return []
        finally:
            if 'db' in locals():
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
                del self.run_history[run_id]
        
        # Clean up artifact sets
        if len(self.run_artifacts) > self.settings.max_artifact_sets:
            artifacts = list(self.run_artifacts.items())
            # Sort by run start time (from run_history)
            artifacts.sort(key=lambda x: self.run_history.get(x[0], RunDetail(
                run_id=x[0], command=DbtCommand.RUN, status=RunStatus.FAILED, start_time=datetime.min
            )).start_time)
            
            # Remove oldest artifact sets
            to_remove = len(artifacts) - self.settings.max_artifact_sets
            for i in range(to_remove):
                run_id, artifacts_path = artifacts[i]
                # Remove directory
                if os.path.exists(artifacts_path):
                    shutil.rmtree(artifacts_path, ignore_errors=True)
                del self.run_artifacts[run_id]


# Global executor instance
executor = DbtExecutor()