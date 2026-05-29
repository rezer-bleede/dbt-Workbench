import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocusaurusConfig } from '../config/createDocusaurusConfig';

test('docusaurus config derives url and baseUrl from repository', () => {
  const config = createDocusaurusConfig(
    { GITHUB_REPOSITORY: 'example-org/example-repo' },
    { inferRepository: () => null },
  );

  assert.equal(config.url, 'https://example-org.github.io');
  assert.equal(config.baseUrl, '/example-repo/');
  assert.equal(config.organizationName, 'example-org');
  assert.equal(config.projectName, 'example-repo');
});

test('docusaurus config uses repository for GitHub navbar link', () => {
  const config = createDocusaurusConfig(
    { GITHUB_REPOSITORY: 'octo-org/octo-repo' },
    { inferRepository: () => null },
  );

  const githubItem = config.themeConfig?.navbar?.items?.find(
    (item) => typeof item === 'object' && 'href' in item && item.href?.includes('github.com'),
  );

  assert.equal(
    githubItem?.href,
    'https://github.com/octo-org/octo-repo?utm_source=docs&utm_medium=organic&utm_campaign=repo_cta',
  );
});

test('docusaurus config falls back to default repo', () => {
  const config = createDocusaurusConfig({}, { inferRepository: () => null });

  assert.equal(config.baseUrl, '/dbt-Workbench/');
});

test('docusaurus sitemap config excludes local search routes', () => {
  const config = createDocusaurusConfig(
    { GITHUB_REPOSITORY: 'example-org/example-repo' },
    { inferRepository: () => null },
  );
  const classicPreset = config.presets?.[0];
  const classicOptions =
    Array.isArray(classicPreset) && classicPreset.length > 1 ? classicPreset[1] : null;
  const ignorePatterns = classicOptions?.sitemap?.ignorePatterns ?? [];

  assert.deepEqual(ignorePatterns, ['/tags/**', '/search', '/search/', '/search/**']);
});

test('docusaurus config emits verification metadata when env vars are provided', () => {
  const config = createDocusaurusConfig(
    {
      GITHUB_REPOSITORY: 'example-org/example-repo',
      GOOGLE_SITE_VERIFICATION: 'google-token',
      BING_SITE_VERIFICATION: 'bing-token',
    },
    { inferRepository: () => null },
  );
  const metadata = config.themeConfig?.metadata ?? [];

  assert.equal(
    metadata.some(
      (item) =>
        typeof item === 'object' &&
        'name' in item &&
        item.name === 'google-site-verification' &&
        'content' in item &&
        item.content === 'google-token',
    ),
    true,
  );
  assert.equal(
    metadata.some(
      (item) =>
        typeof item === 'object' &&
        'name' in item &&
        item.name === 'msvalidate.01' &&
        'content' in item &&
        item.content === 'bing-token',
    ),
    true,
  );

});
