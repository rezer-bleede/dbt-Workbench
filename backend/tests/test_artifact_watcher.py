import json
from pathlib import Path

from app.services.artifact_watcher import ArtifactWatcher


def test_artifact_watcher_versions_and_trimming(tmp_path: Path) -> None:
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps({"version": 1}))

    watcher = ArtifactWatcher(str(tmp_path), max_versions=2, monitored_files=["manifest.json"])

    # Initial load during construction
    v1 = watcher.get_artifact_content("manifest.json")
    assert v1 is not None
    assert v1["version"] == 1
    info1 = watcher.get_version_info()["manifest.json"]
    assert info1["current_version"] == 1
    assert info1["available_versions"] == [1]

    # Second version
    manifest_path.write_text(json.dumps({"version": 2}))
    watcher.on_file_changed("manifest.json")

    v2 = watcher.get_artifact_content("manifest.json")
    assert v2 is not None
    assert v2["version"] == 2
    info2 = watcher.get_version_info()["manifest.json"]
    assert info2["current_version"] == 2
    assert info2["available_versions"] == [1, 2]

    # Third version should evict the oldest (max_versions=2)
    manifest_path.write_text(json.dumps({"version": 3}))
    watcher.on_file_changed("manifest.json")

    v3 = watcher.get_artifact_content("manifest.json")
    assert v3 is not None
    assert v3["version"] == 3
    info3 = watcher.get_version_info()["manifest.json"]
    assert info3["current_version"] == 3
    assert info3["available_versions"] == [2, 3]