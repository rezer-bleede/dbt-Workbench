import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildHomeJsonLdGraph,
  buildHowToJsonLd,
} from '../src/components/seo/jsonLdBuilders';

test('buildFaqJsonLd maps questions into FAQPage schema', () => {
  const data = buildFaqJsonLd([
    {question: 'What is dbt-Workbench?', answer: 'An open source dbt UI.'},
  ]);

  assert.equal(data['@type'], 'FAQPage');
  assert.equal((data.mainEntity as Array<{name: string}>)[0].name, 'What is dbt-Workbench?');
});

test('buildBreadcrumbJsonLd resolves URLs correctly', () => {
  const data = buildBreadcrumbJsonLd(
    [{name: 'Docs', url: '/docs/'}, {name: 'Page'}],
    'https://example.com/docs/page',
    'https://example.com',
  );

  assert.equal(data.itemListElement[0].item, 'https://example.com/docs/');
  assert.equal(data.itemListElement[1].item, 'https://example.com/docs/page');
});

test('buildBreadcrumbJsonLd keeps baseUrl path for root-relative links', () => {
  const data = buildBreadcrumbJsonLd(
    [{name: 'Docs', url: '/docs/'}, {name: 'Page'}],
    'https://example.com/repo/docs/page/',
    'https://example.com/repo/',
  );

  assert.equal(data.itemListElement[0].item, 'https://example.com/repo/docs/');
  assert.equal(data.itemListElement[1].item, 'https://example.com/repo/docs/page/');
});

test('buildHowToJsonLd creates ordered steps', () => {
  const data = buildHowToJsonLd({
    name: 'Test HowTo',
    description: 'Testing steps',
    steps: [
      {name: 'Step 1', text: 'Do first'},
      {name: 'Step 2', text: 'Do second'},
    ],
  });

  assert.equal(data['@type'], 'HowTo');
  assert.equal(data.step[1].position, 2);
});

test('buildHomeJsonLdGraph emits baseUrl-aware schema URLs', () => {
  const data = buildHomeJsonLdGraph(
    'https://example.com/repo/',
    'https://github.com/example-org/example-repo',
    'https://github.com/example-org',
  );
  const graph = data['@graph'] as Array<Record<string, unknown>>;

  const organization = graph.find((item) => item['@type'] === 'Organization');
  assert.equal(organization?.url, 'https://example.com/repo/');
  assert.equal(organization?.logo, 'https://example.com/repo/img/brand.svg');
  assert.equal(
    organization?.image,
    'https://example.com/repo/img/og-image-1200x630.png',
  );

  const webSite = graph.find((item) => item['@type'] === 'WebSite');
  assert.equal(webSite?.url, 'https://example.com/repo/');
  assert.equal(
    (webSite?.potentialAction as {target: string}).target,
    'https://example.com/repo/search/?q={search_term_string}',
  );

  const sourceCode = graph.find((item) => item['@type'] === 'SoftwareSourceCode');
  assert.equal(
    sourceCode?.license,
    'https://github.com/example-org/example-repo/blob/main/LICENSE',
  );
});
