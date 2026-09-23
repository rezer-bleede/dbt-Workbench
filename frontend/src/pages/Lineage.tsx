import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '../api/client'
import { Table } from '../components/Table'
import { LineageGraph as ReactFlowLineageGraph, type LineageGraphNode } from '../components/LineageGraph'
import { useAi } from '../context/AiContext'
import { RowLineageService } from '../services/rowLineageService'
import { SchedulerService } from '../services/schedulerService'
import {
  ColumnEvolutionChange,
  ColumnEvolutionEntry,
  ColumnEvolutionResponse,
  ColumnEvolutionStatus,
  ColumnLineageGraph,
  ColumnNode,
  EnvironmentConfig,
  ImpactResponse,
  LineageEdge,
  LineageGraph,
  LineageGroup,
  LineageNode,
  ModelDetail,
  RowLineageModelsResponse,
  RowLineagePreviewResponse,
  RowLineageStatus,
  RowLineageTraceResponse,
} from '../types'

type GroupingMode = 'none' | 'schema' | 'resource_type' | 'tag'
type ViewMode = 'model' | 'column' | 'row'
type ColumnLens = 'lineage' | 'evolution'

type GraphNode<T extends LineageNode | ColumnNode> = T & { isGroup?: boolean; isSubtree?: boolean }

type VisibleGraph<T extends LineageNode | ColumnNode> = {
  nodes: GraphNode<T>[]
  edges: LineageEdge[]
}


type LineageConfig = {
  default_grouping_mode?: GroupingMode
  max_initial_depth?: number
  load_column_lineage_by_default?: boolean
  performance_mode?: string
}

const nodeLabelLineMaxChars = 24
const nodeMetaMaxChars = 28
const emptyImpact: ImpactResponse = { upstream: [], downstream: [] }
const normalizeImpact = (value?: Partial<ImpactResponse>): ImpactResponse => ({
  upstream: value?.upstream ?? [],
  downstream: value?.downstream ?? [],
})

const groupColor: Record<string, { fill: string; stroke: string }> = {
  model: { fill: '#1f2937', stroke: '#3b82f6' },
  seed: { fill: '#1f2937', stroke: '#22c55e' },
  snapshot: { fill: '#1f2937', stroke: '#a855f7' },
  source: { fill: '#1f2937', stroke: '#fb923c' },
  test: { fill: '#1f2937', stroke: '#f59e0b' },
  row: { fill: '#1f2937', stroke: '#f472b6' },
  group: { fill: '#111827', stroke: '#9ca3af' },
  subtree: { fill: '#0f172a', stroke: '#e5e7eb' },
}

const getNodeColor = (node: LineageNode | ColumnNode): { fill: string; stroke: string } => {
  if ((node as GraphNode<LineageNode>).isGroup) return groupColor.group
  if ((node as GraphNode<LineageNode>).isSubtree) return groupColor.subtree
  return groupColor[node.type] || { fill: '#111827', stroke: '#9ca3af' }
}

const normalizeColumnId = (columnId: string) => columnId.replace(/\s+/g, '')
const rowTableColumnLimit = 6

const truncateWithEllipsis = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) return value
  if (maxChars <= 3) return value.slice(0, maxChars)
  return `${value.slice(0, maxChars - 3)}...`
}

const clampSvgTextLines = (value: string, maxLines: number, maxCharsPerLine: number): string[] => {
  const normalized = String(value || '').replace(/\r/g, '')
  const chunks = normalized
    .split('\n')
    .flatMap((lineText) => lineText.match(new RegExp(`.{1,${maxCharsPerLine}}`, 'g')) || [''])
  if (chunks.length === 0) return ['']
  if (chunks.length <= maxLines) return chunks

  const visible = chunks.slice(0, maxLines)
  if (maxCharsPerLine <= 3) {
    visible[maxLines - 1] = '.'.repeat(Math.max(1, maxCharsPerLine))
  } else {
    const tail = visible[maxLines - 1]
    visible[maxLines - 1] =
      tail.length >= maxCharsPerLine ? `${tail.slice(0, maxCharsPerLine - 3)}...` : `${tail}...`
  }
  return visible
}

type ResolvedColumnSelection = {
  columnId: string
  modelId: string
  column: string
}

const splitColumnId = (columnId: string): ResolvedColumnSelection => {
  const normalizedId = normalizeColumnId(columnId)
  const separatorIndex = normalizedId.lastIndexOf('.')
  if (separatorIndex < 0) {
    return { columnId: normalizedId, modelId: normalizedId, column: '' }
  }
  return {
    columnId: normalizedId,
    modelId: normalizedId.slice(0, separatorIndex),
    column: normalizedId.slice(separatorIndex + 1),
  }
}

const resolveColumnSelection = (input: string | Pick<ColumnNode, 'id' | 'model_id' | 'column'>): ResolvedColumnSelection => {
  if (typeof input === 'string') {
    return splitColumnId(input)
  }

  const normalizedId = normalizeColumnId(input.id)
  const normalizedModelId = normalizeColumnId(input.model_id || '')
  const normalizedColumn = normalizeColumnId(input.column || '')

  if (normalizedModelId && normalizedColumn) {
    return {
      columnId: `${normalizedModelId}.${normalizedColumn}`,
      modelId: normalizedModelId,
      column: normalizedColumn,
    }
  }

  if (normalizedModelId) {
    const columnFromId = normalizedId.startsWith(`${normalizedModelId}.`)
      ? normalizedId.slice(normalizedModelId.length + 1)
      : splitColumnId(normalizedId).column
    return {
      columnId: columnFromId ? `${normalizedModelId}.${columnFromId}` : normalizedId,
      modelId: normalizedModelId,
      column: columnFromId,
    }
  }

  return splitColumnId(normalizedId)
}

const formatValueForCell = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const formatValueForDetails = (value: unknown): { text: string; complex: boolean } => {
  if (value === null) return { text: 'null', complex: false }
  if (value === undefined) return { text: '', complex: false }
  if (typeof value === 'object') {
    try {
      return { text: JSON.stringify(value, null, 2), complex: true }
    } catch {
      return { text: String(value), complex: false }
    }
  }
  return { text: String(value), complex: false }
}

const dedupeWarnings = (warnings: Array<string | undefined> | undefined): string[] => {
  if (!warnings) return []
  const seen = new Set<string>()
  const output: string[] = []
  warnings.forEach((warning) => {
    if (!warning || seen.has(warning)) return
    seen.add(warning)
    output.push(warning)
  })
  return output
}

const buildGroupedGraph = <T extends LineageNode | ColumnNode>(
  graphNodes: T[],
  graphEdges: LineageEdge[],
  grouping: GroupingMode,
  groups: LineageGroup[],
  collapsedGroups: Set<string>,
  collapsedSubtrees: Record<string, Set<string>>,
): VisibleGraph<T> => {
  let nodes: (T & { isGroup?: boolean; isSubtree?: boolean })[] = [...graphNodes]
  let edges: LineageEdge[] = [...graphEdges]

  const filteredGroups = groups.filter((g) => grouping === 'none' ? false : g.type === grouping)

  filteredGroups.forEach((group) => {
    const groupId = `group:${group.id}`
    const memberSet = new Set(group.members)
    if (!collapsedGroups.has(groupId)) return
    nodes = nodes.filter((node) => !memberSet.has(node.id))
    const aggregated: any = {
      id: groupId,
      label: `${group.label} (${group.members.length})`,
      type: 'group',
      database: undefined,
      schema: undefined,
      tags: [],
      isGroup: true,
    }

    const nextEdges: LineageEdge[] = []
    edges.forEach((edge) => {
      const sourceIn = memberSet.has(edge.source)
      const targetIn = memberSet.has(edge.target)
      if (sourceIn && targetIn) return
      if (sourceIn && !targetIn) {
        nextEdges.push({ source: groupId, target: edge.target })
        return
      }
      if (!sourceIn && targetIn) {
        nextEdges.push({ source: edge.source, target: groupId })
        return
      }
      nextEdges.push(edge)
    })
    nodes.push(aggregated)
    edges = nextEdges
  })

  Object.entries(collapsedSubtrees).forEach(([rootId, members]) => {
    const memberSet = new Set(members)
    if (memberSet.size === 0) return
    nodes = nodes.filter((node) => !memberSet.has(node.id))
    const subtreeId = `subtree:${rootId}`
    const nextEdges: LineageEdge[] = []
    edges.forEach((edge) => {
      const sourceIn = memberSet.has(edge.source)
      const targetIn = memberSet.has(edge.target)
      if (sourceIn && targetIn) return
      if (edge.source === rootId && targetIn) {
        nextEdges.push({ source: rootId, target: subtreeId })
        return
      }
      if (sourceIn && edge.target === rootId) {
        nextEdges.push({ source: subtreeId, target: rootId })
        return
      }
      if (sourceIn && !targetIn) {
        nextEdges.push({ source: subtreeId, target: edge.target })
        return
      }
      if (!sourceIn && targetIn) {
        nextEdges.push({ source: edge.source, target: subtreeId })
        return
      }
      nextEdges.push(edge)
    })
    nodes.push({
      ...(nodes.find((n) => n.id === rootId) as T),
      id: subtreeId,
      label: `Collapsed from ${rootId}`,
      isSubtree: true,
      type: 'group',
    })
    edges = nextEdges
  })

  return { nodes, edges }
}

function LineagePage() {
  const navigate = useNavigate()
  const { openPanel } = useAi()
  const [graph, setGraph] = useState<LineageGraph>({ nodes: [], edges: [], groups: [] })
  const [columnGraph, setColumnGraph] = useState<ColumnLineageGraph>({ nodes: [], edges: [] })
  const [groupMode, setGroupMode] = useState<GroupingMode>('none')
  const [viewMode, setViewMode] = useState<ViewMode>('model')
  const [columnLens, setColumnLens] = useState<ColumnLens>('lineage')
  const [columnEvolution, setColumnEvolution] = useState<ColumnEvolutionResponse | null>(null)
  const [columnEvolutionLoading, setColumnEvolutionLoading] = useState(false)
  const [columnEvolutionError, setColumnEvolutionError] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [collapsedSubtrees, setCollapsedSubtrees] = useState<Record<string, Set<string>>>({})
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null)
  const [impact, setImpact] = useState<ImpactResponse>(emptyImpact)
  const [modelDetail, setModelDetail] = useState<ModelDetail | null>(null)
  const [config, setConfig] = useState<LineageConfig>({})
  const [maxDepth, setMaxDepth] = useState<number | undefined>(undefined)

  // Row lineage state
  const [rowStatus, setRowStatus] = useState<RowLineageStatus | null>(null)
  const [rowStatusLoading, setRowStatusLoading] = useState(false)
  const [rowModels, setRowModels] = useState<RowLineageModelsResponse | null>(null)
  const [rowModelsLoading, setRowModelsLoading] = useState(false)
  const [rowEnvironmentId, setRowEnvironmentId] = useState<number | ''>('')
  const [environments, setEnvironments] = useState<EnvironmentConfig[]>([])
  const [rowSelectedModelUniqueId, setRowSelectedModelUniqueId] = useState<string>('')
  const [rowPreview, setRowPreview] = useState<RowLineagePreviewResponse | null>(null)
  const [rowPreviewLoading, setRowPreviewLoading] = useState(false)
  const [rowTrace, setRowTrace] = useState<RowLineageTraceResponse | null>(null)
  const [rowTraceLoading, setRowTraceLoading] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)
  const [rowSelectedNodeId, setRowSelectedNodeId] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<{ lineage?: LineageConfig }>('/config')
      .then((res) => {
        const lineage = res.data?.lineage || {}
        setConfig(lineage)
        if (lineage.default_grouping_mode) setGroupMode(lineage.default_grouping_mode)
        if (lineage.max_initial_depth) setMaxDepth(lineage.max_initial_depth)
        if (lineage.load_column_lineage_by_default) {
          fetchColumnGraph()
        }
      })
      .catch(() => undefined)
  }, [])

  const fetchGraph = (depth?: number) => {
    const query = depth ? `?max_depth=${depth}` : ''
    api
      .get<LineageGraph>(`/lineage/graph${query}`)
      .then((res) => setGraph({ groups: res.data.groups || [], nodes: res.data.nodes, edges: res.data.edges }))
      .catch(() => setGraph({ nodes: [], edges: [], groups: [] }))
  }

  const fetchColumnGraph = () => {
    api
      .get<ColumnLineageGraph>('/lineage/columns')
      .then((res) => setColumnGraph(res.data))
      .catch(() => setColumnGraph({ nodes: [], edges: [] }))
  }

  const fetchColumnEvolution = useCallback(() => {
    setColumnEvolutionLoading(true)
    setColumnEvolutionError(null)
    api
      .get<ColumnEvolutionResponse>('/lineage/columns/evolution')
      .then((res) => setColumnEvolution(res.data))
      .catch((err) => {
        const message = err?.response?.data?.message || err?.message || 'Failed to load column evolution.'
        setColumnEvolutionError(message)
        setColumnEvolution(null)
      })
      .finally(() => setColumnEvolutionLoading(false))
  }, [])

  const loadRowStatus = () => {
    setRowStatusLoading(true)
    RowLineageService.getStatus()
      .then((status) => setRowStatus(status))
      .catch(() =>
        setRowStatus({
          enabled: false,
          available: false,
          mapping_path: 'lineage/lineage.jsonl',
          mapping_mtime: null,
          mapping_count: 0,
          roots: [],
          models: [],
          warnings: ['Failed to load row lineage status.'],
        }),
      )
      .finally(() => setRowStatusLoading(false))
  }

  const loadRowModels = () => {
    setRowModelsLoading(true)
    RowLineageService.listModels()
      .then((payload) => setRowModels(payload))
      .catch(() => setRowModels({ roots: [], models: [], warnings: ['Failed to load row lineage models.'] }))
      .finally(() => setRowModelsLoading(false))
  }

  const loadEnvironments = () => {
    SchedulerService.listEnvironments()
      .then((envs) => {
        setEnvironments(envs)
        setRowEnvironmentId((prev) => {
          const exists = typeof prev === 'number' && envs.some((env) => env.id === prev)
          if (exists) return prev
          return envs.length > 0 ? envs[0].id : ''
        })
      })
      .catch(() => {
        const now = new Date().toISOString()
        const fallback = [
          {
            id: 0,
            name: 'default',
            description: 'Auto-created fallback environment',
            variables: {},
            created_at: now,
            updated_at: now,
          },
        ] as EnvironmentConfig[]
        setEnvironments(fallback)
        setRowEnvironmentId(0)
      })
  }

  useEffect(() => {
    fetchGraph(config.max_initial_depth)
  }, [config.max_initial_depth])

  useEffect(() => {
    if (viewMode !== 'column') return
    if (columnLens !== 'evolution') return
    fetchColumnEvolution()
  }, [columnLens, fetchColumnEvolution, viewMode])

  useEffect(() => {
    loadRowStatus()
    loadEnvironments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!rowStatus?.enabled) return
    loadRowModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowStatus?.enabled, rowStatus?.available])

  useEffect(() => {
    if (rowSelectedModelUniqueId || !rowModels) return
    const preferred =
      rowModels.roots.find((root) => root.model_unique_id)?.model_unique_id ||
      rowModels.models.find((model) => model.model_unique_id)?.model_unique_id ||
      ''
    if (preferred) {
      setRowSelectedModelUniqueId(preferred)
    }
  }, [rowModels, rowSelectedModelUniqueId])

  const highlightNodes = useMemo(() => {
    const activeImpact = impact || emptyImpact
    const set = new Set<string>()
    if (viewMode === 'model' && selectedNode) {
      set.add(selectedNode)
      activeImpact.upstream.forEach((n) => set.add(n))
      activeImpact.downstream.forEach((n) => set.add(n))
    }
    if (viewMode === 'column' && selectedColumn) {
      set.add(selectedColumn)
      activeImpact.upstream.forEach((n) => set.add(n))
      activeImpact.downstream.forEach((n) => set.add(n))
    }
    if (viewMode === 'row' && rowSelectedNodeId) {
      set.add(rowSelectedNodeId)
    }
    return set
  }, [impact, rowSelectedNodeId, selectedColumn, selectedNode, viewMode])

  const rowGraph = useMemo<LineageGraph>(() => {
    if (!rowTrace) return { nodes: [], edges: [], groups: [] }
    const nodes: LineageNode[] = rowTrace.graph.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      type: 'row',
      database: node.database ?? undefined,
      schema: node.schema ?? undefined,
      tags: [],
    }))
    const edges: LineageEdge[] = rowTrace.graph.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    }))
    return { nodes, edges, groups: [] }
  }, [rowTrace])

  const columnGraphFiltered = useMemo<ColumnLineageGraph>(() => {
    if (columnGraph.nodes.length === 0) return columnGraph

    const normalize = (id: string) => normalizeColumnId(id)
    const connected = new Set<string>()
    columnGraph.edges.forEach((edge) => {
      connected.add(normalize(edge.source))
      connected.add(normalize(edge.target))
    })

    if (!selectedColumn) {
      const nodes = columnGraph.nodes.filter((node) => connected.has(normalize(node.id)))
      return { nodes, edges: columnGraph.edges }
    }

    const focus = new Set<string>([
      normalize(selectedColumn),
      ...impact.upstream.map((n) => normalize(n)),
      ...impact.downstream.map((n) => normalize(n)),
    ])
    if (impact.upstream.length + impact.downstream.length === 0) {
      const selected = normalize(selectedColumn)
      columnGraph.edges.forEach((edge) => {
        const source = normalize(edge.source)
        const target = normalize(edge.target)
        if (source === selected) focus.add(target)
        if (target === selected) focus.add(source)
      })
    }
    const nodes = columnGraph.nodes.filter((node) => focus.has(normalize(node.id)))
    const edges = columnGraph.edges.filter(
      (edge) => focus.has(normalize(edge.source)) && focus.has(normalize(edge.target)),
    )
    return { nodes, edges }
  }, [columnGraph.edges, columnGraph.nodes, impact.downstream, impact.upstream, selectedColumn])

  const activeGraph = viewMode === 'model' ? graph : viewMode === 'column' ? columnGraphFiltered : rowGraph
  const groups = viewMode === 'model' ? graph.groups || [] : []

  const visibleGraph = useMemo(() => {
    return buildGroupedGraph(
      activeGraph.nodes as any,
      activeGraph.edges as any,
      groupMode,
      groups,
      collapsedGroups,
      collapsedSubtrees,
    )
  }, [activeGraph.edges, activeGraph.nodes, collapsedGroups, collapsedSubtrees, groupMode, groups])

  const hasData = visibleGraph.nodes.length > 0
  const emptyGraphMessage =
    viewMode === 'row'
      ? rowTraceLoading
        ? 'Loading row lineage...'
        : rowPreview
          ? 'Select a row to view lineage.'
          : 'Load rows to start.'
      : viewMode === 'column'
        ? selectedColumn
          ? 'No column lineage available for this selection.'
          : 'Select a column to view lineage.'
        : 'No lineage data available.'

  const resolveNodeColor = (node: LineageNode | ColumnNode): { fill: string; stroke: string } => {
    const base = getNodeColor(node)
    if (viewMode !== 'column' || columnLens !== 'evolution') {
      return base
    }
    if ((node as GraphNode<LineageNode>).isGroup || (node as GraphNode<LineageNode>).isSubtree) {
      return base
    }
    const status = columnEvolutionStatus.get(normalizeColumnId(node.id))
    if (status === 'added') {
      return { fill: '#0f172a', stroke: '#22c55e' }
    }
    if (status === 'changed') {
      return { fill: '#0f172a', stroke: '#f59e0b' }
    }
    return base
  }

  const graphContainerRef = useRef<HTMLDivElement | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === graphContainerRef.current)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    const target = graphContainerRef.current
    if (!target) return
    if (document.fullscreenElement === target) {
      document.exitFullscreen?.().catch(() => undefined)
      return
    }
    target.requestFullscreen?.().catch(() => undefined)
  }

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const collapseSubtree = (rootId: string) => {
    setCollapsedSubtrees((prev) => {
      const next = { ...prev }
      if (next[rootId]) {
        delete next[rootId]
        return next
      }
      const members = new Set<string>()
      visibleGraph.edges.forEach((edge) => {
        if (edge.source === rootId) members.add(edge.target)
      })
      if (members.size > 0) next[rootId] = members
      return next
    })
  }

  const selectModelNode = (nodeId: string) => {
    setViewMode('model')
    setSelectedColumn(null)
    setSelectedNode(nodeId)
    api
      .get<ImpactResponse>(`/lineage/upstream/${encodeURIComponent(nodeId)}`)
      .then((res) => setImpact(normalizeImpact(res.data)))
      .catch(() => setImpact(emptyImpact))
    api.get<ModelDetail>(`/lineage/model/${encodeURIComponent(nodeId)}`).then((res) => setModelDetail(res.data))
  }

  const selectColumnNode = (columnRef: string | Pick<ColumnNode, 'id' | 'model_id' | 'column'>) => {
    const resolved = resolveColumnSelection(columnRef)
    setViewMode('column')
    setSelectedNode(null)
    setSelectedColumn(resolved.columnId)
    const query = resolved.column ? `?column=${encodeURIComponent(resolved.column)}` : ''
    api
      .get<ImpactResponse>(`/lineage/upstream/${encodeURIComponent(resolved.modelId)}${query}`)
      .then((res) => setImpact(normalizeImpact(res.data)))
      .catch(() => setImpact(emptyImpact))
  }

  const handleNodeClick = (node: LineageGraphNode) => {
    if (node.isGroup || node.isSubtree) {
      return
    }
    if (viewMode === 'model') {
      selectModelNode(node.id)
    } else if (viewMode === 'column') {
      const columnNode = node as ColumnNode
      selectColumnNode({ id: columnNode.id, model_id: columnNode.model_id, column: columnNode.column })
    } else {
      setRowSelectedNodeId(node.id)
    }
  }

  const visibleGroups = useMemo(
    () => (groupMode === 'none' ? [] : groups.filter((g) => g.type === groupMode)),
    [groupMode, groups],
  )

  const deselectColumnView = () => {
    setViewMode('model')
    setSelectedColumn(null)
    setImpact(emptyImpact)
  }

  const rowMappingPath = rowStatus?.mapping_path || 'lineage/lineage.jsonl'
  const rowAvailable = Boolean(rowStatus?.enabled && rowStatus?.available)
  const rowTraceColumn = rowPreview?.trace_column || '_row_trace_id'
  const rowModelOptions = rowModels?.models || []
  const rowWarnings = useMemo(
    () =>
      dedupeWarnings([
        ...(rowStatus?.warnings || []),
        ...(rowModels?.warnings || []),
        ...(rowPreview?.warnings || []),
        ...(rowTrace?.warnings || []),
      ]),
    [rowModels?.warnings, rowPreview?.warnings, rowStatus?.warnings, rowTrace?.warnings],
  )

  const columnEvolutionStatus = useMemo(() => {
    const map = new Map<string, ColumnEvolutionStatus>()
    const statusMap = columnEvolution?.status_by_id || {}
    Object.entries(statusMap).forEach(([columnId, status]) => {
      map.set(normalizeColumnId(columnId), status)
    })
    return map
  }, [columnEvolution])

  const columnEvolutionAdded = columnEvolution?.added || []
  const columnEvolutionRemoved = columnEvolution?.removed || []
  const columnEvolutionChanged = columnEvolution?.changed || []

  const rowTableColumns = useMemo(() => {
    if (!rowPreview) return []
    const sourceColumns =
      rowPreview.columns && rowPreview.columns.length > 0
        ? rowPreview.columns
        : Object.keys(rowPreview.rows?.[0] || {})
    const nonTraceColumns = sourceColumns.filter((col) => col !== rowTraceColumn)
    const limited = nonTraceColumns.slice(0, rowTableColumnLimit)
    const finalColumns = [...limited]
    if (!finalColumns.includes(rowTraceColumn)) {
      finalColumns.push(rowTraceColumn)
    }
    return finalColumns.map((key) => ({
      key,
      header: key,
      render: (row: Record<string, any>) => formatValueForCell(row[key]),
    }))
  }, [rowPreview, rowTraceColumn])

  const selectedRowNode = useMemo(() => {
    if (!rowTrace) return null
    if (rowSelectedNodeId) {
      return rowTrace.graph.nodes.find((node) => node.id === rowSelectedNodeId) || null
    }
    const fallbackId = `row:${rowTrace.target.model_name}:${rowTrace.target.trace_id}`
    return rowTrace.graph.nodes.find((node) => node.id === fallbackId) || null
  }, [rowSelectedNodeId, rowTrace])

  const selectedRowEntries = selectedRowNode?.row ? Object.entries(selectedRowNode.row) : []
  const selectedRowModelName = selectedRowNode?.model_name || rowTrace?.target.model_name || ''
  const selectedRowTraceId = selectedRowNode?.trace_id || rowTrace?.target.trace_id || ''
  const selectedRowRelationName = selectedRowNode?.relation_name || rowTrace?.target.relation_name || ''

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    if (mode === 'column' && columnGraph.nodes.length === 0) {
      fetchColumnGraph()
    }
    if (mode === 'column' && !selectedColumn && columnGraph.nodes.length > 0) {
      const firstNode = columnGraph.nodes[0]
      selectColumnNode({ id: firstNode.id, model_id: firstNode.model_id, column: firstNode.column })
    }
    if (mode === 'row' && !rowStatusLoading && !rowStatus) {
      loadRowStatus()
    }
  }

  const handleLoadRows = () => {
    if (!rowSelectedModelUniqueId) return
    setRowError(null)
    setRowPreviewLoading(true)
    setRowTrace(null)
    setRowSelectedNodeId(null)
    RowLineageService.previewModel({
      model_unique_id: rowSelectedModelUniqueId,
      environment_id: typeof rowEnvironmentId === 'number' ? rowEnvironmentId : undefined,
      limit: 100,
    })
      .then((payload) => setRowPreview(payload))
      .catch((err) => {
        const message = err?.response?.data?.message || err?.message || 'Failed to load rows.'
        setRowError(message)
      })
      .finally(() => setRowPreviewLoading(false))
  }

  const handleRowClick = (row: Record<string, any>) => {
    if (!rowSelectedModelUniqueId) return
    const traceId = row?.[rowTraceColumn]
    if (!traceId) {
      setRowError(`Row is missing ${rowTraceColumn}.`)
      return
    }
    setRowError(null)
    setRowTraceLoading(true)
    setRowTrace(null)
    const traceIdStr = String(traceId)
    const targetNodeId = rowPreview ? `row:${rowPreview.model_name}:${traceIdStr}` : null
    if (targetNodeId) {
      setRowSelectedNodeId(targetNodeId)
    }
    RowLineageService.getTrace(rowSelectedModelUniqueId, traceIdStr, {
      environment_id: typeof rowEnvironmentId === 'number' ? rowEnvironmentId : undefined,
    })
      .then((payload) => {
        setRowTrace(payload)
        const nextSelectedId = `row:${payload.target.model_name}:${payload.target.trace_id}`
        setRowSelectedNodeId(nextSelectedId)
      })
      .catch((err) => {
        const message = err?.response?.data?.message || err?.message || 'Failed to load row lineage.'
        setRowError(message)
      })
      .finally(() => setRowTraceLoading(false))
  }

  const handleAiLineageExplain = () => {
    const targetNode = selectedNode || rowSelectedModelUniqueId || ''
    const prompt = selectedColumn
      ? `Explain lineage impact for node '${targetNode}' and column '${selectedColumn}'. Include likely upstream and downstream implications.`
      : targetNode
        ? `Explain lineage impact for node '${targetNode}', including critical upstream and downstream dependencies.`
        : 'Summarize the current lineage graph and identify high-impact dependencies.'

    openPanel({
      prompt,
      context: {
        lineage_graph: true,
        lineage_node_id: targetNode || undefined,
        lineage_column: selectedColumn || undefined,
      },
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap gap-3 items-center justify-end">
          <button
            type="button"
            onClick={handleAiLineageExplain}
            className="panel-gradient-subtle rounded border border-border px-3 py-2 text-sm text-text hover:bg-panel/70"
          >
            AI Explain Lineage
          </button>
          <div className="flex rounded-md border border-border overflow-hidden shrink-0">
            {([
              { id: 'model', label: 'Model' },
              { id: 'column', label: 'Column' },
              { id: 'row', label: 'Row' },
            ] as Array<{ id: ViewMode; label: string }>).map((mode, idx) => {
              const active = viewMode === mode.id
              return (
                <button
                  key={mode.id}
                  onClick={() => handleViewModeChange(mode.id)}
                  className={`px-3 py-2 text-sm ${
                    idx > 0 ? 'border-l border-border' : ''
                  } ${active ? 'bg-accent text-text' : 'panel-gradient-subtle text-text hover:bg-panel/70'}`}
                >
                  {mode.label}
                </button>
              )
            })}
          </div>

          {viewMode !== 'row' && (
            <>
              {viewMode === 'column' && (
                <select
                  value={columnLens}
                  onChange={(e) => setColumnLens(e.target.value as ColumnLens)}
                  className="panel-gradient-subtle border border-border rounded px-3 py-2 text-sm"
                >
                  <option value="lineage">Column lineage</option>
                  <option value="evolution">Column evolution</option>
                </select>
              )}
              <select
                value={groupMode}
                onChange={(e) => setGroupMode(e.target.value as GroupingMode)}
                className="panel-gradient-subtle border border-border rounded px-3 py-2 text-sm"
              >
                <option value="none">No grouping</option>
                <option value="schema">Schema</option>
                <option value="resource_type">Resource type</option>
                <option value="tag">Tags</option>
              </select>
              <input
                type="number"
                min={1}
                value={maxDepth ?? ''}
                onChange={(e) => {
                  const value = e.target.value ? Number(e.target.value) : undefined
                  setMaxDepth(value)
                  fetchGraph(value)
                }}
                placeholder="Max depth"
                className="panel-gradient-subtle border border-border rounded px-3 py-2 text-sm w-28"
              />
            </>
          )}

          <button
            onClick={() => {
              if (viewMode === 'row') {
                const environmentId =
                  typeof rowEnvironmentId === 'number' && Number.isFinite(rowEnvironmentId)
                    ? rowEnvironmentId
                    : undefined
                RowLineageService.exportMappings({ environment_id: environmentId })
                  .then((payload) => {
                    setRowStatus(payload.status)
                    if (payload.status.enabled) {
                      loadRowModels()
                    }
                  })
                  .catch(() => {
                    loadRowStatus()
                    if (rowStatus?.enabled) {
                      loadRowModels()
                    }
                  })
                return
              }
              if (viewMode === 'column') {
                fetchColumnGraph()
                if (columnLens === 'evolution') {
                  fetchColumnEvolution()
                }
                return
              }
              fetchGraph(maxDepth)
              if (config.load_column_lineage_by_default) fetchColumnGraph()
            }}
            className="bg-accent text-text px-4 py-2 rounded text-sm"
          >
            {viewMode === 'row' ? 'Refresh row lineage' : 'Refresh'}
          </button>
          {viewMode === 'column' && (
            <button onClick={deselectColumnView} className="bg-surface-muted text-text px-4 py-2 rounded text-sm border border-border">
              Return to models
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-9 panel-gradient rounded-lg p-4 space-y-4">
          {viewMode === 'row' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1 min-w-[180px]">
                  <label className="text-xs text-muted">Environment</label>
                  <select
                    value={rowEnvironmentId}
                    onChange={(e) => {
                      const value = e.target.value ? Number(e.target.value) : ''
                      setRowEnvironmentId(value)
                    }}
                    className="panel-gradient-subtle border border-border rounded px-3 py-2 text-sm"
                    data-testid="row-lineage-environment-select"
                  >
                    <option value="">Default</option>
                    {environments.map((env) => (
                      <option key={env.id} value={env.id}>
                        {env.name}
                        {env.dbt_target_name ? ` (${env.dbt_target_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1 min-w-[260px]">
                  <label className="text-xs text-muted">Model</label>
                  <select
                    value={rowSelectedModelUniqueId}
                    onChange={(e) => {
                      setRowSelectedModelUniqueId(e.target.value)
                      setRowPreview(null)
                      setRowTrace(null)
                      setRowSelectedNodeId(null)
                      setRowError(null)
                    }}
                    className="panel-gradient-subtle border border-border rounded px-3 py-2 text-sm"
                    disabled={rowStatusLoading || rowModelsLoading}
                    data-testid="row-lineage-model-select"
                  >
                    <option value="">Select a model</option>
                    {rowModelOptions
                      .filter((model) => model.model_unique_id)
                      .map((model) => {
                        const schemaSuffix = model.schema ? ` - ${model.schema}` : ''
                        const rootPrefix = model.is_root ? '[root] ' : ''
                        return (
                          <option key={model.model_unique_id || model.model_name} value={model.model_unique_id || ''}>
                            {rootPrefix}
                            {model.model_name}
                            {schemaSuffix}
                          </option>
                        )
                      })}
                  </select>
                </div>

                <button
                  onClick={handleLoadRows}
                  disabled={!rowAvailable || !rowSelectedModelUniqueId || rowPreviewLoading}
                  className="bg-accent text-text px-4 py-2 rounded text-sm disabled:opacity-60"
                  data-testid="row-lineage-load-rows"
                >
                  {rowPreviewLoading ? 'Loading rows...' : 'Load rows'}
                </button>
              </div>

              {rowStatusLoading && <div className="text-xs text-muted">Loading row lineage status...</div>}

              {rowStatus && !rowStatusLoading && !rowAvailable && (
                <div className="rounded-lg border border-amber-700/60 bg-amber-950/40 p-4 text-sm text-amber-100 space-y-2">
                  <div className="font-semibold">Row lineage mappings not found at {rowMappingPath}</div>
                  <div className="text-amber-200">Enable dbt-rowlineage export:</div>
                  <pre className="text-xs panel-gradient-subtle border border-amber-800/60 rounded p-3 overflow-auto">
{`vars:
  rowlineage_enabled: true
  rowlineage_export_format: jsonl
  rowlineage_export_path: target/lineage/lineage.jsonl`}
                  </pre>
                </div>
              )}

              {rowError && (
                <div className="rounded border border-red-800/70 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                  {rowError}
                </div>
              )}

              {rowAvailable && rowWarnings.length > 0 && (
                <div className="rounded border border-amber-800/70 bg-amber-950/30 px-3 py-2 text-xs text-amber-200 space-y-1">
                  {rowWarnings.map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))}
                </div>
              )}

              {rowAvailable && rowPreview && !rowPreview.trace_column_present && (
                <div className="rounded border border-amber-800/70 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                  Table does not contain _row_trace_id; trace ids are computed heuristically for browsing.
                </div>
              )}

              {rowAvailable && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-text">Sample Rows</h3>
                    {rowPreview && (
                      <div className="text-[11px] text-muted">
                        {rowPreview.relation_name}
                      </div>
                    )}
                  </div>
                  {rowPreview ? (
                    rowPreview.rows.length > 0 ? (
                      <Table columns={rowTableColumns} data={rowPreview.rows} onRowClick={handleRowClick} />
                    ) : (
                      <div className="text-xs text-muted">No rows returned for this model.</div>
                    )
                  ) : (
                    <div className="text-xs text-muted">Load rows to explore row-level lineage.</div>
                  )}
                </div>
              )}
            </div>
          )}

          {(viewMode !== 'row' || rowAvailable) &&
            (!hasData ? (
              <div className="text-muted">{emptyGraphMessage}</div>
            ) : (
              <div
                ref={graphContainerRef}
                className={`relative rounded-lg overflow-hidden border border-border/60 bg-gradient-to-br from-gray-950 via-slate-950 to-gray-900 ${
                  isFullscreen ? 'h-full w-full' : 'h-[720px]'
                }`}
                data-testid="lineage-graph-container"
              >
                <ReactFlowLineageGraph
                  nodes={visibleGraph.nodes}
                  edges={visibleGraph.edges}
                  highlighted={highlightNodes}
                  resolveColor={resolveNodeColor}
                  onNodeClick={handleNodeClick}
                  isFullscreen={isFullscreen}
                  onToggleFullscreen={toggleFullscreen}
                />
              </div>
            ))}
        </div>

        <div className="col-span-3 space-y-4">
          {viewMode !== 'row' ? (
            <>
          <div className="panel-gradient rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Grouping</h3>
              <span className="text-[11px] text-muted">Mode: {groupMode}</span>
            </div>
            <div className="space-y-2 max-h-48 overflow-auto pr-1">
              {groupMode === 'none' && (
                <div className="text-xs text-muted">
                  Grouping is disabled. Select Schema, Resource type, or Tags to enable collapse controls.
                </div>
              )}
              {groupMode !== 'none' &&
                visibleGroups.map((group) => {
                  const groupId = `group:${group.id}`
                  const collapsed = collapsedGroups.has(groupId)
                  return (
                    <div key={group.id} className="flex items-center justify-between gap-2 text-sm text-text">
                      <div className="min-w-0">
                        <div className="font-medium truncate" title={group.label}>
                          {group.label}
                        </div>
                        <div className="text-[11px] text-muted">{group.members.length} nodes</div>
                      </div>
                      <button
                        onClick={() => toggleGroup(groupId)}
                        className="text-xs px-2 py-1 border border-border rounded shrink-0"
                      >
                        {collapsed ? 'Expand' : 'Collapse'}
                      </button>
                    </div>
                  )
                })}
              {groupMode !== 'none' && visibleGroups.length === 0 && (
                <div className="text-xs text-muted">No groups available for this mode.</div>
              )}
            </div>
          </div>

          <div className="panel-gradient rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <h3 className="text-sm font-semibold text-text">Selection</h3>
              {selectedNode && (
                <button
                  onClick={() => navigate(`/models/${selectedNode}`)}
                  className="text-xs text-accent underline shrink-0"
                >
                  Open model
                </button>
              )}
            </div>
            {selectedNode && modelDetail && (
              <div className="space-y-2">
                <div className="text-text text-sm font-medium break-all" title={modelDetail.model_id}>
                  {modelDetail.model_id}
                </div>
                <div className="text-[11px] text-muted">Parents: {modelDetail.parents.length} | Children: {modelDetail.children.length}</div>
                <div className="flex flex-wrap gap-1">
                  {(modelDetail.tags || []).map((tag) => (
                    <span key={tag} className="text-[10px] bg-surface-muted px-2 py-1 rounded-full text-text">{tag}</span>
                  ))}
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted font-semibold">Columns</div>
                  <div className="max-h-32 overflow-auto space-y-1">
                    {Object.entries(modelDetail.columns || {}).map(([col, meta]) => {
                      const columnId = `${modelDetail.model_id}.${col}`
                      return (
                        <button
                          key={col}
                          onClick={() => selectColumnNode({ id: columnId, model_id: modelDetail.model_id, column: col })}
                          className="w-full text-left text-[11px] px-2 py-1 bg-panel/70 rounded hover:bg-surface-muted"
                        >
                          <div className="text-text">{col}</div>
                          {meta.description && <div className="text-muted truncate">{meta.description}</div>}
                        </button>
                      )
                    })}
                    {Object.keys(modelDetail.columns || {}).length === 0 && <div className="text-[11px] text-muted">No columns.</div>}
                  </div>
                </div>
                <button
                  onClick={() => collapseSubtree(selectedNode)}
                  className="text-xs px-3 py-1 bg-surface-muted border border-border rounded"
                >
                  Toggle collapse subtree
                </button>
              </div>
            )}
            {selectedColumn && (
              <div className="space-y-1 text-sm text-text">
                <div className="font-semibold break-all" title={selectedColumn}>
                  {selectedColumn}
                </div>
                <div className="text-[11px] text-muted">Upstream: {impact.upstream.length} | Downstream: {impact.downstream.length}</div>
              </div>
            )}
            {!selectedNode && !selectedColumn && <div className="text-xs text-muted">Select a node to view details.</div>}
          </div>

          {viewMode === 'column' && columnLens === 'evolution' && (
            <div className="panel-gradient rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text">Column Evolution</h3>
                {columnEvolution?.summary && (
                  <span className="text-[11px] text-muted">
                    {columnEvolution.summary.added + columnEvolution.summary.changed + columnEvolution.summary.removed} changes
                  </span>
                )}
              </div>
              {columnEvolutionLoading && <div className="text-xs text-muted">Loading column evolution...</div>}
              {columnEvolutionError && (
                <div className="text-xs text-red-300">{columnEvolutionError}</div>
              )}
              {!columnEvolutionLoading && !columnEvolutionError && columnEvolution && !columnEvolution.available && (
                <div className="text-xs text-muted">
                  {columnEvolution.message || 'Column evolution is not available yet.'}
                </div>
              )}
              {!columnEvolutionLoading && columnEvolution?.available && columnEvolution.summary && (
                <div className="space-y-2 text-xs text-text">
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded bg-emerald-900/40 border border-emerald-700/50 px-2 py-1 text-emerald-200">
                      Added {columnEvolution.summary.added}
                    </span>
                    <span className="rounded bg-amber-900/40 border border-amber-700/50 px-2 py-1 text-amber-200">
                      Changed {columnEvolution.summary.changed}
                    </span>
                    <span className="rounded bg-rose-900/40 border border-rose-700/50 px-2 py-1 text-rose-200">
                      Removed {columnEvolution.summary.removed}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted">
                    Compared manifest v{columnEvolution.baseline_version?.version ?? '?'} → v{columnEvolution.current_version?.version ?? '?'}
                  </div>
                  <div className="space-y-2 max-h-56 overflow-auto pr-1">
                    {columnEvolutionAdded.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[11px] uppercase tracking-wide text-emerald-300">Added</div>
                        {columnEvolutionAdded.map((entry: ColumnEvolutionEntry) => (
                          <button
                            key={entry.column_id}
                            onClick={() =>
                              selectColumnNode({ id: entry.column_id, model_id: entry.model_id, column: entry.column })
                            }
                            className="w-full text-left rounded bg-emerald-950/40 border border-emerald-800/40 px-2 py-1 text-[11px] hover:bg-emerald-900/40"
                          >
                            {entry.model_name}:{entry.column}
                          </button>
                        ))}
                      </div>
                    )}
                    {columnEvolutionChanged.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[11px] uppercase tracking-wide text-amber-300">Changed</div>
                        {columnEvolutionChanged.map((entry: ColumnEvolutionChange) => (
                          <button
                            key={entry.column_id}
                            onClick={() =>
                              selectColumnNode({ id: entry.column_id, model_id: entry.model_id, column: entry.column })
                            }
                            className="w-full text-left rounded bg-amber-950/40 border border-amber-800/40 px-2 py-1 text-[11px] hover:bg-amber-900/40"
                          >
                            <div>{entry.model_name}:{entry.column}</div>
                            {entry.changed_fields.length > 0 && (
                              <div className="text-[10px] text-amber-200">
                                {entry.changed_fields.join(', ')}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {columnEvolutionRemoved.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[11px] uppercase tracking-wide text-rose-300">Removed</div>
                        {columnEvolutionRemoved.map((entry: ColumnEvolutionEntry) => (
                          <div
                            key={entry.column_id}
                            className="rounded bg-rose-950/40 border border-rose-800/40 px-2 py-1 text-[11px] text-rose-200"
                          >
                            {entry.model_name}:{entry.column}
                          </div>
                        ))}
                      </div>
                    )}
                    {columnEvolutionAdded.length === 0 &&
                      columnEvolutionChanged.length === 0 &&
                      columnEvolutionRemoved.length === 0 && (
                        <div className="text-xs text-muted">No column changes detected.</div>
                      )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="panel-gradient rounded-lg p-3 space-y-2">
            <h3 className="text-sm font-semibold text-text">Impact</h3>
            {impact.upstream.length + impact.downstream.length === 0 ? (
              <div className="text-xs text-muted">No impact highlighted.</div>
            ) : (
              <div className="text-xs text-text space-y-2">
                <div>
                  <div className="font-semibold text-muted">Upstream</div>
                  <div className="flex flex-wrap gap-1">
                    {impact.upstream.map((item) => (
                      <span key={item} className="bg-surface-muted px-2 py-1 rounded text-[11px] break-all">{item}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-muted">Downstream</div>
                  <div className="flex flex-wrap gap-1">
                    {impact.downstream.map((item) => (
                      <span key={item} className="bg-surface-muted px-2 py-1 rounded text-[11px] break-all">{item}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
            </>
          ) : (
            <>
              <div className="panel-gradient rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text">Row Details</h3>
                  {rowTrace?.truncated && <span className="text-[11px] text-amber-300">Truncated</span>}
                </div>
                {rowTraceLoading && <div className="text-xs text-muted">Loading row lineage...</div>}
                {!rowTraceLoading && !rowTrace && (
                  <div className="text-xs text-muted">Load rows and select one to inspect details.</div>
                )}
                {!rowTraceLoading && rowTrace && (
                  <div className="space-y-2">
                    <div className="text-text text-sm font-medium">{selectedRowModelName || rowTrace.target.model_name}</div>
                    <div className="text-[11px] text-muted break-all">{selectedRowTraceId || rowTrace.target.trace_id}</div>
                    {selectedRowRelationName && <div className="text-[11px] text-muted">{selectedRowRelationName}</div>}
                    {rowTrace.truncated && (
                      <div className="text-[11px] text-amber-300">Traversal truncated at max hops.</div>
                    )}
                    <div className="space-y-1">
                      <div className="text-xs text-muted font-semibold">Row data</div>
                      {selectedRowEntries.length > 0 ? (
                        <div className="max-h-64 overflow-auto border border-border rounded">
                          <table className="w-full text-xs">
                            <tbody>
                              {selectedRowEntries.map(([key, value]) => {
                                const formatted = formatValueForDetails(value)
                                return (
                                  <tr key={key} className="border-b border-border last:border-b-0">
                                    <td className="px-2 py-1 text-muted align-top w-1/3 break-all">{key}</td>
                                    <td className="px-2 py-1 text-text align-top">
                                      {formatted.complex ? (
                                        <pre className="whitespace-pre-wrap break-words">{formatted.text}</pre>
                                      ) : (
                                        formatted.text
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-[11px] text-muted">No row data available.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="panel-gradient rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text">Hop History</h3>
                  {rowTrace && <span className="text-[11px] text-muted">{rowTrace.hops.length} hops</span>}
                </div>
                {!rowTrace && <div className="text-xs text-muted">Select a row to view upstream hops.</div>}
                {rowTrace && rowTrace.hops.length === 0 && (
                  <div className="text-xs text-muted">No upstream hops found for this row.</div>
                )}
                {rowTrace && rowTrace.hops.length > 0 && (
                  <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
                    {rowTrace.hops.map((hop, idx) => (
                      <div key={`${hop.source_model}-${hop.source_trace_id}-${idx}`} className="rounded border border-border panel-gradient-subtle p-3 space-y-1">
                        <div className="text-sm text-text font-medium">
                          {hop.source_model}
                          {' -> '}
                          {hop.target_model}
                        </div>
                        {hop.executed_at && <div className="text-[11px] text-muted">{hop.executed_at}</div>}
                        <details className="text-xs text-text">
                          <summary className="cursor-pointer text-muted">Compiled SQL</summary>
                          <pre className="mt-1 rounded border border-border panel-gradient-subtle p-2 whitespace-pre-wrap break-words">
                            {hop.compiled_sql || 'No compiled SQL available.'}
                          </pre>
                        </details>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default LineagePage
