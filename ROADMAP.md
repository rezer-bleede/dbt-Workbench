# Roadmap — dbt-Workbench

This document tracks the development milestones of dbt-Workbench.

---

## ✅ Completed Phases

### Phase 1 — Core UI + Artifact Viewer ✅
- FastAPI backend for serving dbt metadata  
- React + Tailwind UI  
- Model list + detail view  
- Basic lineage graph  
- Runs viewer  
- Dashboard  

### Phase 2 — Live Metadata Updates ✅
- Auto-refresh when artifacts change  
- Backend watcher for JSON updates  
- Versioning of loaded artifacts  
- Configurable polling interval (`ARTIFACT_POLLING_INTERVAL`)  
- Version history limit (`MAX_ARTIFACT_VERSIONS`)

### Phase 3 — dbt Execution Engine ✅
- API to execute dbt commands  
- Live logs via streaming  
- Run status page  
- Auto-ingest artifacts after run  
- Concurrent run limiting (`MAX_CONCURRENT_RUNS`)
- Run history management (`MAX_RUN_HISTORY`)

### Phase 4 — Metadata Persistence Layer ✅
- PostgreSQL backend for model/run storage  
- Model history + diffs  
- Historical lineage visualization  
- SQLAlchemy ORM with migrations

### Phase 5 — Advanced Lineage ✅
- Column-level lineage from manifest and catalog
- Schema/tag/resource type grouping
- Impact analysis (upstream/downstream)
- Collapsible DAG sections
- Configurable defaults:
  - `DEFAULT_GROUPING_MODE`
  - `MAX_INITIAL_LINEAGE_DEPTH`
  - `LOAD_COLUMN_LINEAGE_BY_DEFAULT`
  - `LINEAGE_PERFORMANCE_MODE`

### Phase 6 — Scheduler ✅
- Cron-style scheduled runs with timezone support
- Multi-channel notifications (Email, Slack, Webhook)
- Environment-specific configurations
- Retry policies with exponential backoff
- Catch-up and overlap policies
- Run history per schedule
- Configuration options:
  - `SCHEDULER_ENABLED`
  - `SCHEDULER_POLL_INTERVAL_SECONDS`
  - `SCHEDULER_MAX_CATCHUP_RUNS`
  - `SCHEDULER_DEFAULT_TIMEZONE`

### Phase 7 — SQL Workspace ✅
- SQL editor with syntax highlighting
- Query execution against configured warehouse
- Result profiling + column statistics
- Query history
- Configuration:
  - `SQL_WORKSPACE_DEFAULT_CONNECTION_URL`
  - `SQL_WORKSPACE_MAX_ROWS`
  - `SQL_WORKSPACE_TIMEOUT_SECONDS`
  - `SQL_WORKSPACE_ALLOW_DESTRUCTIVE_DEFAULT`

### Phase 8 — Data Catalog ✅
- Global fuzzy/prefix search
- Rich entity detail pages
- Ownership + tags + descriptions
- Column-level metadata
- Test results overview
- Source freshness UI
- Validation reports
- Configuration:
  - `ALLOW_METADATA_EDITS`
  - `SEARCH_INDEXING_FREQUENCY_SECONDS`
  - `FRESHNESS_THRESHOLD_OVERRIDE_MINUTES`
  - `VALIDATION_SEVERITY`
  - `STATISTICS_REFRESH_POLICY`

### Phase 9 — RBAC + Multi-Project ✅
- JWT-based authentication (optional via `AUTH_ENABLED`)
- Role-based access control (Viewer, Developer, Admin)
- Multiple workspaces with data isolation
- Per-user workspace defaults
- Workspace switching API
- Password policy configuration
- Single-project mode option (`SINGLE_PROJECT_MODE`)

### Phase 10 — Plugin System ✅
- Backend plugin manager with manifest validation
- Hot-reloadable plugins via file watcher
- Admin APIs for plugin lifecycle
- **Workspace-scoped plugin configuration API** (NEW)
- Frontend marketplace and installed views
- Capability/permission model
- Lifecycle events
- Configuration:
  - `PLUGIN_SYSTEM_ENABLED`
  - `PLUGINS_DIRECTORY`
  - `PLUGIN_HOT_RELOAD_ENABLED`
  - `PLUGIN_API_VERSION`
  - `PLUGIN_ALLOWED_ENV_PREFIXES`

### Phase 11 — Git-Integrated dbt Workspace ✅
- Workspace-scoped Git connections
- Branch switching, pull, push, commit
- In-app file tree with SQL/Jinja editor
- YAML editor for dbt configs
- Git-aware diffing, status, history
- Audit log visibility
- Role-aware editing controls
- Conflict handling cues

---

## 🔄 In Progress

### Database Improvements
- [ ] Alembic migrations for schema versioning
- [ ] Connection pool optimization
- [ ] Read replicas support

### Performance Optimizations
- [ ] Response caching layer
- [ ] Lazy loading for large lineage graphs
- [ ] Incremental artifact parsing

---

## 📋 Planned Features

### Infrastructure & Deployment
- [ ] Kubernetes Helm charts
- [ ] Terraform modules
- [ ] GitHub Actions CI/CD templates
- [ ] Official Docker Hub images

### Distributed Execution
- [ ] Task queue integration (Celery/Redis)
- [ ] Multi-node dbt execution
- [ ] Remote execution agents

### Observability
- [ ] Prometheus metrics endpoint
- [ ] OpenTelemetry tracing
- [ ] Structured JSON logging
- [ ] Error tracking integration

### Enterprise Features
- [ ] SSO/SAML integration
- [ ] LDAP support
- [ ] Audit log export
- [ ] Custom branding
- [ ] Air-gapped deployment guide

### IDE & Development
- [ ] VS Code extension
- [ ] CLI tool for local development
- [ ] dbt Cloud project import

### CI/CD Integration
- [ ] GitHub Actions integration
- [ ] GitLab CI integration
- [ ] Bitbucket Pipelines integration
- [ ] CI artifact ingestion API

---

## 🔮 Long-Term Vision

- **Distributed Runner** — Scale dbt execution across multiple nodes
- **CI Ingestion API** — Receive artifacts directly from CI pipelines
- **Air-Gapped Enterprise Mode** — Full offline operation with local registries
- **Cost Management** — Query cost estimation and tracking
- **Data Quality Framework** — Custom quality rules beyond dbt tests
- **Semantic Layer Integration** — Connect with dbt Semantic Layer
- **Collaboration Features** — Comments, annotations, change requests

---

## Contributing

Want to help build the next phase? See **CONTRIBUTING.md** for guidelines.
