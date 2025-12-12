from __future__ import annotations

from collections import defaultdict
from contextlib import contextmanager
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.database.connection import SessionLocal
from app.database.models import models as db_models
from app.schemas import catalog as catalog_schemas
from app.services.artifact_service import ArtifactService


class CatalogService:
    def __init__(
        self,
        artifact_service: ArtifactService,
        settings: Settings,
        session_factory: sessionmaker[Session] = SessionLocal,
    ):
        self.artifact_service = artifact_service
        self.settings = settings
        self.session_factory = session_factory

    @contextmanager
    def _session(self) -> Iterable[Session]:
        session = self.session_factory()
        try:
            yield session
            session.commit()
        except SQLAlchemyError:
            session.rollback()
            raise
        finally:
            session.close()

    def _load_artifacts(self) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
        manifest = self.artifact_service.get_manifest() or {}
        catalog = self.artifact_service.get_catalog() or {}
        run_results = self.artifact_service.get_run_results() or {}
        return manifest, catalog, run_results

    def _merged_nodes(self, manifest: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        nodes = dict(manifest.get("nodes", {}))
        nodes.update(manifest.get("sources", {}))
        nodes.update(manifest.get("exposures", {}))
        nodes.update(manifest.get("macros", {}))
        return nodes

    def _test_map(self, manifest: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        return {uid: node for uid, node in manifest.get("nodes", {}).items() if node.get("resource_type") == "test"}

    def _test_status_map(self, run_results: Dict[str, Any]) -> Dict[str, str]:
        status_map: Dict[str, str] = {}
        for result in run_results.get("results", []) or []:
            unique_id = result.get("unique_id")
            status = result.get("status")
            if unique_id and status:
                status_map[unique_id] = status
        return status_map

    def _column_stats(self, catalog_node: Dict[str, Any], unique_id: str) -> Dict[str, catalog_schemas.ColumnStatistics]:
        stats: Dict[str, catalog_schemas.ColumnStatistics] = {}
        for col_name, meta in (catalog_node.get("columns") or {}).items():
            column_stats = meta.get("stats") or {}
            stats[col_name] = catalog_schemas.ColumnStatistics(
                null_count=self._extract_stat(column_stats, "nulls"),
                distinct_count=self._extract_stat(column_stats, "distinct"),
                min=self._extract_stat(column_stats, "min"),
                max=self._extract_stat(column_stats, "max"),
                distribution=column_stats.get("histogram"),
            )
        self._persist_statistics(unique_id, stats)
        return stats

    def _persist_statistics(self, unique_id: str, stats: Dict[str, catalog_schemas.ColumnStatistics]) -> None:
        if not stats:
            return
        with self._session() as session:
            for col_name, stat in stats.items():
                existing = (
                    session.query(db_models.ColumnStatistic)
                    .filter_by(unique_id=unique_id, column_name=col_name)
                    .one_or_none()
                )
                if existing is None:
                    existing = db_models.ColumnStatistic(unique_id=unique_id, column_name=col_name)
                    session.add(existing)
                existing.null_count = stat.null_count
                existing.distinct_count = stat.distinct_count
                existing.min_value = stat.min
                existing.max_value = stat.max
                existing.distribution = stat.distribution or {}
                existing.updated_at = datetime.now(timezone.utc)

    def _extract_stat(self, stats: Dict[str, Any], key: str) -> Optional[Any]:
        value = stats.get(key)
        if isinstance(value, dict):
            return value.get("value")
        return value

    def _column_meta(self, manifest_node: Dict[str, Any], catalog_node: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        merged: Dict[str, Dict[str, Any]] = {}
        manifest_columns = manifest_node.get("columns", {}) or {}
        catalog_columns = catalog_node.get("columns", {}) or {}
        for name in sorted(set(manifest_columns.keys()) | set(catalog_columns.keys())):
            manifest_meta = manifest_columns.get(name, {})
            catalog_meta = catalog_columns.get(name, {})
            merged[name] = {
                "name": manifest_meta.get("name") or catalog_meta.get("name") or name,
                "description": manifest_meta.get("description") or catalog_meta.get("comment"),
                "type": catalog_meta.get("type") or manifest_meta.get("data_type"),
                "is_nullable": catalog_meta.get("nullable"),
                "tags": manifest_meta.get("tags", []),
            }
        return merged

    def _column_tests(self, test_nodes: Dict[str, Dict[str, Any]]) -> Dict[Tuple[str, str], List[str]]:
        mapping: Dict[Tuple[str, str], List[str]] = defaultdict(list)
        for unique_id, node in test_nodes.items():
            depends_on = node.get("depends_on", {}).get("nodes", [])
            column_name = node.get("column_name") or node.get("column")
            for target in depends_on:
                mapping[(target, column_name or "")].append(unique_id)
        return mapping

    def _column_lineup(
        self,
        unique_id: str,
        manifest_node: Dict[str, Any],
        catalog_node: Dict[str, Any],
        test_nodes: Dict[str, Dict[str, Any]],
        test_statuses: Dict[str, str],
    ) -> List[catalog_schemas.ColumnMetadata]:
        merged = self._column_meta(manifest_node, catalog_node)
        stats = self._column_stats(catalog_node, unique_id)
        column_test_map = self._column_tests(test_nodes)
        results: List[catalog_schemas.ColumnMetadata] = []

        metadata_overrides = self._column_overrides(unique_id)
        for name, meta in merged.items():
            key = (unique_id, name)
            tests = [
                catalog_schemas.TestStatus(name=test_id, status=test_statuses.get(test_id, "not-run"))
                for test_id in column_test_map.get(key, [])
            ]
            override = metadata_overrides.get(name, {})
            results.append(
                catalog_schemas.ColumnMetadata(
                    name=name,
                    description=meta.get("description"),
                    user_description=override.get("description_override"),
                    type=meta.get("type"),
                    is_nullable=meta.get("is_nullable"),
                    owner=override.get("owner"),
                    tags=meta.get("tags", []),
                    user_tags=override.get("tags_override", []),
                    statistics=stats.get(name),
                    tests=tests,
                )
            )
        return results

    def _column_overrides(self, unique_id: str) -> Dict[str, Dict[str, Any]]:
        overrides: Dict[str, Dict[str, Any]] = {}
        with self._session() as session:
            records = session.query(db_models.ColumnMetadata).filter_by(unique_id=unique_id).all()
            for record in records:
                overrides[record.column_name] = {
                    "description_override": record.description_override,
                    "owner": record.owner,
                    "tags_override": record.tags_override or [],
                    "custom_metadata": record.custom_metadata or {},
                }
        return overrides

    def _entity_override(self, unique_id: str) -> Optional[Dict[str, Any]]:
        with self._session() as session:
            record = (
                session.query(db_models.CatalogMetadata)
                .filter_by(unique_id=unique_id)
                .one_or_none()
            )
            if record is None:
                return None
            return {
                "owner": record.owner,
                "description_override": record.description_override,
                "tags_override": record.tags_override or [],
                "custom_metadata": record.custom_metadata or {},
            }

    def _freshness(self, catalog_node: Dict[str, Any]) -> Optional[catalog_schemas.FreshnessInfo]:
        freshness_meta = catalog_node.get("freshness") or {}
        max_loaded_at = freshness_meta.get("max_loaded_at") or catalog_node.get("max_loaded_at")
        checked_at = freshness_meta.get("snapshotted_at") or freshness_meta.get("last_checked")
        threshold_minutes = freshness_meta.get("threshold")
        if threshold_minutes is None and self.settings.freshness_threshold_override_minutes is not None:
            threshold_minutes = self.settings.freshness_threshold_override_minutes

        if max_loaded_at:
            try:
                max_loaded_time = datetime.fromisoformat(str(max_loaded_at))
            except ValueError:
                max_loaded_time = None
        else:
            max_loaded_time = None

        if checked_at:
            try:
                checked_time = datetime.fromisoformat(str(checked_at))
            except ValueError:
                checked_time = None
        else:
            checked_time = None

        age_minutes: Optional[float] = None
        status: Optional[str] = None
        if max_loaded_time:
            now = datetime.now(timezone.utc)
            if max_loaded_time.tzinfo is None:
                max_loaded_time = max_loaded_time.replace(tzinfo=timezone.utc)
            age_minutes = (now - max_loaded_time).total_seconds() / 60
            if threshold_minutes is not None:
                status = "on-time" if age_minutes <= float(threshold_minutes) else "late"

        if not status and freshness_meta.get("status"):
            status = freshness_meta.get("status")

        return catalog_schemas.FreshnessInfo(
            max_loaded_at=str(max_loaded_at) if max_loaded_at else None,
            age_minutes=age_minutes,
            threshold_minutes=float(threshold_minutes) if threshold_minutes is not None else None,
            status=status,
            checked_at=checked_time,
        )

    def _test_status_for_entity(
        self,
        unique_id: str,
        test_nodes: Dict[str, Dict[str, Any]],
        test_statuses: Dict[str, str],
    ) -> Tuple[str | None, List[catalog_schemas.TestStatus]]:
        statuses: List[catalog_schemas.TestStatus] = []
        for test_id, node in test_nodes.items():
            depends_on = node.get("depends_on", {}).get("nodes", [])
            if unique_id in depends_on:
                statuses.append(
                    catalog_schemas.TestStatus(
                        name=test_id,
                        status=test_statuses.get(test_id, "not-run"),
                        severity=node.get("severity"),
                    )
                )
        overall = None
        if statuses:
            priority = ["error", "fail", "warn", "skipped", "success", "not-run"]
            for level in priority:
                if any(status.status == level for status in statuses):
                    overall = level
                    break
        return overall, statuses

    def _score(self, query: str, candidate: str) -> float:
        query_lower = query.lower()
        candidate_lower = candidate.lower()
        score = SequenceMatcher(None, query_lower, candidate_lower).ratio()
        if candidate_lower.startswith(query_lower):
            score += 1.0
        if query_lower in candidate_lower:
            score += 0.5
        return score

    def list_entities(self) -> List[catalog_schemas.CatalogEntitySummary]:
        manifest, catalog, run_results = self._load_artifacts()
        test_nodes = self._test_map(manifest)
        test_statuses = self._test_status_map(run_results)
        merged_nodes = self._merged_nodes(manifest)
        catalog_nodes = {**catalog.get("nodes", {}), **catalog.get("sources", {})}

        summaries: List[catalog_schemas.CatalogEntitySummary] = []
        for unique_id, node in merged_nodes.items():
            catalog_node = catalog_nodes.get(unique_id, {})
            override = self._entity_override(unique_id)
            test_status, _ = self._test_status_for_entity(unique_id, test_nodes, test_statuses)
            freshness = self._freshness(catalog_node) if node.get("resource_type") == "source" else None

            summaries.append(
                catalog_schemas.CatalogEntitySummary(
                    unique_id=unique_id,
                    name=node.get("name"),
                    resource_type=node.get("resource_type"),
                    database=node.get("database"),
                    schema=node.get("schema"),
                    tags=node.get("tags", []),
                    owner=(node.get("meta", {}) or {}).get("owner"),
                    user_owner=override.get("owner") if override else None,
                    description=node.get("description"),
                    user_description=override.get("description_override") if override else None,
                    user_tags=override.get("tags_override", []) if override else [],
                    test_status=test_status,
                    freshness=freshness,
                )
            )
        return sorted(summaries, key=lambda item: item.unique_id)

    def entity_detail(self, unique_id: str) -> Optional[catalog_schemas.CatalogEntityDetail]:
        manifest, catalog, run_results = self._load_artifacts()
        merged_nodes = self._merged_nodes(manifest)
        node = merged_nodes.get(unique_id)
        if not node:
            return None

        catalog_nodes = {**catalog.get("nodes", {}), **catalog.get("sources", {})}
        catalog_node = catalog_nodes.get(unique_id, {})
        test_nodes = self._test_map(manifest)
        test_statuses = self._test_status_map(run_results)
        override = self._entity_override(unique_id)
        test_status, tests = self._test_status_for_entity(unique_id, test_nodes, test_statuses)
        columns = self._column_lineup(unique_id, node, catalog_node, test_nodes, test_statuses)

        return catalog_schemas.CatalogEntityDetail(
            unique_id=unique_id,
            name=node.get("name"),
            resource_type=node.get("resource_type"),
            database=node.get("database"),
            schema=node.get("schema"),
            tags=node.get("tags", []),
            owner=(node.get("meta", {}) or {}).get("owner"),
            user_owner=override.get("owner") if override else None,
            description=node.get("description"),
            user_description=override.get("description_override") if override else None,
            user_tags=override.get("tags_override", []) if override else [],
            test_status=test_status,
            freshness=self._freshness(catalog_node) if node.get("resource_type") == "source" else None,
            columns=columns,
            tests=tests,
            doc_path=node.get("docs", {}).get("show") if node.get("docs") else None,
            meta=node.get("meta", {}),
        )

    def search(self, query: str) -> catalog_schemas.SearchResponse:
        summaries = self.list_entities()
        catalog, _, _ = self._load_artifacts()
        catalog_nodes = {**catalog.get("nodes", {}), **catalog.get("sources", {})}
        results: Dict[str, List[catalog_schemas.SearchResult]] = defaultdict(list)

        for summary in summaries:
            if not query:
                score = 0.0
            else:
                score = max(
                    self._score(query, summary.name or ""),
                    self._score(query, summary.unique_id),
                )
                for tag in summary.tags + summary.user_tags:
                    score = max(score, self._score(query, tag))
            if score > 0 or not query:
                results[summary.resource_type].append(
                    catalog_schemas.SearchResult(
                        unique_id=summary.unique_id,
                        name=summary.name,
                        resource_type=summary.resource_type,
                        score=score,
                        description=summary.description or summary.user_description,
                        tags=sorted(set(summary.tags + summary.user_tags)),
                        test_status=summary.test_status,
                        freshness=summary.freshness,
                    )
                )

            # Column level search
            catalog_node = catalog_nodes.get(summary.unique_id, {})
            columns = catalog_node.get("columns", {}) or {}
            for col_name, meta in columns.items():
                score = self._score(query, col_name)
                if score > 0 or not query:
                    results["columns"].append(
                        catalog_schemas.SearchResult(
                            unique_id=f"{summary.unique_id}.{col_name}",
                            name=col_name,
                            resource_type="column",
                            score=score,
                            description=meta.get("comment"),
                            tags=meta.get("tags", []),
                            test_status=None,
                        )
                    )

        sorted_results = {
            key: sorted(value, key=lambda item: item.score, reverse=True)
            for key, value in results.items()
        }
        return catalog_schemas.SearchResponse(query=query, results=sorted_results)

    def update_metadata(
        self,
        unique_id: str,
        update: catalog_schemas.MetadataUpdate,
    ) -> catalog_schemas.CatalogEntityDetail:
        if not self.settings.allow_metadata_edits:
            raise PermissionError("Metadata edits are disabled by configuration")

        manifest, _, _ = self._load_artifacts()
        merged_nodes = self._merged_nodes(manifest)
        node = merged_nodes.get(unique_id)
        if not node:
            raise KeyError(f"Unknown unique_id {unique_id}")

        with self._session() as session:
            record = session.query(db_models.CatalogMetadata).filter_by(unique_id=unique_id).one_or_none()
            if record is None:
                record = db_models.CatalogMetadata(
                    unique_id=unique_id,
                    entity_type=node.get("resource_type") or "model",
                )
                session.add(record)
            if update.owner is not None:
                record.owner = update.owner
            if update.description is not None:
                record.description_override = update.description
            if update.tags is not None:
                record.tags_override = update.tags
            if update.custom_metadata is not None:
                record.custom_metadata = update.custom_metadata

        detail = self.entity_detail(unique_id)
        if detail is None:
            raise KeyError(f"Unknown unique_id {unique_id}")
        return detail

    def update_column_metadata(
        self,
        unique_id: str,
        column_name: str,
        update: catalog_schemas.ColumnMetadataUpdate,
    ) -> List[catalog_schemas.ColumnMetadata]:
        if not self.settings.allow_metadata_edits:
            raise PermissionError("Metadata edits are disabled by configuration")

        with self._session() as session:
            record = (
                session.query(db_models.ColumnMetadata)
                .filter_by(unique_id=unique_id, column_name=column_name)
                .one_or_none()
            )
            if record is None:
                record = db_models.ColumnMetadata(unique_id=unique_id, column_name=column_name)
                session.add(record)
            if update.owner is not None:
                record.owner = update.owner
            if update.description is not None:
                record.description_override = update.description
            if update.tags is not None:
                record.tags_override = update.tags
            if update.custom_metadata is not None:
                record.custom_metadata = update.custom_metadata

        manifest, catalog, run_results = self._load_artifacts()
        merged_nodes = self._merged_nodes(manifest)
        node = merged_nodes.get(unique_id)
        if node is None:
            raise KeyError(f"Unknown unique_id {unique_id}")
        test_nodes = self._test_map(manifest)
        test_statuses = self._test_status_map(run_results)
        catalog_nodes = {**catalog.get("nodes", {}), **catalog.get("sources", {})}
        catalog_node = catalog_nodes.get(unique_id, {})
        return self._column_lineup(unique_id, node, catalog_node, test_nodes, test_statuses)

    def validate(self) -> catalog_schemas.ValidationResponse:
        issues: List[catalog_schemas.ValidationIssue] = []
        severity_default = self.settings.validation_severity
        manifest, catalog, run_results = self._load_artifacts()
        merged_nodes = self._merged_nodes(manifest)
        test_nodes = self._test_map(manifest)
        test_statuses = self._test_status_map(run_results)
        catalog_nodes = {**catalog.get("nodes", {}), **catalog.get("sources", {})}

        for unique_id, node in merged_nodes.items():
            name = node.get("name") or unique_id
            description = node.get("description")
            if not description:
                issues.append(
                    catalog_schemas.ValidationIssue(
                        unique_id=unique_id,
                        entity_name=name,
                        entity_type=node.get("resource_type", "unknown"),
                        severity=severity_default,
                        message="Undocumented entity",
                    )
                )

            if not node.get("tags"):
                issues.append(
                    catalog_schemas.ValidationIssue(
                        unique_id=unique_id,
                        entity_name=name,
                        entity_type=node.get("resource_type", "unknown"),
                        severity=severity_default,
                        message="Missing tags",
                    )
                )

            override = self._entity_override(unique_id)
            owner = (node.get("meta", {}) or {}).get("owner") or (override.get("owner") if override else None)
            if not owner:
                issues.append(
                    catalog_schemas.ValidationIssue(
                        unique_id=unique_id,
                        entity_name=name,
                        entity_type=node.get("resource_type", "unknown"),
                        severity=severity_default,
                        message="Missing owner",
                    )
                )

            test_status, _ = self._test_status_for_entity(unique_id, test_nodes, test_statuses)
            if test_status in {"error", "fail"}:
                issues.append(
                    catalog_schemas.ValidationIssue(
                        unique_id=unique_id,
                        entity_name=name,
                        entity_type=node.get("resource_type", "unknown"),
                        severity="error",
                        message="Failing tests",
                    )
                )

            if node.get("resource_type") == "source":
                catalog_node = catalog_nodes.get(unique_id, {})
                freshness = self._freshness(catalog_node)
                if freshness is None or freshness.status is None:
                    issues.append(
                        catalog_schemas.ValidationIssue(
                            unique_id=unique_id,
                            entity_name=name,
                            entity_type=node.get("resource_type", "source"),
                            severity=severity_default,
                            message="Missing freshness checks",
                        )
                    )
                elif freshness.status == "late":
                    issues.append(
                        catalog_schemas.ValidationIssue(
                            unique_id=unique_id,
                            entity_name=name,
                            entity_type=node.get("resource_type", "source"),
                            severity="error",
                            message="Stale source",
                        )
                    )

            # Column-level validation
            catalog_node = catalog_nodes.get(unique_id, {})
            manifest_columns = node.get("columns", {}) or {}
            catalog_columns = catalog_node.get("columns", {}) or {}
            for col_name in set(manifest_columns.keys()) | set(catalog_columns.keys()):
                col_meta = manifest_columns.get(col_name, {})
                description = col_meta.get("description") or catalog_columns.get(col_name, {}).get("comment")
                if not description:
                    issues.append(
                        catalog_schemas.ValidationIssue(
                            unique_id=f"{unique_id}.{col_name}",
                            entity_name=col_name,
                            entity_type="column",
                            severity=severity_default,
                            message="Undocumented column",
                        )
                    )

                test_status, _ = self._test_status_for_entity(unique_id, test_nodes, test_statuses)
                if test_status in {"error", "fail"}:
                    issues.append(
                        catalog_schemas.ValidationIssue(
                            unique_id=f"{unique_id}.{col_name}",
                            entity_name=col_name,
                            entity_type="column",
                            severity="error",
                            message="Parent entity has failing tests",
                        )
                    )

        return catalog_schemas.ValidationResponse(issues=issues)

