import React, {useMemo, useState} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import {demoEdges, demoNodes, downstreamModels} from '@site/src/data/demoLineage';
import styles from './demo.module.css';

export default function Demo(): JSX.Element {
  const [selectedId, setSelectedId] = useState('stg_orders');
  const downstream = useMemo(() => downstreamModels(selectedId), [selectedId]);
  const affected = useMemo(
    () => new Set([selectedId, ...downstream]),
    [selectedId, downstream],
  );
  const selected = demoNodes.find(({id}) => id === selectedId);

  return (
    <Layout
      title="Try the interactive dbt lineage demo"
      description="Explore model dependencies and downstream impact in a real sample dbt project. No install or sign-up required."
    >
      <main className={styles.page}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>NO INSTALL · NO SIGN-UP</p>
          <h1>What breaks if you change a dbt model?</h1>
          <p>Click any model to trace its downstream impact in a sample dbt project.</p>
        </header>

        <section className={styles.demo} aria-label="Interactive sample project lineage">
          <div className={styles.demoHeader}>
            <div>
              <strong>Sample project lineage</strong>
              <span>8 models · 8 dependencies</span>
            </div>
            <span className={styles.hint}>Select a model to explore impact</span>
          </div>

          <div className={styles.graphScroll}>
            <div
              className={styles.graph}
              role="group"
              aria-label="Click a model to highlight downstream dependencies"
            >
              <span className={styles.columnLabel} style={{left: '15.24%'}}>RAW</span>
              <span className={styles.columnLabel} style={{left: '50%'}}>STAGING</span>
              <span className={styles.columnLabel} style={{left: '84.76%'}}>MARTS</span>

              <svg className={styles.edges} viewBox="0 0 1050 540" aria-hidden="true">
                <defs>
                  <marker
                    id="demo-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="3.5"
                    orient="auto"
                  >
                    <path d="M0,0 L7,3.5 L0,7 Z" />
                  </marker>
                </defs>
                {demoEdges.map((edge) => {
                  const source = demoNodes.find(({id}) => id === edge.source)!;
                  const target = demoNodes.find(({id}) => id === edge.target)!;
                  const active = affected.has(edge.source) && affected.has(edge.target);
                  return (
                    <path
                      key={`${edge.source}-${edge.target}`}
                      className={`${styles.edge} ${active ? styles.edgeActive : ''}`}
                      d={`M ${source.x + 100} ${source.y} C ${source.x + 180} ${source.y}, ${target.x - 180} ${target.y}, ${target.x - 100} ${target.y}`}
                      markerEnd="url(#demo-arrow)"
                    />
                  );
                })}
              </svg>

              {demoNodes.map((node) => {
                const selectedNode = node.id === selectedId;
                const impactedNode = affected.has(node.id);
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={[
                      styles.node,
                      styles[node.layer.toLowerCase()],
                      selectedNode ? styles.selected : '',
                      !impactedNode ? styles.dimmed : '',
                    ].join(' ')}
                    style={{left: `${(node.x / 1050) * 100}%`, top: `${(node.y / 540) * 100}%`}}
                    aria-pressed={selectedNode}
                    aria-label={`${node.id}, ${node.layer} model. Show downstream impact.`}
                    onClick={() => setSelectedId(node.id)}
                  >
                    <span>{node.label}</span>
                    <small>{node.layer} model</small>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.impact} aria-live="polite">
            <div>
              <span className={styles.impactLabel}>SELECTED MODEL</span>
              <strong><code>{selected?.label}</code></strong>
              <span>{selected?.layer} model</span>
            </div>
            <div>
              <span className={styles.impactLabel}>
                DOWNSTREAM IMPACT · {downstream.size} {downstream.size === 1 ? 'MODEL' : 'MODELS'}
              </span>
              {downstream.size ? (
                <ul className={styles.impactList}>
                  {demoNodes.filter(({id}) => downstream.has(id)).map((node) => (
                    <li key={node.id}>{node.label}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.noImpact}>No downstream models depend on this one.</p>
              )}
            </div>
          </div>
          <p className={styles.note}>
            Based on the bundled sample project’s dbt manifest. The demo is read-only; no data is sent.
          </p>
        </section>

        <footer className={styles.actions}>
          <div>
            <h2>See it on your own project</h2>
            <p>Run Workbench locally with Docker Compose and connect your dbt project.</p>
          </div>
          <div className={styles.actionLinks}>
            <Link className="button button--primary" to="/docs/quickstart-docker/">
              Install with Docker
            </Link>
            <a
              className="button button--secondary"
              href="https://github.com/rezer-bleede/dbt-Workbench/stargazers"
            >
              Star on GitHub
            </a>
          </div>
        </footer>
      </main>
    </Layout>
  );
}
