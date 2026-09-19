<img src="assets/brand.svg" width="340" height="90" alt="dbt-Workbench">

# dbt-Workbench: Self-Hosted dbt Control Plane

dbt-Workbench is an open source, self-hosted dbt control plane for lineage visualization, run
orchestration, catalog and docs workflows, SQL exploration, and workspace management.
It is designed for local, on-prem, and air-gapped deployments where teams need full control.

If your team has outgrown `dbt docs`, needs an operational UI around dbt Core, or cannot send data
workflows to a managed SaaS platform, start with the Docker demo below.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/rezer-bleede/dbt-Workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/rezer-bleede/dbt-Workbench/actions/workflows/ci.yml)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](docker-compose.yml)
[![GitHub stars](https://img.shields.io/github/stars/rezer-bleede/dbt-Workbench?style=social)](https://github.com/rezer-bleede/dbt-Workbench/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/rezer-bleede/dbt-Workbench?style=social)](https://github.com/rezer-bleede/dbt-Workbench/network/members)

Documentation: [https://rezer-bleede.github.io/dbt-Workbench/](https://rezer-bleede.github.io/dbt-Workbench/)

If dbt-Workbench helps your team, please star the repository.

## Product Preview

<p align="center">
  <img src="https://raw.githubusercontent.com/rezer-bleede/dbt-Workbench/main/assets/screenshots/lineage-readme.png" width="49%" alt="dbt-Workbench lineage visualization showing model dependencies">
  <img src="https://raw.githubusercontent.com/rezer-bleede/dbt-Workbench/main/assets/screenshots/catalog-readme.png" width="49%" alt="dbt-Workbench catalog showing dbt model metadata">
</p>

## Try It in About a Minute

Prerequisites:
- Docker
- Docker Compose

```bash
docker compose up --build
```

Open:
- UI: `http://localhost:3000`
- API: `http://localhost:8000`
- API Docs: `http://localhost:8000/docs`

The repository includes a ready-to-run demo dbt project in `./dbt_project` so you can run models,
inspect lineage, and explore catalog metadata immediately.

## Who It Is For

- **Analytics engineers:** Explore lineage, run models, inspect artifacts, and browse documentation
  without switching between terminal commands and static docs.
- **Data platform teams:** Provide a governed dbt workspace with RBAC, run history, scheduling, and
  workspace isolation inside your own infrastructure.
- **Regulated teams:** Keep dbt workflows local, on-prem, or air-gapped while retaining searchable
  lineage, catalog, and operational diagnostics.

## Why Evaluate It Now

| If you need... | Start here |
|---|---|
| A working dbt UI in under 30 minutes | [Docker quickstart](https://rezer-bleede.github.io/dbt-Workbench/docs/quickstart-docker/) |
| A self-hosted dbt Cloud alternative | [Migration guide](https://rezer-bleede.github.io/dbt-Workbench/docs/guides/migrate-from-dbt-cloud/) |
| Secure private-network deployment | [Air-gapped deployment](https://rezer-bleede.github.io/dbt-Workbench/docs/air-gapped-on-prem/) |
| Faster impact analysis | [Lineage and column lineage](https://rezer-bleede.github.io/dbt-Workbench/docs/lineage-overview/) |

## Production Readiness Checklist

Before adopting the tool for a production evaluation, verify the items that matter to your team:

- [ ] Docker image and Compose deployment run successfully in the target environment.
- [ ] Authentication and Viewer/Developer/Admin RBAC match the team access model.
- [ ] dbt artifacts, logs, and project paths are stored according to your retention policy.
- [ ] Scheduler notifications, retries, and timezone behavior are tested.
- [ ] Backup, upgrade, and rollback procedures are documented.
- [ ] Air-gapped or restricted-network dependencies are mirrored and tested if applicable.

See the [production deployment guides](https://rezer-bleede.github.io/dbt-Workbench/docs/air-gapped-on-prem/)
and open an issue if a checklist item is unclear.

## dbt Cloud vs dbt-Workbench (At a Glance)

| Area | dbt-Workbench | dbt Cloud |
|------|---------------|-----------|
| Operating model | Self-hosted (local, on-prem, air-gapped) | Managed cloud service |
| License model | MIT open source | Commercial SaaS |
| Data and infra control | Stays in your environment | Managed by vendor environment |
| Lineage and docs | Model and column lineage + docs viewer | Available |
| Run orchestration | Built-in run controls and history | Available |
| Scheduling | Cron scheduler with notifications | Available |
| SQL workspace | Built-in SQL editor and execution controls | Available |
| Auth and RBAC | Optional JWT auth + Viewer/Developer/Admin roles | Available |
| Extensibility | Open plugin system with source access | Vendor extension model |

Detailed comparison: [dbt Cloud vs dbt-Workbench](https://rezer-bleede.github.io/dbt-Workbench/docs/comparisons/dbt-cloud-vs-dbt-workbench/)

## Who Uses dbt-Workbench?

Are you running dbt-Workbench in your team? Open an issue with "Adopter" in the title and we can add you here.

## Why Teams Choose dbt-Workbench

- Full control of deployment and data boundaries
- No per-seat or per-run pricing model
- Interactive model and column-level lineage
- Built-in run orchestration with logs and history
- Catalog workflows with search, metadata, and validation
- Workspace-aware Git integration for dbt project workflows
- Optional authentication and role-based access control
- Plugin system and AI copilot support

## Core Feature Areas

- **Lineage:** Deterministic DAG layout, grouping, expand/collapse, upstream/downstream impact analysis
- **Execution:** Run dbt commands from the UI with real-time logs and artifact capture
- **Scheduler:** Cron-style runs, environment-specific configs, retries, notifications
- **Catalog:** Search across dbt entities with enriched metadata and validation reports
- **SQL Workspace:** Custom SQL and compiled dbt SQL execution with query history
- **Workspaces and RBAC:** Optional JWT auth, roles, workspace isolation, and switching
- **Plugins and AI:** Hot-reloadable plugin system and workspace-aware AI copilot flows

## Project Structure

```text
dbt-Workbench/
|- backend/                # FastAPI API and execution services
|- frontend/               # React + TypeScript + Vite UI
|- website/                # Docusaurus documentation source
|- dbt_project/            # Demo dbt project for local quickstart
|- sample_artifacts/       # Sample dbt artifacts
|- docker-compose.yml      # Local full stack setup
|- ARCHITECTURE.md         # Architecture and system design
|- ROADMAP.md              # Completed and planned milestones
`- CONTRIBUTING.md         # Contribution guidelines
```

## Documentation

- Quickstart: [Quickstart with Docker Compose](https://rezer-bleede.github.io/dbt-Workbench/docs/quickstart-docker/)
- Lineage: [Lineage Overview](https://rezer-bleede.github.io/dbt-Workbench/docs/lineage-overview/)
- Run orchestration: [Run Orchestration](https://rezer-bleede.github.io/dbt-Workbench/docs/run-orchestration/)
- Scheduler: [Scheduler](https://rezer-bleede.github.io/dbt-Workbench/docs/scheduler/)
- SQL workspace: [SQL Workspace](https://rezer-bleede.github.io/dbt-Workbench/docs/sql-workspace/)
- Authentication: [Auth and RBAC](https://rezer-bleede.github.io/dbt-Workbench/docs/auth-rbac/)
- Air-gapped and on-prem: [Deployment Guide](https://rezer-bleede.github.io/dbt-Workbench/docs/air-gapped-on-prem/)
- Plugin system: [Plugin System](PLUGIN_SYSTEM.md)
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Roadmap: [ROADMAP.md](ROADMAP.md)

## API and Configuration

Use these references for full endpoint and environment variable details:
- API reference: `http://localhost:8000/docs` when running locally
- Architecture and deployment guidance: [Documentation site](https://rezer-bleede.github.io/dbt-Workbench/)
- Runtime settings reference: [backend/app/core/config.py](backend/app/core/config.py)

## Local Development

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev -- --host --port 3000
```

Docs site:

```bash
cd website
npm install
npm run start
```

## Testing

Backend:

```bash
cd backend
pytest
```

Frontend:

```bash
cd frontend
npm test
npm run test:e2e
```

Docs site:

```bash
cd website
npm test
```

## Contributing

Contributions are welcome.
See [CONTRIBUTING.md](CONTRIBUTING.md) for workflow, style, and PR expectations.

## Security

Please review [SECURITY.md](SECURITY.md) for responsible vulnerability reporting.

## License

MIT License. See [LICENSE](LICENSE).

## Star History

[![Stargazers over time](https://starchart.cc/rezer-bleede/dbt-Workbench.svg)](https://starchart.cc/rezer-bleede/dbt-Workbench)
