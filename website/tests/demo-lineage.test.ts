import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {demoEdges, demoNodes, downstreamModels} from '../src/data/demoLineage';

const manifestUrl = new URL('../../sample_artifacts/manifest.json', import.meta.url);

test('interactive demo matches the bundled sample manifest and traces downstream impact', async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf-8')) as {
    nodes: Record<string, {resource_type: string; depends_on?: {nodes: string[]}}>;
  };
  const modelPrefix = 'model.test_project.';
  const models = Object.entries(manifest.nodes).filter(
    ([id, node]) => id.startsWith(modelPrefix) && node.resource_type === 'model',
  );

  assert.deepEqual(
    demoNodes.map(({id}) => `${modelPrefix}${id}`).sort(),
    models.map(([id]) => id).sort(),
  );

  const manifestEdges = models.flatMap(([id, node]) =>
    (node.depends_on?.nodes ?? [])
      .filter((parent) => parent.startsWith(modelPrefix))
      .map((parent) => `${parent} -> ${id}`),
  );
  const demoEdgeIds = demoEdges.map(
    ({source, target}) => `${modelPrefix}${source} -> ${modelPrefix}${target}`,
  );
  assert.deepEqual(demoEdgeIds.sort(), manifestEdges.sort());
  assert.deepEqual([...downstreamModels('stg_orders')].sort(), ['customers', 'orders']);
});
