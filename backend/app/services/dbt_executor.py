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

import yaml

from app.core.config import get_settings
from app.core.watcher_manager import get_watcher
from app.database.connection import SessionLocal
from app.database.models import models as db_models
from app.schemas.execution import (
    DbtCommand, RunStatus, RunSummary, RunDetail,
    LogMessage, ArtifactInfo, PackagesCheckResponse
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
    
    def _create_artifacts_directory(self, run_id: str, artifacts_base_path: Optional[str] = None) -> str:
        """Create a directory for storing run artifacts."""
        base_path = Path(artifacts_base_path or self.settings.dbt_artifacts_path)
        artifacts_dir = base_path / "runs" / run_id
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

        run_detail = self.run_history.get(run_id)
        project_root = (
            Path(run_detail.project_path).resolve()
            if run_detail and run_detail.project_path
            else Path(self.settings.dbt_project_path).resolve()
        )
        project_path = project_root
        target_dir = project_path / "target"

        if not target_dir.exists():
            return artifacts

        artifacts_dir_path = Path(artifacts_dir)
        # Derive the artifacts base path from the run directory when possible.
        artifacts_base = (
            artifacts_dir_path.parent.parent
            if artifacts_dir_path.parent.name == "runs"
            else Path(self.settings.dbt_artifacts_path)
        )

        # Copy full target directory so the complete docs site (including assets)
        # is available for the current run and the latest snapshot.
        destinations = [artifacts_dir_path, artifacts_base]
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
                    watcher = get_watcher(str(artifacts_base))
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

    def _get_profiles_file(self, parameters: Dict[str, Any]) -> Path:
        """Resolve the profiles.yml path from parameters or settings."""
        profiles_dir_param = parameters.get("profiles_dir")
        profiles_base = Path(profiles_dir_param) if profiles_dir_param else Path(self.settings.dbt_profiles_path)
        return profiles_base / "profiles.yml" if profiles_base.is_dir() else profiles_base

    def _load_profile_target_config(
        self,
        cwd: str,
        parameters: Dict[str, Any],
        profiles_file: Path,
    ) -> tuple[Dict[str, Any], Optional[str], Optional[str]]:
        """Best-effort load of the active dbt profile target configuration."""
        if not profiles_file.exists():
            return {}, None, None

        profile_name = parameters.get("profile")
        if not profile_name:
            project_file = Path(cwd) / "dbt_project.yml"
            try:
                if project_file.exists():
                    project_cfg = yaml.safe_load(project_file.read_text(encoding="utf-8")) or {}
                    if isinstance(project_cfg, dict):
                        profile_name = project_cfg.get("profile")
            except Exception:
                profile_name = None

        if not profile_name:
            return {}, None, None

        try:
            profiles_cfg = yaml.safe_load(profiles_file.read_text(encoding="utf-8")) or {}
            if not isinstance(profiles_cfg, dict):
                return {}, profile_name, None

            profile_block = profiles_cfg.get(profile_name)
            if not isinstance(profile_block, dict):
                return {}, profile_name, None

            outputs = profile_block.get("outputs") or {}
            if not isinstance(outputs, dict) or not outputs:
                return {}, profile_name, None

            target_name = parameters.get("target") or profile_block.get("target") or next(iter(outputs.keys()))
            target_cfg = outputs.get(target_name) if isinstance(outputs, dict) else None

            return (target_cfg if isinstance(target_cfg, dict) else {}), profile_name, target_name
        except Exception:
            # Swallow YAML/IO errors; we will fall back to env/CLI flags.
            return {}, profile_name, None

    def _extract_package_name(self, package_def: Dict[str, Any], package_type: str) -> Optional[str]:
        """Extract clean package name from package definition."""
        try:
            if package_type == 'git':
                # From git: "dbt-labs/dbt-utils" -> "dbt-utils"
                git = package_def.get('git', '')
                if git:
                    return git.split('/')[-1].replace('.git', '')
                # From URL: "https://github.com/..." -> extract repo name
                url = package_def.get('git', package_def.get('url', ''))
                if url:
                    return url.rstrip('/').split('/')[-1].replace('.git', '')
            elif package_type == 'local':
                # From local: "../my-package" -> "my-package"
                local = package_def.get('local', '')
                return local.rstrip('/').split('/')[-1] if local else None
            elif package_type == 'package':
                # From package: "dbt-labs/dbt_utils" -> "dbt_utils"
                pkg = package_def.get('package', '')
                if pkg:
                    return pkg.split('/')[-1]
        except Exception:
            pass
        return None

    def _clean_package_lock(self, project_path: str) -> None:
        """Remove package-lock.yml if it exists to avoid inconsistent state."""
        try:
            cwd = project_path if project_path else self.settings.dbt_project_path
            cwd_path = Path(cwd).resolve()
            lock_file = cwd_path / "package-lock.yml"
            if lock_file.exists():
                lock_file.unlink()
                print(f"Removed package-lock.yml from {cwd}")
        except Exception as e:
            print(f"Failed to remove package-lock.yml: {e}")

    def _extract_connection_values(self, target_cfg: Dict[str, Any]) -> Dict[str, Optional[str]]:
        """Extract common connection values from a dbt profile target config."""
        host = target_cfg.get("host")
        port = target_cfg.get("port")
        database = target_cfg.get("dbname") or target_cfg.get("database") or target_cfg.get("schema")
        user = target_cfg.get("user")
        password = target_cfg.get("password") or target_cfg.get("pass") or target_cfg.get("passphrase")
        adapter_type = target_cfg.get("type")

        return {
            "host": str(host) if host is not None else None,
            "port": str(port) if port is not None else None,
            "database": str(database) if database is not None else None,
            "user": str(user) if user is not None else None,
            "password": str(password) if password is not None else None,
            "adapter_type": str(adapter_type).lower() if adapter_type is not None else None,
        }

    def _normalize_package_name(self, name: str) -> str:
        """Normalize package name for comparison (dbt-utils == dbt_utils)."""
        return name.replace('-', '_').replace('.', '_').lower()

    def check_missing_packages(self, project_path: Optional[str] = None) -> PackagesCheckResponse:
        """Check for missing dbt packages in project."""
        cwd = project_path if project_path else self.settings.dbt_project_path
        cwd_path = Path(cwd).resolve()

        packages_yml = cwd_path / "packages.yml"

        if not packages_yml.exists():
            return PackagesCheckResponse(
                has_missing=False,
                packages_required=[],
                packages_installed=[],
                missing_packages=[],
                packages_yml_exists=False
            )

        try:
            packages_content = yaml.safe_load(packages_yml.read_text(encoding="utf-8"))
            packages_list = packages_content.get('packages', [])

            required_packages = []
            for pkg in packages_list:
                if not isinstance(pkg, dict):
                    continue

                pkg_name = None
                if 'git' in pkg or 'url' in pkg:
                    pkg_name = self._extract_package_name(pkg, 'git')
                elif 'local' in pkg:
                    pkg_name = self._extract_package_name(pkg, 'local')
                elif 'package' in pkg:
                    pkg_name = self._extract_package_name(pkg, 'package')

                if pkg_name:
                    required_packages.append(pkg_name)

            # Check installed packages
            dbt_packages_dir = cwd_path / "dbt_packages"
            installed_packages = []

            if dbt_packages_dir.exists():
                for item in dbt_packages_dir.iterdir():
                    if item.is_dir():
                        installed_packages.append(item.name)

            # Determine missing packages with normalization for hyphen/underscore differences
            installed_normalized = {self._normalize_package_name(p): p for p in installed_packages}
            missing = []
            for pkg in required_packages:
                pkg_normalized = self._normalize_package_name(pkg)
                if pkg_normalized not in installed_normalized:
                    missing.append(pkg)

            return PackagesCheckResponse(
                has_missing=len(missing) > 0,
                packages_required=required_packages,
                packages_installed=installed_packages,
                missing_packages=missing,
                packages_yml_exists=True
            )
        except Exception as e:
            print(f"Error checking packages: {e}")
            return PackagesCheckResponse(
                has_missing=False,
                packages_required=[],
                packages_installed=[],
                missing_packages=[],
                packages_yml_exists=True
            )

    def _resolve_row_lineage_export_path(
        self,
        project_root: Path,
        run_detail: RunDetail,
    ) -> tuple[Path, str, Path]:
        """Resolve the row-lineage export directory and the expected output file."""
        export_path_value: Optional[str] = None
        export_format = "jsonl"
        project_file = project_root / "dbt_project.yml"
        if project_file.exists():
            try:
                project_cfg = yaml.safe_load(project_file.read_text(encoding="utf-8")) or {}
                if isinstance(project_cfg, dict):
                    vars_cfg = project_cfg.get("vars")
                    if isinstance(vars_cfg, dict):
                        candidate = vars_cfg.get("rowlineage_export_path")
                        if isinstance(candidate, str) and candidate.strip():
                            export_path_value = candidate.strip()
                        fmt = vars_cfg.get("rowlineage_export_format")
                        if isinstance(fmt, str) and fmt.strip():
                            export_format = fmt.strip().lower()
            except Exception as exc:  # pragma: no cover - defensive
                run_detail.log_lines.append(
                    f"[row-lineage] Failed to read dbt_project.yml for export config: {exc}"
                )

        if not export_path_value:
            export_path_value = self.settings.row_lineage_mapping_relative_path.strip("/") or "lineage/lineage.jsonl"

        export_path = Path(export_path_value)
        project_root_resolved = project_root.resolve()

        # If a file path was provided, use its parent directory.
        if export_path.suffix in {".jsonl", ".parquet"}:
            export_path = export_path.parent

        if export_path.is_absolute():
            try:
                export_path.resolve().relative_to(project_root_resolved)
                export_dir = export_path
                export_arg = str(export_path)
            except ValueError:
                run_detail.log_lines.append(
                    "[row-lineage] Export path is outside the project root; using target/lineage."
                )
                export_dir = project_root / "target" / "lineage"
                export_arg = "target/lineage"
        else:
            export_dir = project_root / export_path
            try:
                export_dir.resolve().relative_to(project_root_resolved)
                export_arg = str(export_path)
            except ValueError:
                run_detail.log_lines.append(
                    "[row-lineage] Export path escapes the project root; using target/lineage."
                )
                export_dir = project_root / "target" / "lineage"
                export_arg = "target/lineage"

        export_filename = "lineage.parquet" if export_format == "parquet" else "lineage.jsonl"
        export_file = export_dir / export_filename
        return export_dir, export_arg, export_file

    def _resolve_artifacts_base(self, run_detail: RunDetail) -> Path:
        if run_detail.artifacts_path:
            artifacts_dir = Path(run_detail.artifacts_path)
            if artifacts_dir.parent.name == "runs":
                return artifacts_dir.parent.parent
            return artifacts_dir
        return Path(self.settings.dbt_artifacts_path)

    def _copy_row_lineage_output(self, export_file: Path, run_detail: RunDetail) -> None:
        """Copy generated lineage mappings into workspace artifacts."""
        if not export_file.exists() or export_file.is_dir():
            run_detail.log_lines.append(
                f"[row-lineage] Export file not found after run: {export_file}"
            )
            return

        mapping_relative = self.settings.row_lineage_mapping_relative_path.strip("/") or "lineage/lineage.jsonl"
        mapping_relative = mapping_relative.lstrip("/")

        artifacts_base = self._resolve_artifacts_base(run_detail)
        destinations = []
        if run_detail.artifacts_path:
            destinations.append(Path(run_detail.artifacts_path) / mapping_relative)
        destinations.append(artifacts_base / mapping_relative)

        for destination in destinations:
            try:
                destination.parent.mkdir(parents=True, exist_ok=True)
                if destination.exists():
                    if destination.is_dir():
                        shutil.rmtree(destination)
                    else:
                        destination.unlink()
                shutil.copy2(export_file, destination)
                run_detail.log_lines.append(
                    f"[row-lineage] Copied lineage mappings to {destination}."
                )
            except Exception as exc:  # pragma: no cover - defensive
                run_detail.log_lines.append(
                    f"[row-lineage] Failed to copy lineage mappings to {destination}: {exc}"
                )

    def _run_row_lineage(self, cwd: str, parameters: Dict[str, Any], run_detail: RunDetail) -> None:
        """Optionally run dbt-rowlineage to export row lineage mappings."""
        if not self.settings.row_lineage_enabled:
            run_detail.log_lines.append(
                "[row-lineage] Row lineage is disabled via settings; skipping dbt-rowlineage."
            )
            return

        env = os.environ.copy()

        profiles_file = self._get_profiles_file(parameters)
        profiles_dir = str(profiles_file.parent) if profiles_file.exists() else os.path.abspath(self.settings.dbt_profiles_path)
        if os.path.exists(profiles_dir):
            env["DBT_PROFILES_DIR"] = profiles_dir

        target = parameters.get("target")
        if isinstance(target, str) and target:
            env["DBT_TARGET"] = target

        profile = parameters.get("profile")
        if isinstance(profile, str) and profile:
            env["DBT_PROFILE"] = profile

        # Resolve connection details from profiles.yml so the CLI has explicit DB params.
        target_cfg, resolved_profile, resolved_target = self._load_profile_target_config(
            cwd=cwd,
            parameters=parameters,
            profiles_file=profiles_file,
        )
        conn = self._extract_connection_values(target_cfg) if target_cfg else {}

        adapter_type = conn.get("adapter_type")
        if adapter_type == "duckdb":
            run_detail.log_lines.append(
                "[row-lineage] DuckDB profile detected; dbt-rowlineage CLI requires a networked DB. Skipping."
            )
            return

        if resolved_profile and "DBT_PROFILE" not in env:
            env["DBT_PROFILE"] = resolved_profile
        if resolved_target and "DBT_TARGET" not in env:
            env["DBT_TARGET"] = resolved_target

        # Populate both DBT_* and PG* env vars for compatibility with the CLI.
        if adapter_type:
            env["DBT_ADAPTER"] = adapter_type

        host = conn.get("host")
        port = conn.get("port")
        database = conn.get("database")
        user = conn.get("user")
        password = conn.get("password")

        requires_password = not (adapter_type and adapter_type.startswith("clickhouse"))
        missing: List[str] = []
        if not database:
            missing.append("database")
        if not user:
            missing.append("user")
        if requires_password and not password:
            missing.append("password")
        if missing:
            run_detail.log_lines.append(
                "[row-lineage] Missing DB credentials in profiles.yml/env "
                f"({', '.join(missing)}); skipping dbt-rowlineage."
            )
            return

        if host:
            env["DBT_HOST"] = host
            env["PGHOST"] = host
        if port:
            env["DBT_PORT"] = port
            env["PGPORT"] = port
        if database:
            env["DBT_DATABASE"] = database
            env["PGDATABASE"] = database
        if user:
            env["DBT_USER"] = user
            env["PGUSER"] = user
        if password:
            env["DBT_PASSWORD"] = password
            env["PGPASSWORD"] = password

        cmd = ["dbt-rowlineage", "--project-root", cwd]

        project_root = Path(cwd).resolve()
        export_dir, export_arg, export_file = self._resolve_row_lineage_export_path(project_root, run_detail)
        export_dir.mkdir(parents=True, exist_ok=True)
        if export_file.exists() and export_file.is_dir():
            try:
                shutil.rmtree(export_file)
                run_detail.log_lines.append(
                    f"[row-lineage] Removed directory at export file path: {export_file}"
                )
            except Exception as exc:  # pragma: no cover - defensive
                run_detail.log_lines.append(
                    f"[row-lineage] Failed to remove directory at export file path: {exc}"
                )
        if export_file.exists() and export_file.is_file():
            try:
                export_file.unlink()
                run_detail.log_lines.append(
                    f"[row-lineage] Cleared existing lineage file: {export_file}"
                )
            except Exception as exc:  # pragma: no cover - defensive
                run_detail.log_lines.append(
                    f"[row-lineage] Failed to clear existing lineage file: {exc}"
                )
        cmd.extend(["--export-path", export_arg])
        run_detail.log_lines.append(f"[row-lineage] Export path: {export_arg}")

        if host:
            cmd.extend(["--db-host", host])
        if port:
            cmd.extend(["--db-port", port])
        if database:
            cmd.extend(["--db-name", database])
        if user:
            cmd.extend(["--db-user", user])
        if password:
            cmd.extend(["--db-password", password])

        run_detail.log_lines.append("[row-lineage] Running dbt-rowlineage export...")

        process = subprocess.Popen(
            cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True,
            env=env,
        )

        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break

            if line:
                line = line.rstrip()
                run_detail.log_lines.append(f"[row-lineage] {line}")
                if len(run_detail.log_lines) > self.settings.log_buffer_size:
                    run_detail.log_lines = run_detail.log_lines[-self.settings.log_buffer_size:]

        return_code = process.wait()
        if return_code != 0:
            run_detail.log_lines.append(
                f"[row-lineage] dbt-rowlineage failed with exit code {return_code}"
            )
            return

        self._copy_row_lineage_output(export_file, run_detail)
    
    async def start_run(
        self, 
        command: DbtCommand, 
        parameters: Dict[str, Any],
        description: Optional[str] = None,
        project_path: Optional[str] = None,
        run_row_lineage: bool = False,
        artifacts_path: Optional[str] = None,
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
            project_path=project_path,
            run_row_lineage=run_row_lineage,
        )
        
        self.run_history[run_id] = run_detail
        
        # Create artifacts directory
        artifacts_dir = self._create_artifacts_directory(run_id, artifacts_base_path=artifacts_path)
        self.run_artifacts[run_id] = artifacts_dir
        run_detail.artifacts_path = artifacts_dir
        
        return run_id
    
    async def execute_run(self, run_id: str) -> None:
        """Execute the dbt run in a subprocess."""
        if run_id not in self.run_history:
            raise ValueError(f"Run {run_id} not found")
        
        run_detail = self.run_history[run_id]
        run_detail.status = RunStatus.RUNNING
        
        try:
            # Build command
            if run_detail.command == DbtCommand.CUSTOM:
                custom = (run_detail.parameters or {}).get("custom_command", "")
                if not custom:
                    raise ValueError("Custom command run has no custom_command parameter")
                cmd = ["/bin/sh", "-c", custom]
                run_detail.log_lines.append(f"$ {custom}")
            else:
                cmd = self._get_dbt_command(run_detail.command, run_detail.parameters)
            
            # Determine working directory: prefer run-specific project path, fallback to default
            cwd = run_detail.project_path if run_detail.project_path else self.settings.dbt_project_path
            if not os.path.isabs(cwd):
                cwd = os.path.abspath(cwd)

            # Clean package-lock.yml for deps command to avoid inconsistent state
            if run_detail.command == DbtCommand.DEPS:
                self._clean_package_lock(cwd)

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
                # Optionally run row-lineage export before capturing artifacts
                if run_detail.run_row_lineage:
                    try:
                        self._run_row_lineage(cwd=cwd, parameters=run_detail.parameters, run_detail=run_detail)
                    except Exception as exc:
                        run_detail.log_lines.append(
                            f"[row-lineage] Failed to run dbt-rowlineage: {exc}"
                        )
                        if len(run_detail.log_lines) > self.settings.log_buffer_size:
                            run_detail.log_lines = run_detail.log_lines[-self.settings.log_buffer_size:]

                # Capture artifacts on success (custom commands produce no
                # dbt target directory to snapshot)
                if run_detail.command == DbtCommand.CUSTOM:
                    artifacts = []
                else:
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
                            "run_row_lineage": run_detail.run_row_lineage,
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
                        "run_row_lineage": run_detail.run_row_lineage,
                    }
                    db_run.logs = run_detail.log_lines
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
                    parameters={},
                    log_lines=run.logs or [],
                    artifacts_path=None,
                    run_row_lineage=summary.get("run_row_lineage", False),
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

    def get_run_history_total(self) -> int:
        """Get total run count from database."""
        try:
            db = SessionLocal()
            return db.query(db_models.Run).count()
        except Exception as e:
            print(f"Error fetching run history total: {e}")
            return len(self.run_history)
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
