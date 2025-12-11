import asyncio
import hashlib
import json
import logging
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

logger = logging.getLogger(__name__)


class ArtifactVersion:
    """Represents a versioned artifact with metadata."""
    
    def __init__(self, content: Dict[str, Any], version: int, timestamp: datetime, checksum: str):
        self.content = content
        self.version = version
        self.timestamp = timestamp
        self.checksum = checksum
        self.is_valid = True
        self.error_message: Optional[str] = None


class ArtifactWatcher:
    """Background service that monitors dbt artifact files for changes and maintains versioned snapshots."""
    
    def __init__(self, artifacts_path: str, max_versions: int = 10, monitored_files: List[str] = None):
        self.base_path = Path(artifacts_path)
        self.max_versions = max_versions
        self.monitored_files = monitored_files or ["manifest.json", "run_results.json", "catalog.json"]
        
        # Thread-safe storage for versioned artifacts
        self._lock = threading.RLock()
        self._versions: Dict[str, List[ArtifactVersion]] = {
            filename: [] for filename in self.monitored_files
        }
        self._current_versions: Dict[str, int] = {
            filename: 0 for filename in self.monitored_files
        }
        
        # File system watcher
        self._observer: Optional[Observer] = None
        self._event_handler = ArtifactFileHandler(self)
        
        # Status tracking
        self._status: Dict[str, Dict[str, Any]] = {
            filename: {"healthy": True, "last_error": None, "last_check": None}
            for filename in self.monitored_files
        }
        
        # Initialize with existing files
        self._initialize_existing_files()
    
    def _initialize_existing_files(self):
        """Load existing artifact files on startup."""
        for filename in self.monitored_files:
            try:
                self._load_artifact(filename, is_initialization=True)
            except Exception as e:
                logger.error(f"Failed to initialize {filename}: {e}")
                self._update_status(filename, False, str(e))
    
    def _calculate_checksum(self, content: str) -> str:
        """Calculate SHA-256 checksum of file content."""
        return hashlib.sha256(content.encode('utf-8')).hexdigest()
    
    def _load_artifact(self, filename: str, is_initialization: bool = False) -> bool:
        """Load and version an artifact file. Returns True if successful."""
        file_path = self.base_path / filename
        
        if not file_path.exists():
            if not is_initialization:
                logger.warning(f"Artifact file {filename} no longer exists")
            self._update_status(filename, False, f"File {filename} does not exist")
            return False
        
        try:
            content_str = file_path.read_text(encoding='utf-8')
            checksum = self._calculate_checksum(content_str)
            
            # Check if content has actually changed
            with self._lock:
                if self._versions[filename]:
                    latest_version = self._versions[filename][-1]
                    if latest_version.checksum == checksum:
                        # Content hasn't changed, no need to create new version
                        return True
            
            # Parse JSON to validate
            content = json.loads(content_str)
            
            with self._lock:
                # Create new version
                new_version_num = self._current_versions[filename] + 1
                new_version = ArtifactVersion(
                    content=content,
                    version=new_version_num,
                    timestamp=datetime.now(),
                    checksum=checksum
                )
                
                # Add to versions list
                self._versions[filename].append(new_version)
                self._current_versions[filename] = new_version_num
                
                # Trim old versions if needed
                if len(self._versions[filename]) > self.max_versions:
                    self._versions[filename] = self._versions[filename][-self.max_versions:]
            
            self._update_status(filename, True, None)
            logger.info(f"Loaded {filename} version {new_version_num} (checksum: {checksum[:8]}...)")
            return True
            
        except json.JSONDecodeError as e:
            error_msg = f"Invalid JSON in {filename}: {e}"
            logger.error(error_msg)
            self._update_status(filename, False, error_msg)
            return False
        except Exception as e:
            error_msg = f"Failed to load {filename}: {e}"
            logger.error(error_msg)
            self._update_status(filename, False, error_msg)
            return False
    
    def _update_status(self, filename: str, healthy: bool, error_message: Optional[str]):
        """Update the status of an artifact file."""
        with self._lock:
            self._status[filename] = {
                "healthy": healthy,
                "last_error": error_message,
                "last_check": datetime.now().isoformat()
            }
    
    def start_watching(self):
        """Start the file system watcher."""
        if self._observer is not None:
            logger.warning("Watcher is already running")
            return
        
        self._observer = Observer()
        self._observer.schedule(self._event_handler, str(self.base_path), recursive=False)
        self._observer.start()
        logger.info(f"Started watching {self.base_path} for artifact changes")
    
    def stop_watching(self):
        """Stop the file system watcher."""
        if self._observer is not None:
            self._observer.stop()
            self._observer.join()
            self._observer = None
            logger.info("Stopped artifact file watcher")
    
    def get_current_version(self, filename: str) -> Optional[ArtifactVersion]:
        """Get the current version of an artifact."""
        with self._lock:
            versions = self._versions.get(filename, [])
            return versions[-1] if versions else None
    
    def get_version(self, filename: str, version: int) -> Optional[ArtifactVersion]:
        """Get a specific version of an artifact."""
        with self._lock:
            versions = self._versions.get(filename, [])
            for v in versions:
                if v.version == version:
                    return v
            return None
    
    def get_version_info(self) -> Dict[str, Dict[str, Any]]:
        """Get version information for all monitored artifacts."""
        with self._lock:
            result = {}
            for filename in self.monitored_files:
                current_version = self.get_current_version(filename)
                result[filename] = {
                    "current_version": current_version.version if current_version else 0,
                    "timestamp": current_version.timestamp.isoformat() if current_version else None,
                    "checksum": current_version.checksum if current_version else None,
                    "available_versions": [v.version for v in self._versions[filename]],
                    "status": self._status[filename]
                }
            return result
    
    def get_artifact_content(self, filename: str, version: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """Get the content of an artifact, optionally for a specific version."""
        if version is None:
            artifact_version = self.get_current_version(filename)
        else:
            artifact_version = self.get_version(filename, version)
        
        return artifact_version.content if artifact_version else None
    
    def on_file_changed(self, filename: str):
        """Called when a monitored file changes."""
        if filename in self.monitored_files:
            logger.info(f"Detected change in {filename}")
            self._load_artifact(filename)


class ArtifactFileHandler(FileSystemEventHandler):
    """File system event handler for artifact files."""
    
    def __init__(self, watcher: ArtifactWatcher):
        self.watcher = watcher
    
    def on_modified(self, event):
        if not event.is_directory:
            filename = Path(event.src_path).name
            self.watcher.on_file_changed(filename)
    
    def on_created(self, event):
        if not event.is_directory:
            filename = Path(event.src_path).name
            self.watcher.on_file_changed(filename)