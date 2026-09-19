import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './index.module.css';
import {FaqJsonLd, HomeJsonLd} from '@site/src/components/seo/JsonLd';
import GitHubCta from '@site/src/components/seo/GitHubCta';

const features = [
  {
    title: 'Lineage and column lineage clarity',
    description:
      'Navigate model-level and column-level lineage graphs with deterministic layouts, impact highlighting, and grouping controls.',
    link: '/docs/lineage-overview/',
    linkLabel: 'Explore dbt lineage visualization',
  },
  {
    title: 'Run orchestration with streaming logs',
    description:
      'Launch dbt commands, follow live logs, and review artifacts with a full run history timeline.',
    link: '/docs/run-orchestration/',
    linkLabel: 'See dbt run orchestration',
  },
  {
    title: 'Catalog and docs previews',
    description:
      'Browse a searchable data catalog, validate freshness and tests, and serve dbt docs assets from artifacts.',
    link: '/docs/catalog/',
    linkLabel: 'Open the dbt catalog viewer',
  },
];

const homeFaqItems = [
  {
    question: 'What is dbt-Workbench?',
    answer:
      'dbt-Workbench is an open source dbt UI for lineage visualization, run orchestration, catalog browsing, docs previews, and SQL workspace workflows.',
  },
  {
    question: 'Is dbt-Workbench self-hosted?',
    answer:
      'Yes. dbt-Workbench is designed for local, on-prem, and air-gapped deployments with no vendor lock-in.',
  },
  {
    question: 'Can I schedule dbt runs with cron?',
    answer:
      'Yes. dbt-Workbench includes a scheduler with timezone-aware cron support and run history diagnostics.',
  },
  {
    question: 'Does dbt-Workbench support lineage and column lineage?',
    answer:
      'Yes. You can explore deterministic model-level lineage and optional column-level lineage from dbt artifacts.',
  },
];

export default function Home(): JSX.Element {
  const lineageScreenshotUrl = useBaseUrl('/img/screenshots/lineage-ui.png');

  return (
    <Layout
      title="dbt-Workbench: Open Source dbt UI for Lineage, Runs, and Docs"
      description="Open source dbt-Workbench is a dbt UI for local, on-prem, and air-gapped deployments with no vendor lock-in. Run lineage, orchestration, and documentation workflows anywhere."
    >
      <HomeJsonLd />
      <FaqJsonLd items={homeFaqItems} />
      <header className={clsx('hero', styles.heroBanner)}>
        <div className="container">
          <Heading as="h1" className={styles.heroTitle}>
            dbt-Workbench is the open source dbt UI for model governance
          </Heading>
          <p className={styles.heroSubtitle}>
            Deliver lineage visualization with deterministic graphs, secure run orchestration, and
            self-hosted documentation previews built for local, on-prem, and air-gapped teams.
          </p>
          <div className={styles.heroActions}>
            <Link className="button button--primary button--lg" to="/docs/quickstart-docker/">
              Start with Docker Compose
            </Link>
            <Link className="button button--secondary button--lg" to="/docs/dbt-ui/">
              Read the dbt UI guide
            </Link>
          </div>
          <div className={styles.heroLinks}>
            <Link to="/docs/lineage-overview/">dbt lineage visualization</Link>
            <Link to="/docs/scheduler/">dbt scheduler</Link>
            <Link to="/docs/sql-workspace/">dbt SQL workspace</Link>
            <Link to="/docs/auth-rbac/">dbt RBAC auth</Link>
          </div>
          <GitHubCta
            position="top"
            campaign="homepage_hero_cta"
            label="Star and contribute on GitHub"
          />
        </div>
      </header>

      <main>
        <section className="container margin-vert--lg">
          <Heading as="h2">Why teams choose dbt-Workbench</Heading>
          <p>
            “A lightweight, open-source UI for dbt… model browsing, lineage visualization, run
            orchestration, documentation previews, and environment management — without vendor
            lock-in. Designed for local, on-prem, and air-gapped deployments.”
          </p>
          <div className={styles.featureGrid}>
            {features.map((feature) => (
              <div key={feature.title} className={styles.featureCard}>
                <Heading as="h3">{feature.title}</Heading>
                <p>{feature.description}</p>
                <Link to={feature.link}>{feature.linkLabel}</Link>
              </div>
            ))}
          </div>

        </section>

        <section className={clsx('container', styles.screenshotSection)}>
          <div>
            <Heading as="h2">See the product in action</Heading>
            <p>
              Review lineage, run history, and catalog metadata in one place. Explore more visuals
              on the screenshots page.
            </p>
            <Link to="/docs/screenshots/">View dbt-Workbench screenshots</Link>
          </div>
          <img
            className={styles.screenshot}
            src={lineageScreenshotUrl}
            alt="dbt-Workbench lineage visualization showing model dependencies"
            loading="lazy"
          />
        </section>

        <section className="container margin-vert--xl">
          <Heading as="h2">Documentation index</Heading>
          <div className={styles.linkGrid}>
            <div>
              <Heading as="h3">Core product</Heading>
              <ul>
                <li>
                  <Link to="/docs/dbt-ui/">dbt UI overview and workflows</Link>
                </li>
                <li>
                  <Link to="/docs/lineage-overview/">dbt lineage visualization</Link>
                </li>
                <li>
                  <Link to="/docs/run-orchestration/">dbt run orchestration</Link>
                </li>
                <li>
                  <Link to="/docs/sql-workspace/">dbt SQL workspace</Link>
                </li>
              </ul>
            </div>
            <div>
              <Heading as="h3">Operations</Heading>
              <ul>
                <li>
                  <Link to="/docs/scheduler/">dbt scheduler and cron runs</Link>
                </li>
                <li>
                  <Link to="/docs/air-gapped-on-prem/">air-gapped dbt UI operations</Link>
                </li>
                <li>
                  <Link to="/docs/auth-rbac/">dbt RBAC and authentication</Link>
                </li>
              </ul>
            </div>
            <div>
              <Heading as="h3">Data discovery</Heading>
              <ul>
                <li>
                  <Link to="/docs/catalog/">dbt catalog viewer</Link>
                </li>
                <li>
                  <Link to="/docs/docs-viewer/">dbt docs viewer</Link>
                </li>
                <li>
                  <Link to="/docs/artifacts/">dbt artifacts viewer</Link>
                </li>
                <li>
                  <Link to="/docs/comparisons/dbt-cloud-vs-dbt-workbench/">dbt platform comparisons</Link>
                </li>
                <li>
                  <Link to="/docs/use-cases/self-hosted-dbt-for-regulated-teams/">dbt use-case playbooks</Link>
                </li>
                <li>
                  <Link to="/docs/tutorials/setup-dbt-ui-in-under-30-minutes/">dbt implementation tutorials</Link>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className={clsx('container margin-vert--xl', styles.faqSection)}>
          <Heading as="h2">Frequently asked questions</Heading>
          <div className={styles.faqGrid}>
            {homeFaqItems.map((item) => (
              <article key={item.question} className={styles.faqCard}>
                <Heading as="h3">{item.question}</Heading>
                <p>{item.answer}</p>
              </article>
            ))}
          </div>
          <GitHubCta
            position="bottom"
            campaign="homepage_footer_cta"
            label="Explore source code and issues on GitHub"
          />
        </section>
      </main>
    </Layout>
  );
}
