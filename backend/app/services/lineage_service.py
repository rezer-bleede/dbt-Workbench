from collections import defaultdict, deque
from typing import Dict, Iterable, List, Optional, Set, Tuple

from app.core.config import Settings
from app.schemas import dbt as dbt_schemas
from app.services.artifact_service import ArtifactService


class LineageService:
    def __init__(self, artifact_service: ArtifactService, settings: Settings):
        self.artifact_service = artifact_service
        self.settings = settings

    def _load_artifacts(self) -> Tuple[Dict, Dict]:
        manifest = self.artifact_service.get_manifest() or {}
        catalog = self.artifact_service.get_catalog() or {}
        return manifest, catalog

    def _merged_nodes(self, manifest: Dict) -> Dict[str, Dict]:
        nodes = dict(manifest.get("nodes", {}))
        nodes.update(manifest.get("sources", {}))
        return nodes

    def _catalog_nodes(self, catalog: Dict) -> Dict[str, Dict]:
        nodes = dict(catalog.get("nodes", {}))
        nodes.update(catalog.get("sources", {}))
        return nodes

    def _collect_columns(self, manifest_nodes: Dict[str, Dict], catalog_nodes: Dict[str, Dict]) -> Dict[str, Dict[str, Dict]]:
        columns: Dict[str, Dict[str, Dict]] = {}
        for unique_id, node in manifest_nodes.items():
            manifest_columns = node.get("columns", {}) or {}
            catalog_columns = catalog_nodes.get(unique_id, {}).get("columns", {}) or {}
            names = set(manifest_columns.keys()) | set(catalog_columns.keys())
            merged_columns: Dict[str, Dict] = {}
            for name in sorted(names):
                manifest_meta = manifest_columns.get(name, {})
                catalog_meta = catalog_columns.get(name, {})
                merged_columns[name] = {
                    "name": manifest_meta.get("name") or catalog_meta.get("name") or name,
                    "description": manifest_meta.get("description") or catalog_meta.get("comment"),
                    "type": catalog_meta.get("type") or manifest_meta.get("data_type"),
                    "tags": manifest_meta.get("tags", []),
                }
            columns[unique_id] = merged_columns
        return columns

    def _build_model_nodes(self, manifest_nodes: Dict[str, Dict]) -> List[dbt_schemas.LineageNode]:
        nodes: List[dbt_schemas.LineageNode] = []
        for unique_id, node in sorted(manifest_nodes.items(), key=lambda item: item[0]):
            nodes.append(
                dbt_schemas.LineageNode(
                    id=unique_id,
                    label=node.get("alias") or node.get("name"),
                    type=node.get("resource_type", "model"),
                    database=node.get("database"),
                    schema=node.get("schema"),
                    tags=node.get("tags", []),
                )
            )
        return nodes

    def _build_model_edges(self, manifest_nodes: Dict[str, Dict]) -> List[dbt_schemas.LineageEdge]:
        edges: List[dbt_schemas.LineageEdge] = []
        for unique_id, node in manifest_nodes.items():
            for parent in node.get("depends_on", {}).get("nodes", []):
                edges.append(dbt_schemas.LineageEdge(source=parent, target=unique_id))
        return sorted(edges, key=lambda e: (e.source, e.target))

    def _build_groups(self, nodes: List[dbt_schemas.LineageNode]) -> List[dbt_schemas.LineageGroup]:
        schema_groups: Dict[str, List[str]] = defaultdict(list)
        resource_groups: Dict[str, List[str]] = defaultdict(list)
        tag_groups: Dict[str, List[str]] = defaultdict(list)

        for node in nodes:
            schema_parts = [part for part in [node.database, node.schema_] if part]
            schema_key = ".".join(schema_parts) or "default"
            schema_groups[schema_key].append(node.id)
            resource_groups[node.type].append(node.id)
            for tag in node.tags:
                tag_groups[tag].append(node.id)

        groups: List[dbt_schemas.LineageGroup] = []
        for schema_key, members in sorted(schema_groups.items()):
            groups.append(
                dbt_schemas.LineageGroup(
                    id=f"schema:{schema_key}",
                    label=schema_key,
                    type="schema",
                    members=sorted(members),
                )
            )
        for resource_type, members in sorted(resource_groups.items()):
            groups.append(
                dbt_schemas.LineageGroup(
                    id=f"resource:{resource_type}",
                    label=resource_type,
                    type="resource_type",
                    members=sorted(members),
                )
            )
        for tag, members in sorted(tag_groups.items()):
            groups.append(
                dbt_schemas.LineageGroup(
                    id=f"tag:{tag}",
                    label=tag,
                    type="tag",
                    members=sorted(members),
                )
            )
        return groups

    def _limit_depth(self, nodes: List[dbt_schemas.LineageNode], edges: List[dbt_schemas.LineageEdge], max_depth: Optional[int]) -> Tuple[List[dbt_schemas.LineageNode], List[dbt_schemas.LineageEdge]]:
        if not max_depth or max_depth < 1:
            return nodes, edges

        adjacency: Dict[str, List[str]] = defaultdict(list)
        reverse: Dict[str, List[str]] = defaultdict(list)
        for edge in edges:
            adjacency[edge.source].append(edge.target)
            reverse[edge.target].append(edge.source)

        indegree_zero = [node.id for node in nodes if not reverse.get(node.id)] or [n.id for n in nodes]
        visited: Set[str] = set()
        queue: deque[Tuple[str, int]] = deque([(node_id, 0) for node_id in indegree_zero])
        while queue:
            current, depth = queue.popleft()
            if current in visited:
                continue
            visited.add(current)
            if depth >= max_depth:
                continue
            for neighbor in adjacency.get(current, []):
                if neighbor not in visited:
                    queue.append((neighbor, depth + 1))

        filtered_nodes = [node for node in nodes if node.id in visited]
        filtered_edges = [edge for edge in edges if edge.source in visited and edge.target in visited]
        return filtered_nodes, filtered_edges

    def build_model_graph(self, max_depth: Optional[int] = None) -> dbt_schemas.LineageGraph:
        manifest, _ = self._load_artifacts()
        manifest_nodes = self._merged_nodes(manifest)
        nodes = self._build_model_nodes(manifest_nodes)
        edges = self._build_model_edges(manifest_nodes)
        if max_depth is None:
            max_depth = self.settings.max_initial_lineage_depth
        limited_nodes, limited_edges = self._limit_depth(nodes, edges, max_depth)
        groups = self._build_groups(nodes)
        return dbt_schemas.LineageGraph(nodes=limited_nodes, edges=limited_edges, groups=groups)

    def build_column_graph(self) -> dbt_schemas.ColumnLineageGraph:
        manifest, catalog = self._load_artifacts()
        manifest_nodes = self._merged_nodes(manifest)
        catalog_nodes = self._catalog_nodes(catalog)
        columns = self._collect_columns(manifest_nodes, catalog_nodes)

        column_nodes: List[dbt_schemas.ColumnNode] = []
        for model_id, col_map in sorted(columns.items()):
            node = manifest_nodes.get(model_id, {})
            for col_name, meta in sorted(col_map.items()):
                column_nodes.append(
                    dbt_schemas.ColumnNode(
                        id=f"{model_id}.{col_name}",
                        column=col_name,
                        model_id=model_id,
                        label=f"{node.get('alias') or node.get('name')}:{col_name}",
                        type=node.get("resource_type", "model"),
                        database=node.get("database"),
                        schema=node.get("schema"),
                        tags=meta.get("tags", []),
                        data_type=meta.get("type"),
                        description=meta.get("description"),
                    )
                )

        edges = self._build_model_edges(manifest_nodes)
        column_edges = self._build_column_edges(edges, columns)
        return dbt_schemas.ColumnLineageGraph(nodes=column_nodes, edges=sorted(column_edges, key=lambda e: (e.source, e.target)))

    def _build_column_edges(self, model_edges: List[dbt_schemas.LineageEdge], columns: Dict[str, Dict[str, Dict]]) -> List[dbt_schemas.ColumnLineageEdge]:
        column_edges: List[dbt_schemas.ColumnLineageEdge] = []
        for edge in model_edges:
            source_columns = columns.get(edge.source, {})
            target_columns = columns.get(edge.target, {})
            target_lookup = {name.lower(): name for name in target_columns.keys()}
            for src_name in sorted(source_columns.keys()):
                normalized = src_name.lower()
                if normalized in target_lookup:
                    tgt_name = target_lookup[normalized]
                    column_edges.append(
                        dbt_schemas.ColumnLineageEdge(
                            source=f"{edge.source}.{src_name}",
                            target=f"{edge.target}.{tgt_name}",
                            source_column=src_name,
                            target_column=tgt_name,
                        )
                    )
        return column_edges

    def get_grouping_metadata(self) -> List[dbt_schemas.LineageGroup]:
        graph = self.build_model_graph(max_depth=0)
        return graph.groups

    def get_model_lineage(self, model_id: str) -> dbt_schemas.ModelLineageDetail:
        manifest, catalog = self._load_artifacts()
        manifest_nodes = self._merged_nodes(manifest)
        catalog_nodes = self._catalog_nodes(catalog)
        node = manifest_nodes.get(model_id)
        if not node:
            return dbt_schemas.ModelLineageDetail(model_id=model_id)
        columns = self._collect_columns(manifest_nodes, catalog_nodes).get(model_id, {})
        parents = node.get("depends_on", {}).get("nodes", [])
        children = [child_id for child_id, child_node in manifest_nodes.items() if model_id in child_node.get("depends_on", {}).get("nodes", [])]
        return dbt_schemas.ModelLineageDetail(
            model_id=model_id,
            parents=sorted(parents),
            children=sorted(children),
            columns={name: {"description": meta.get("description"), "type": meta.get("type")} for name, meta in columns.items()},
            tags=node.get("tags", []),
            schema_=node.get("schema"),
            database=node.get("database"),
        )

    def _build_graph_maps(self, edges: Iterable[Tuple[str, str]]) -> Tuple[Dict[str, List[str]], Dict[str, List[str]]]:
        forward: Dict[str, List[str]] = defaultdict(list)
        backward: Dict[str, List[str]] = defaultdict(list)
        for source, target in edges:
            forward[source].append(target)
            backward[target].append(source)
        return forward, backward

    def _impact(self, node_id: str, edges: Iterable[Tuple[str, str]]) -> dbt_schemas.ImpactResponse:
        forward, backward = self._build_graph_maps(edges)

        upstream = self._traverse(node_id, backward)
        downstream = self._traverse(node_id, forward)
        return dbt_schemas.ImpactResponse(upstream=sorted(upstream), downstream=sorted(downstream))

    def _traverse(self, start: str, adjacency: Dict[str, List[str]]) -> Set[str]:
        visited: Set[str] = set()
        queue: deque[str] = deque(adjacency.get(start, []))
        while queue:
            current = queue.popleft()
            if current in visited:
                continue
            visited.add(current)
            for neighbor in adjacency.get(current, []):
                if neighbor not in visited:
                    queue.append(neighbor)
        return visited

    def get_model_impact(self, model_id: str) -> dbt_schemas.ModelImpactResponse:
        graph = self.build_model_graph(max_depth=None)
        edges = [(edge.source, edge.target) for edge in graph.edges]
        return dbt_schemas.ModelImpactResponse(model_id=model_id, impact=self._impact(model_id, edges))

    def get_column_impact(self, column_id: str) -> dbt_schemas.ColumnImpactResponse:
        graph = self.build_column_graph()
        edges = [(edge.source, edge.target) for edge in graph.edges]
        return dbt_schemas.ColumnImpactResponse(column_id=column_id, impact=self._impact(column_id, edges))
