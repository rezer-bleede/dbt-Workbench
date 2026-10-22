import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {FaqJsonLd, HomeJsonLd} from '@site/src/components/seo/JsonLd';
import GitHubCta from '@site/src/components/seo/GitHubCta';
import styles from './index.module.css';

const kpis = [
  { title: 'Total Models', value: 128, subtitle: '96 models · 18 seeds · 14 snapshots', tag: 'Healthy', color: 'success' as const, footer: 'Manifest' },
  { title: 'Lineage Links', value: '1.4k', subtitle: 'Model + column-level edges', tag: 'Indexed', color: 'neutral' as const, footer: 'Lineage' },
  { title: 'Runs (30d)', value: 42, subtitle: '95% success rate', tag: 'Watch', color: 'warning' as const, footer: 'Run history' },
  { title: 'Latest Run', value: 'Passed', subtitle: 'dbt build · 04/12 14:22', tag: 'dbt build', color: 'success' as const, footer: 'Run history' },
];

const runBars = [
  { day: '4/8', s: 4, f: 1, o: 0 },
  { day: '4/9', s: 6, f: 0, o: 1 },
  { day: '4/10', s: 3, f: 2, o: 0 },
  { day: '4/11', s: 7, f: 1, o: 1 },
  { day: '4/12', s: 5, f: 0, o: 0 },
];

const recentRuns = [
  { id: 'a1b2c3d4', cmd: 'dbt build', status: 'succeeded', time: '14:22:03' },
  { id: 'e5f6g7h8', cmd: 'dbt test', status: 'succeeded', time: '13:10:12' },
  { id: 'i9j0k1l2', cmd: 'dbt run', status: 'failed', time: '11:48:55' },
  { id: 'm3n4o5p6', cmd: 'dbt docs generate', status: 'succeeded', time: '09:32:18' },
];

const resourceMix = [
  { label: 'Model', value: 96, color: 'var(--chart-1)' },
  { label: 'Seed', value: 18, color: 'var(--chart-2)' },
  { label: 'Snapshot', value: 14, color: 'var(--chart-3)' },
  { label: 'Source', value: 32, color: 'var(--chart-4)' },
];

const artifacts = [
  { label: 'Manifest', present: true },
  { label: 'Catalog', present: true },
  { label: 'Run Results', present: true },
  { label: 'Docs', present: false },
];

const features = [
  {
    title: 'Lineage and column lineage clarity',
    description: 'Navigate model-level and column-level lineage graphs with deterministic layouts, impact highlighting, and grouping controls.',
    link: '/docs/lineage-overview/',
    linkLabel: 'Explore dbt lineage visualization',
  },
  {
    title: 'Run orchestration with streaming logs',
    description: 'Launch dbt commands, follow live logs, and review artifacts with a full run history timeline.',
    link: '/docs/run-orchestration/',
    linkLabel: 'See dbt run orchestration',
  },
  {
    title: 'Catalog and docs previews',
    description: 'Browse a searchable data catalog, validate freshness and tests, and serve dbt docs assets from artifacts.',
    link: '/docs/catalog/',
    linkLabel: 'Open the dbt catalog viewer',
  },
];

const homeFaqItems = [
  { question: 'What is dbt-Workbench?', answer: 'dbt-Workbench is an open source dbt UI for lineage visualization, run orchestration, catalog browsing, docs previews, and SQL workspace workflows.' },
  { question: 'Is dbt-Workbench self-hosted?', answer: 'Yes. dbt-Workbench is designed for local, on-prem, and air-gapped deployments with no vendor lock-in.' },
  { question: 'Can I schedule dbt runs with cron?', answer: 'Yes. dbt-Workbench includes a scheduler with timezone-aware cron support and run history diagnostics.' },
  { question: 'Does dbt-Workbench support lineage and column lineage?', answer: 'Yes. You can explore deterministic model-level lineage and optional column-level lineage from dbt artifacts.' },
];

const pillColor = (c: string) =>
  c === 'success' ? 'pi-pill-success' : c === 'danger' ? 'pi-pill-danger' : c === 'warning' ? 'pi-pill-warning' : 'pi-pill-neutral';

const tone = (s: string) =>
  s === 'succeeded' ? 'var(--color-brand-success)' : s === 'failed' ? 'var(--color-brand-danger)' : 'var(--color-text-tertiary)';

export default function Home(): JSX.Element {
  const lineageScreenshotUrl = useBaseUrl('/img/screenshots/lineage-ui.png');
  const demoGifUrl = useBaseUrl('/img/demo.gif');
  const lineageGifUrl = useBaseUrl('/img/lineage-usecase.gif');
  const runGifUrl = useBaseUrl('/img/run-usecase.gif');
  const catalogGifUrl = useBaseUrl('/img/catalog-usecase.gif');
  const sqlGifUrl = useBaseUrl('/img/sql-usecase.gif');
  const mixTotal = resourceMix.reduce((a, b) => a + b.value, 0);
  let acc = 0;
  const stops = resourceMix.map((r) => {
    const from = acc;
    acc += r.value;
    return `${r.color} ${((from / mixTotal) * 100).toFixed(1)}% ${((acc / mixTotal) * 100).toFixed(1)}%`;
  });

  return (
    <Layout title="dbt-Workbench: Open Source dbt UI for Lineage, Runs, and Docs" description="Open source dbt-Workbench is a dbt UI for local, on-prem, and air-gapped deployments with no vendor lock-in.">
      <HomeJsonLd />
      <FaqJsonLd items={homeFaqItems} />

      <main style={{ padding: '1.5rem 2rem', maxWidth: 1280, margin: '0 auto' }}>
        {/* Header row like Dashboard */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.01em' }}>
              Project Pulse
            </h1>
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
              5 workspaces · dbt command center
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="pi-pill pi-pill-success">System: ok</span>
            <Link className="button button--primary" to="/docs/quickstart-docker/" style={{ borderRadius: 10, padding: '8px 14px', fontWeight: 600, fontSize: 13 }}>
              Start with Docker Compose
            </Link>
            <Link to="/docs/dbt-ui/" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-brand-primary)' }}>
              Read dbt UI guide
            </Link>
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
          {kpis.map((k) => (
            <div key={k.title} className="pi-card" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <p className="pi-kpi-title">{k.title}</p>
                <span className={clsx('pi-pill', pillColor(k.color))}>{k.tag}</span>
              </div>
              <div style={{ marginTop: 10, fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>{k.value}</div>
              <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6 }}>{k.subtitle}</p>
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid color-mix(in srgb, var(--color-border-primary) 60%, transparent)', fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                {k.footer}
              </div>
            </div>
          ))}
        </div>

        {/* Main grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Run outcomes chart */}
            <div className="pi-card" style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>Run Outcomes</p>
                <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '2px 0 0' }}>dbt invocations grouped by day (last 20 runs)</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 180, padding: '8px 0' }}>
                {runBars.map((b) => {
                  const total = b.s + b.f + b.o;
                  const h = Math.max(20, total * 18);
                  return (
                    <div key={b.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: '100%', height: h, display: 'flex', flexDirection: 'column-reverse', borderRadius: 6, overflow: 'hidden', background: 'var(--color-bg-tertiary)' }}>
                        <div style={{ height: `${(b.s / total) * 100}%`, background: 'var(--chart-3)' }} />
                        <div style={{ height: `${(b.f / total) * 100}%`, background: 'var(--chart-5)' }} />
                        <div style={{ height: `${(b.o / total) * 100}%`, background: 'var(--chart-4)' }} />
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>{b.day}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--chart-3)', marginRight: 4 }} />Succeeded</span>
                <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--chart-5)', marginRight: 4 }} />Failed</span>
                <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--chart-4)', marginRight: 4 }} />Other</span>
              </div>
            </div>

            {/* Recent activity */}
            <div className="pi-card" style={{ padding: '1.25rem 1.5rem' }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 12px' }}>Recent Activity</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {recentRuns.map((r, idx) => (
                  <li key={r.id} style={{ position: 'relative', paddingBottom: 16, paddingLeft: 0 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <span style={{ width: 28, height: 28, borderRadius: '50%', background: tone(r.status) === 'var(--color-brand-success)' ? 'var(--color-brand-success)' : tone(r.status) === 'var(--color-brand-danger)' ? 'var(--color-brand-danger)' : 'var(--color-bg-tertiary)', color: 'var(--color-text-inverse)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flex: '0 0 28px' }}>
                        {r.status[0].toUpperCase()}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                          Run <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>#{r.id}</span>{' '}
                          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>({r.cmd})</span>
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>{r.time}</p>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: tone(r.status) }}>{r.status}</span>
                    </div>
                    {idx < recentRuns.length - 1 && (
                      <span style={{ position: 'absolute', left: 13, top: 30, width: 2, height: 'calc(100% - 18px)', background: 'var(--color-border-primary)' }} />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Resource mix donut */}
            <div className="pi-card" style={{ padding: '1.25rem 1.5rem' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>Resource Mix</p>
              <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '2px 0 12px' }}>Manifest resources by type</p>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <div style={{ width: 160, height: 160, borderRadius: '50%', background: `conic-gradient(${stops.join(', ')})`, position: 'relative', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ position: 'absolute', inset: 28, borderRadius: '50%', background: 'var(--color-widget-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--color-text-primary)', fontSize: 13 }}>
                    {mixTotal}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                {resourceMix.map((r) => (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                    <i style={{ width: 8, height: 8, borderRadius: 2, background: r.color }} />
                    {r.label} <span style={{ color: 'var(--color-text-tertiary)' }}>({r.value})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Project overview */}
            <div className="pi-card" style={{ padding: '1.25rem 1.5rem' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 12px' }}>Project Overview</p>
              <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><dt style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>Models</dt><dd style={{ margin: 0, fontWeight: 700, color: 'var(--color-text-primary)' }}>96</dd></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><dt style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>Seeds</dt><dd style={{ margin: 0, fontWeight: 700, color: 'var(--color-text-primary)' }}>18</dd></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><dt style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>Snapshots</dt><dd style={{ margin: 0, fontWeight: 700, color: 'var(--color-text-primary)' }}>14</dd></div>
              </dl>
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border-primary)' }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)', margin: '0 0 8px' }}>Artifacts Status</p>
                {artifacts.map((a) => (
                  <div key={a.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>{a.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: a.present ? 'var(--color-brand-success)' : 'var(--color-brand-danger)' }}>
                      {a.present ? 'Present' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border-primary)' }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)', margin: '0 0 4px' }}>Connected Remote</p>
                <p style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-secondary)', margin: 0, wordBreak: 'break-all' }}>https://github.com/rezer-bleede/dbt-Workbench</p>
              </div>
            </div>
          </div>
        </div>

        {/* Product in action */}
        <section style={{ marginBottom: 32, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>See the product in action</h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', margin: '0 0 12px', lineHeight: 1.6 }}>
              Explore interactive lineage DAGs, run orchestration with live logs, searchable data catalog, and SQL workspace execution in one place.
            </p>
            <Link to="/docs/screenshots/" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-brand-primary)' }}>View dbt-Workbench screenshots & GIFs →</Link>
          </div>
          <img
            className={styles.screenshot}
            src={demoGifUrl}
            alt="dbt-Workbench 4-quadrant preview showing 4 key use cases"
            loading="lazy"
          />
        </section>

        {/* Documentation index re-skinned */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 16px' }}>Documentation index</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
            <div>
              <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)', margin: '0 0 8px' }}>Core product</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <li><Link to="/docs/dbt-ui/">dbt UI overview and workflows</Link></li>
                <li><Link to="/docs/lineage-overview/">dbt lineage visualization</Link></li>
                <li><Link to="/docs/run-orchestration/">dbt run orchestration</Link></li>
                <li><Link to="/docs/sql-workspace/">dbt SQL workspace</Link></li>
              </ul>
            </div>
            <div>
              <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)', margin: '0 0 8px' }}>Operations</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <li><Link to="/docs/scheduler/">dbt scheduler and cron runs</Link></li>
                <li><Link to="/docs/air-gapped-on-prem/">air-gapped dbt UI operations</Link></li>
                <li><Link to="/docs/auth-rbac/">dbt RBAC and authentication</Link></li>
              </ul>
            </div>
            <div>
              <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)', margin: '0 0 8px' }}>Data discovery</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <li><Link to="/docs/catalog/">dbt catalog viewer</Link></li>
                <li><Link to="/docs/docs-viewer/">dbt docs viewer</Link></li>
                <li><Link to="/docs/artifacts/">dbt artifacts viewer</Link></li>
                <li><Link to="/docs/comparisons/dbt-cloud-vs-dbt-workbench/">dbt platform comparisons</Link></li>
                <li><Link to="/docs/use-cases/self-hosted-dbt-for-regulated-teams/">dbt use-case playbooks</Link></li>
                <li><Link to="/docs/tutorials/setup-dbt-ui-in-under-30-minutes/">dbt implementation tutorials</Link></li>
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 16px' }}>Frequently asked questions</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {homeFaqItems.map((item) => (
              <article key={item.question} className="pi-card">
                <h3 style={{ fontSize: '1.02rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 6px' }}>{item.question}</h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{item.answer}</p>
              </article>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <GitHubCta position="bottom" campaign="homepage_footer_cta" label="Explore source code and issues on GitHub" />
          </div>
        </section>

        {/* Interactive mini lineage preview */}
        <section className="pi-card" style={{ padding: '1.25rem 1.5rem', marginBottom: 32 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>Interactive lineage preview (app capture)</h2>
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '0 0 12px' }}>A live mini-graph of model dependencies. Open docs for full graph.</p>
          <svg viewBox="0 0 600 180" style={{ width: '100%', height: 180 }}>
            {[
              { x: 60, y: 90, label: 'raw.orders' },
              { x: 220, y: 60, label: 'stg_orders' },
              { x: 220, y: 120, label: 'stg_customers' },
              { x: 380, y: 90, label: 'fct_orders' },
              { x: 520, y: 90, label: 'mart_revenue' },
            ].map((n, i) => (
              <g key={i}>
                <rect x={n.x - 46} y={n.y - 16} width={92} height={32} rx={8} fill="var(--color-widget-bg)" stroke="var(--color-widget-border)" />
                <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-text-primary)">{n.label}</text>
              </g>
            ))}
            {[[0,1],[0,2],[1,3],[2,3],[3,4]].map(([a,b],i)=> {
              // compute positions
              const pts = [{x:60,y:90},{x:220,y:60},{x:220,y:120},{x:380,y:90},{x:520,y:90}];
              const p1=pts[a], p2=pts[b];
              return <line key={i} x1={p1.x+46} y1={p1.y} x2={p2.x-46} y2={p2.y} stroke="var(--color-brand-primary)" strokeWidth={1.5} opacity={0.6} />
            })}
          </svg>
          <Link to="/docs/lineage-overview/" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-brand-primary)' }}>Open full lineage docs →</Link>
        </section>

        <style>{`
          .markdown a { color: var(--color-brand-primary); font-weight: 500; }
          .markdown a:hover { text-decoration: underline; }
          ul li { color: var(--color-text-secondary); font-size: 13px; }
          @media (max-width: 860px) { main > div[style*="2fr 1fr"] { grid-template-columns: 1fr !important; } }
        `}</style>
      </main>
    </Layout>
  );
}
