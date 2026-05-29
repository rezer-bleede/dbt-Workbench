import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

type RuntimeEnv = Record<string, string | undefined>;

type CreateConfigOptions = {
  inferRepository?: () => string | null;
};

function inferRepositoryFromGitRemote() {
  try {
    const remoteUrl = execSync('git config --get remote.origin.url', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
      .replace(/\.git$/, '');
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+)$/);
    if (!match) {
      return null;
    }

    return `${match[1]}/${match[2]}`;
  } catch {
    return null;
  }
}

function resolveRepository(env: RuntimeEnv, inferRepository: () => string | null) {
  const fallback = 'rezer-bleede/dbt-Workbench';
  const candidate =
    env.GITHUB_REPOSITORY?.trim() || inferRepository()?.trim() || fallback;
  const segments = candidate.split('/').filter(Boolean);

  if (segments.length < 2) {
    return fallback;
  }

  return `${segments[0]}/${segments.slice(1).join('/')}`;
}

function createRobotsTxtPlugin() {
  return {
    name: 'dynamic-robots-txt',
    async postBuild({outDir, siteConfig}) {
      const siteBaseUrl = new URL(siteConfig.baseUrl, siteConfig.url).toString();
      const robots = [
        'User-agent: *',
        'Allow: /',
        'Disallow: /search',
        'Disallow: /search?',
        '',
        `Sitemap: ${new URL('sitemap.xml', siteBaseUrl).toString()}`,
        '',
      ].join('\n');

      await fs.writeFile(path.join(outDir, 'robots.txt'), robots, 'utf8');
    },
  };
}

export function createDocusaurusConfig(
  env: RuntimeEnv = process.env,
  options: CreateConfigOptions = {},
): Config {
  const inferRepository = options.inferRepository ?? inferRepositoryFromGitRemote;
  const repository = resolveRepository(env, inferRepository);
  const [organizationName, projectName] = repository.split('/');
  const siteUrl = `https://${organizationName}.github.io`;
  const isUserOrOrgSite = projectName === `${organizationName}.github.io`;
  const baseUrl = isUserOrOrgSite ? '/' : `/${projectName}/`;
  const ga4Id = env.GA4_ID;
  const googleSiteVerification = env.GOOGLE_SITE_VERIFICATION;
  const bingSiteVerification = env.BING_SITE_VERIFICATION;
  const repositoryUrl = `https://github.com/${organizationName}/${projectName}`;
  const repositoryCtaUrl = `${repositoryUrl}?utm_source=docs&utm_medium=organic&utm_campaign=repo_cta`;

  return {
    title: 'dbt-Workbench',
    tagline:
      'Open source dbt UI for lineage visualization, run orchestration, catalogs, and SQL workspace.',
    favicon: 'img/brand.svg',
    url: siteUrl,
    baseUrl,
    trailingSlash: true,
    organizationName,
    projectName,
    onBrokenLinks: 'throw',
    markdown: {
      hooks: {
        onBrokenMarkdownLinks: 'throw',
      },
    },
    future: {
      v4: true,
    },
    i18n: {
      defaultLocale: 'en',
      locales: ['en'],
    },
    presets: [
      [
        'classic',
        {
          docs: {
            sidebarPath: './sidebars.ts',
            editUrl: `https://github.com/${organizationName}/${projectName}/edit/main/website/`,
            showLastUpdateAuthor: true,
            showLastUpdateTime: true,
          },
          blog: false,
          theme: {
            customCss: './src/css/custom.css',
          },
          sitemap: {
            changefreq: 'weekly',
            priority: 0.5,
            ignorePatterns: ['/tags/**', '/search', '/search/', '/search/**'],
          },
        } satisfies Preset.Options,
      ],
    ],
    plugins: [
      createRobotsTxtPlugin,
      [
        '@easyops-cn/docusaurus-search-local',
        {
          hashed: true,
          language: ['en'],
          docsRouteBasePath: '/docs',
          indexDocs: true,
          indexPages: true,
        },
      ],
      ga4Id
        ? [
            '@docusaurus/plugin-google-gtag',
            {
              trackingID: ga4Id,
              anonymizeIP: true,
            },
          ]
        : null,
    ].filter(Boolean),
    themeConfig: {
      image: 'img/og-image-1200x630.png',
      metadata: [
        {
          name: 'description',
          content:
            'Open source dbt UI for lineage visualization, run orchestration, catalog, docs, and SQL workspace in local, on-prem, and air-gapped deployments.',
        },
        { name: 'og:type', content: 'website' },
        { name: 'og:site_name', content: 'dbt-Workbench' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:site', content: '@dbtworkbench' },
        { name: 'twitter:creator', content: '@dbtworkbench' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
        { name: 'theme-color', content: '#0ea5e9' },
        {
          name: 'keywords',
          content:
            'dbt, dbt ui, dbt lineage, data lineage, dbt catalog, data catalog, sql workspace, dbt scheduler, open source dbt, dbt documentation, dbt visualization',
        },
        ...(googleSiteVerification
          ? [{ name: 'google-site-verification', content: googleSiteVerification }]
          : []),
        ...(bingSiteVerification
          ? [{ name: 'msvalidate.01', content: bingSiteVerification }]
          : []),
      ],
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'dbt-Workbench',
        logo: {
          alt: 'dbt-Workbench logo',
          src: 'img/brand.svg',
        },
        items: [
          { to: '/docs/quickstart-docker/', label: 'Quickstart', position: 'left' },
          {
            to: '/docs/lineage-overview/',
            label: 'Lineage',
            position: 'left',
          },
          { to: '/docs/scheduler/', label: 'Scheduler', position: 'left' },
          { to: '/docs/sql-workspace/', label: 'SQL Workspace', position: 'left' },
          { to: '/docs/auth-rbac/', label: 'Auth & RBAC', position: 'left' },
          { type: 'search', position: 'right' },
          {
            href: repositoryCtaUrl,
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              { label: 'dbt UI Pillar', to: '/docs/dbt-ui/' },
              { label: 'Run Orchestration', to: '/docs/run-orchestration/' },
              { label: 'Air-gapped & On-Prem', to: '/docs/air-gapped-on-prem/' },
            ],
          },
          {
            title: 'Guides',
            items: [
              {
                label: 'View dbt lineage locally',
                to: '/docs/guides/view-dbt-lineage-locally/',
              },
              {
                label: 'Schedule dbt runs with cron',
                to: '/docs/guides/schedule-dbt-runs-with-cron/',
              },
              { label: 'Enable JWT auth', to: '/docs/guides/enable-jwt-auth/' },
            ],
          },
          {
            title: 'More',
            items: [
              { label: 'Analytics Setup', to: '/docs/analytics-setup/' },
              {
                label: 'GitHub',
                href: repositoryCtaUrl,
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} dbt-Workbench. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    } satisfies Preset.ThemeConfig,
  };
}
