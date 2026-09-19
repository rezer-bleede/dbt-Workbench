import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import LineagePage from './Lineage'
import { api } from '../api/client'

vi.mock('../api/client', () => {
  return {
    api: {
      get: vi.fn(),
      post: vi.fn(),
    },
  }
})

vi.mock('../context/AiContext', () => ({
  useAi: () => ({
    openPanel: vi.fn(),
    settings: {
      enabled: true,
      ai_system_enabled: true,
    },
  }),
  AiProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const mockedGet = api.get as unknown as ReturnType<typeof vi.fn>
const mockedPost = api.post as unknown as ReturnType<typeof vi.fn>

const sampleGraph = {
  nodes: [
    { id: 'model.one', label: 'one', type: 'model', schema: 'analytics' },
    { id: 'model.two', label: 'two', type: 'model', schema: 'analytics' },
  ],
  edges: [{ source: 'model.one', target: 'model.two' }],
  groups: [
    { id: 'schema:db.analytics', label: 'db.analytics', type: 'schema', members: ['model.one', 'model.two'] },
  ],
}

const sampleColumnGraph = {
  nodes: [{ id: 'model.two.id', column: 'id', model_id: 'model.two', label: 'two:id', type: 'model' }],
  edges: [],
}

const sampleImpact = { upstream: ['model.one'], downstream: ['model.two'] }

const sampleModelDetail = {
  model_id: 'model.two',
  parents: ['model.one'],
  children: [],
  columns: { id: { description: 'identifier' } },
  tags: ['core'],
  schema: 'analytics',
  database: 'db',
}

const sampleRowStatus = {
  enabled: true,
  available: true,
  mapping_path: '/tmp/lineage/lineage.jsonl',
  mapping_mtime: null,
  mapping_count: 2,
  roots: ['mart_model'],
  models: ['example_source', 'staging_model', 'mart_model'],
  warnings: [],
}

const sampleRowModels = {
  roots: [
    {
      model_name: 'mart_model',
      model_unique_id: 'model.rowlineage_demo.mart_model',
      schema: 'marts',
      database: 'db',
      relation_name: 'db.marts.mart_model',
      is_root: true,
      mappings_as_target: 1,
    },
  ],
  models: [
    {
      model_name: 'mart_model',
      model_unique_id: 'model.rowlineage_demo.mart_model',
      schema: 'marts',
      database: 'db',
      relation_name: 'db.marts.mart_model',
      is_root: true,
      mappings_as_target: 1,
    },
    {
      model_name: 'staging_model',
      model_unique_id: 'model.rowlineage_demo.staging_model',
      schema: 'staging',
      database: 'db',
      relation_name: 'db.staging.staging_model',
      is_root: false,
      mappings_as_target: 1,
    },
  ],
  warnings: [],
}

const sampleEnvironments = [
  {
    id: 1,
    name: 'dev',
    description: 'Development',
    dbt_target_name: 'dev',
    connection_profile_reference: null,
    variables: {},
    default_retention_policy: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
]

const sampleRowPreview = {
  model_unique_id: 'model.rowlineage_demo.mart_model',
  model_name: 'mart_model',
  relation_name: 'db.marts.mart_model',
  schema: 'marts',
  database: 'db',
  trace_column: '_row_trace_id',
  trace_column_present: true,
  columns: ['id', 'customer_name_upper', '_row_trace_id'],
  rows: [
    { id: 1, customer_name_upper: 'ALICE', _row_trace_id: 'mart-1' },
  ],
  warnings: [],
}

const sampleRowTrace = {
  target: {
    model_unique_id: 'model.rowlineage_demo.mart_model',
    model_name: 'mart_model',
    trace_id: 'mart-1',
    relation_name: 'db.marts.mart_model',
    row: { id: 1, customer_name_upper: 'ALICE', _row_trace_id: 'mart-1' },
  },
  graph: {
    nodes: [
      {
        id: 'row:mart_model:mart-1',
        label: 'mart_model\nmart-1',
        type: 'row',
        model_name: 'mart_model',
        trace_id: 'mart-1',
        row: { id: 1, customer_name_upper: 'ALICE', _row_trace_id: 'mart-1' },
      },
      {
        id: 'row:staging_model:stg-1',
        label: 'staging_model\nstg-1',
        type: 'row',
        model_name: 'staging_model',
        trace_id: 'stg-1',
        row: { id: 1, customer_name_upper: 'ALICE', _row_trace_id: 'stg-1' },
      },
    ],
    edges: [
      { source: 'row:staging_model:stg-1', target: 'row:mart_model:mart-1' },
    ],
  },
  hops: [
    {
      source_model: 'staging_model',
      target_model: 'mart_model',
      source_trace_id: 'stg-1',
      target_trace_id: 'mart-1',
      compiled_sql: 'select * from staging_model',
      executed_at: '2024-01-01T00:00:00Z',
      source_row: { id: 1, customer_name_upper: 'ALICE', _row_trace_id: 'stg-1' },
      target_row: { id: 1, customer_name_upper: 'ALICE', _row_trace_id: 'mart-1' },
    },
  ],
  truncated: false,
  warnings: [],
}

const sampleColumnEvolution = {
  available: true,
  current_version: { version: 2, timestamp: '2024-01-02T00:00:00Z' },
  baseline_version: { version: 1, timestamp: '2024-01-01T00:00:00Z' },
  summary: { added: 1, removed: 0, changed: 0, unchanged: 0 },
  status_by_id: { 'model.two.id': 'added' },
  added: [
    {
      column_id: 'model.two.id',
      model_id: 'model.two',
      model_name: 'two',
      column: 'id',
      meta: { name: 'id', description: 'identifier', data_type: 'int', tags: [] },
    },
  ],
  removed: [],
  changed: [],
}

const installGetMock = (overrides?: { graph?: any; columnGraph?: any; modelDetail?: any }) => {
  mockedGet.mockImplementation((url: string) => {
    if (url.startsWith('/config')) return Promise.resolve({ data: { lineage: {}, row_lineage: { enabled: true } } })
    if (url.startsWith('/lineage/graph')) return Promise.resolve({ data: overrides?.graph ?? sampleGraph })
    if (url.startsWith('/lineage/columns/evolution')) return Promise.resolve({ data: sampleColumnEvolution })
    if (url.startsWith('/lineage/columns')) return Promise.resolve({ data: overrides?.columnGraph ?? sampleColumnGraph })
    if (url.startsWith('/lineage/upstream/model.two')) return Promise.resolve({ data: sampleImpact })
    if (url.startsWith('/lineage/upstream/model.project.sales.orders')) return Promise.resolve({ data: sampleImpact })
    if (url.startsWith('/lineage/model/model.two')) return Promise.resolve({ data: overrides?.modelDetail ?? sampleModelDetail })
    if (url.startsWith('/row-lineage/status')) return Promise.resolve({ data: sampleRowStatus })
    if (url.startsWith('/row-lineage/models')) return Promise.resolve({ data: sampleRowModels })
    if (url.startsWith('/schedules/environments')) return Promise.resolve({ data: sampleEnvironments })
    if (url.startsWith('/row-lineage/trace/')) return Promise.resolve({ data: sampleRowTrace })
    return Promise.resolve({ data: {} })
  })
}

describe('LineagePage', () => {
  beforeEach(() => {
    mockedGet.mockReset()
    mockedPost.mockReset()
    installGetMock()
    mockedPost.mockImplementation((url: string) => {
      if (url.startsWith('/row-lineage/preview')) return Promise.resolve({ data: sampleRowPreview })
      return Promise.resolve({ data: {} })
    })
  })

  it('renders lineage graph nodes and grouping controls', async () => {
    render(
      <MemoryRouter>
        <LineagePage />
      </MemoryRouter>
    )

    await waitFor(() => expect(document.querySelector('[data-node-id="model.one"]')).not.toBeNull())

    expect(document.querySelector('[data-node-id="model.one"]')).not.toBeNull()
    expect(screen.getByText('Grouping')).toBeInTheDocument()
    expect(screen.getByText(/Grouping is disabled\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Collapse' })).not.toBeInTheDocument()
  })

  it('positions nodes with a deterministic layout', async () => {
    render(
      <MemoryRouter>
        <LineagePage />
      </MemoryRouter>
    )

    const twoNode = await screen.findByTestId('lineage-node-model.two')
    fireEvent.click(twoNode)

    const graphNodes = document.querySelectorAll('[data-node-id]')
    expect(graphNodes.length).toBeGreaterThanOrEqual(2)

    graphNodes.forEach((node) => expect(node).toHaveAttribute('data-node-id'))

    expect(document.querySelector('.react-flow')).not.toBeNull()
  })

  it('allows selecting a model and viewing column-level details', async () => {
    render(
      <MemoryRouter>
        <LineagePage />
      </MemoryRouter>
    )
    await waitFor(() => expect(document.querySelector('[data-node-id="model.two"]')).not.toBeNull())

    fireEvent.click(screen.getByTestId('lineage-node-model.two'))

    const labels = await screen.findAllByText('model.two')
    expect(labels.length).toBeGreaterThan(0)
    expect(screen.getByText('Parents: 1 | Children: 0')).toBeInTheDocument()

    const columnButton = await screen.findByText('id')
    fireEvent.click(columnButton)
    await waitFor(() => expect(mockedGet).toHaveBeenCalledWith(expect.stringContaining('/lineage/upstream/model.two')))
  })

  it('supports column evolution lens', async () => {
    render(
      <MemoryRouter>
        <LineagePage />
      </MemoryRouter>
    )

    await waitFor(() => expect(mockedGet).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Column' }))

    const lensSelect = await screen.findByDisplayValue('Column lineage')
    fireEvent.change(lensSelect, { target: { value: 'evolution' } })

    await waitFor(() =>
      expect(mockedGet).toHaveBeenCalledWith('/lineage/columns/evolution'),
    )

    expect(await screen.findByText('Column Evolution')).toBeInTheDocument()
    expect(screen.getByText('Added 1')).toBeInTheDocument()
    expect(screen.getByText('two:id')).toBeInTheDocument()
  })

  it('wraps long model ids in the Selection panel', async () => {
    const longModelId = 'model.dbt_production_blueprint.this_is_a_very_long_model_identifier_that_should_wrap_without_overflow'
    installGetMock({
      modelDetail: {
        ...sampleModelDetail,
        model_id: longModelId,
      },
    })

    render(
      <MemoryRouter>
        <LineagePage />
      </MemoryRouter>
    )

    const modelNode = await screen.findByTestId('lineage-node-model.two')
    fireEvent.click(modelNode)

    const modelIdLabel = await screen.findByText(longModelId)
    expect(modelIdLabel).toHaveClass('break-all')
    expect(modelIdLabel).toHaveAttribute('title', longModelId)
  })

  it('clamps long lineage node labels while preserving full title text', async () => {
    const longLabel = 'orders_customer_dim_with_an_extremely_long_name_for_visual_overflow_checks'
    const longLabelGraph = {
      ...sampleGraph,
      nodes: [
        {
          id: 'model.one',
          label: longLabel,
          type: 'model',
          schema: 'dbt_workbench.public_dbt_test__audit_with_a_very_long_schema_name',
        },
        sampleGraph.nodes[1],
      ],
    }
    installGetMock({ graph: longLabelGraph })

    render(
      <MemoryRouter>
        <LineagePage />
      </MemoryRouter>
    )

    const node = await screen.findByTestId('lineage-node-model.one')
    expect(node).toHaveAttribute('title', longLabel)
    expect(node.querySelector('.line-clamp-2')).toHaveTextContent(longLabel)
  })

  it('uses full model id for multi-dot column identifiers', async () => {
    installGetMock({
      columnGraph: {
        nodes: [
          {
            id: 'model.pkg.parent.customer_id',
            column: 'customer_id',
            model_id: 'model.pkg.parent',
            label: 'parent:customer_id',
            type: 'model',
          },
          {
            id: 'model.project.sales.orders.customer_id',
            column: 'customer_id',
            model_id: 'model.project.sales.orders',
            label: 'orders:customer_id',
            type: 'model',
          },
        ],
        edges: [
          {
            source: 'model.pkg.parent.customer_id',
            target: 'model.project.sales.orders.customer_id',
            source_column: 'customer_id',
            target_column: 'customer_id',
          },
        ],
      },
    })

    render(
      <MemoryRouter>
        <LineagePage />
      </MemoryRouter>
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Column' }))
    fireEvent.click(await screen.findByTestId('lineage-node-model.project.sales.orders.customer_id'))

    await waitFor(() => {
      expect(
        mockedGet.mock.calls.some(
          ([url]) =>
            typeof url === 'string' &&
            url.includes('/lineage/upstream/model.project.sales.orders?column=customer_id'),
        ),
      ).toBe(true)
    })
  })

  it('supports row lineage mode with row preview and hop history', async () => {
    render(
      <MemoryRouter>
        <LineagePage />
      </MemoryRouter>
    )

    await waitFor(() => expect(mockedGet).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Row' }))

    const modelSelect = await screen.findByTestId('row-lineage-model-select')
    fireEvent.change(modelSelect, { target: { value: 'model.rowlineage_demo.mart_model' } })

    const loadRowsButton = screen.getByTestId('row-lineage-load-rows')
    fireEvent.click(loadRowsButton)

    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith(
        '/row-lineage/preview',
        expect.objectContaining({ model_unique_id: 'model.rowlineage_demo.mart_model' }),
      ),
    )

    const traceCell = await screen.findByText('mart-1')
    fireEvent.click(traceCell)

    await waitFor(() =>
      expect(mockedGet).toHaveBeenCalledWith(
        expect.stringContaining('/row-lineage/trace/model.rowlineage_demo.mart_model/mart-1'),
        expect.objectContaining({
          params: expect.objectContaining({ environment_id: 1 }),
        }),
      ),
    )

    expect(await screen.findByText('Row Details')).toBeInTheDocument()
    expect(await screen.findByText('Hop History')).toBeInTheDocument()
    expect(screen.getByText('staging_model -> mart_model')).toBeInTheDocument()
  })
})
