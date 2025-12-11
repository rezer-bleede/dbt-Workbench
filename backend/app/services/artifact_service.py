import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from app.core.watcher_manager import get_watcher


class ArtifactService:
    def __init__(self, artifacts_path: str):
        self.base_path = Path(artifacts_path)
        self.watcher = get_watcher()

    def _load_json(self, filename: str) -> Optional[Dict[str, Any]]:
        # Use watcher for versioned artifacts if available
        content = self.watcher.get_artifact_content(filename)
        if content is not None:
            return content
        
        # Fallback to direct file reading for non-monitored files
        file_path = self.base_path / filename
        if not file_path.exists():
            return None
        try:
            return json.loads(file_path.read_text())
        except json.JSONDecodeError:
            return None

    def get_artifact_summary(self) -> Dict[str, bool]:
        return {
            "manifest": (self.base_path / "manifest.json").exists(),
            "run_results": (self.base_path / "run_results.json").exists(),
            "catalog": (self.base_path / "catalog.json").exists(),
        }

    def get_manifest(self) -> Optional[Dict[str, Any]]:
        return self._load_json("manifest.json")

    def get_run_results(self) -> Optional[Dict[str, Any]]:
        return self._load_json("run_results.json")

    def list_models(self) -> List[Dict[str, Any]]:
        manifest = self.get_manifest()
        if not manifest:
            return []
        nodes = manifest.get("nodes", {})
        models = []
        for unique_id, node in nodes.items():
            if node.get("resource_type") != "model":
                continue
            models.append(
                {
                    "unique_id": unique_id,
                    "name": node.get("name"),
                    "resource_type": node.get("resource_type"),
                    "depends_on": node.get("depends_on", {}).get("nodes", []),
                    "database": node.get("database"),
                    "schema": node.get("schema"),
                    "alias": node.get("alias") or node.get("name"),
                }
            )
        return models

    def get_model_detail(self, model_id: str) -> Optional[Dict[str, Any]]:
        manifest = self.get_manifest()
        if not manifest:
            return None
        node = manifest.get("nodes", {}).get(model_id)
        if not node:
            return None
        children = [
            child_id
            for child_id, child_node in manifest.get("nodes", {}).items()
            if model_id in child_node.get("depends_on", {}).get("nodes", [])
        ]
        return {
            "unique_id": model_id,
            "name": node.get("name"),
            "resource_type": node.get("resource_type"),
            "depends_on": node.get("depends_on", {}).get("nodes", []),
            "database": node.get("database"),
            "schema": node.get("schema"),
            "alias": node.get("alias") or node.get("name"),
            "description": node.get("description", ""),
            "columns": node.get("columns", {}),
            "children": children,
        }

    def lineage_graph(self) -> Dict[str, List[Dict[str, str]]]:
        manifest = self.get_manifest()
        if not manifest:
            return {"nodes": [], "edges": []}
        nodes_payload = []
        edges_payload = []
        for unique_id, node in manifest.get("nodes", {}).items():
            if node.get("resource_type") != "model":
                continue
            nodes_payload.append(
                {
                    "id": unique_id,
                    "label": node.get("alias") or node.get("name"),
                    "type": node.get("resource_type"),
                }
            )
            for parent in node.get("depends_on", {}).get("nodes", []):
                edges_payload.append({"source": parent, "target": unique_id})
        return {"nodes": nodes_payload, "edges": edges_payload}

    def list_runs(self) -> List[Dict[str, Any]]:
        run_results = self.get_run_results()
        if not run_results:
            return []
        results = run_results.get("results", [])
        output = []
        for run in results:
            timings = run.get("timing", [])
            start_time = timings[0].get("started_at") if timings else None
            end_time = timings[-1].get("completed_at") if timings else None
            duration = None
            if start_time and end_time:
                # simplistic duration estimation in seconds
                duration = run.get("execution_time") or None
            output.append(
                {
                    "status": run.get("status"),
                    "start_time": start_time,
                    "end_time": end_time,
                    "duration": duration,
                    "invocation_id": run_results.get("metadata", {}).get("invocation_id"),
                    "model_unique_id": run.get("unique_id"),
                }
            )
        return output
