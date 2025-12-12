# dbt-Workbench Architecture

dbt-Workbench is a fully containerized, modular UI and API stack designed to provide an open-source alternative to dbt Cloud.

---

## 1. High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (UI)                            │
│              React + TypeScript + Vite + Tailwind CSS            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Pages: Dashboard, Models, Lineage, Runs, Schedules,     │   │
│  │         SQL Workspace, Catalog, Settings, Plugins        │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────┘
                               │ REST API / WebSocket
┌──────────────────────────────▼──────────────────────────────────┐
│                         Backend API                              │
│                      FastAPI + SQLAlchemy                        │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐  │
│  │   Routes   │  │  Services  │  │   Schemas  │  │  Plugins  │  │
│  └────────────┘  └────────────┘  └────────────┘  └───────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
┌─────────▼─────────┐  ┌───────▼───────┐  ┌────────▼────────┐
│    PostgreSQL     │  │ dbt Artifacts │  │  Git Repos      │
│   Metadata DB     │  │ (Volume Mount)│  │  (Volume Mount) │
└───────────────────┘  └───────────────┘  └─────────────────┘
```

---

## 2. Components

### **2.1 Frontend**

| Aspect | Details |
|--------|---------|
| Framework | React 18+ with TypeScript |
| Styling | Tailwind CSS |
| Bundler | Vite |
| State Management | React Context + Hooks |
| Routing | React Router v6 |
| API Client | Axios with interceptors |

**Page Structure:**
```
frontend/src/
├── pages/
│   ├── Dashboard.tsx          # Overview metrics and health
│   ├── Models.tsx             # Model browser
│   ├── ModelDetail.tsx        # Individual model details
│   ├── Lineage.tsx            # DAG visualization
│   ├── Runs.tsx               # Run history
│   ├── Schedules.tsx          # Scheduler management
│   ├── Environments.tsx       # Environment CRUD
│   ├── SqlWorkspace.tsx       # SQL editor
│   ├── VersionControl.tsx     # Git integration
│   ├── PluginsInstalled.tsx   # Plugin management
│   ├── PluginMarketplace.tsx  # Plugin discovery
│   ├── Settings.tsx           # Configuration view
│   └── Login.tsx              # Authentication (when enabled)
├── components/                 # Reusable UI components
├── context/                    # Auth, Workspace contexts
├── services/                   # API service clients
└── types/                      # TypeScript type definitions
```

---

### **2.2 Backend (FastAPI)**

**Architecture Pattern:** Layered architecture with separation of concerns

```
backend/app/
├── api/
│   └── routes/               # API endpoint handlers
│       ├── admin.py          # Admin operations
│       ├── artifacts.py      # Artifact management
│       ├── auth.py           # Authentication endpoints
│       ├── catalog.py        # Data catalog API
│       ├── execution.py      # dbt execution API
│       ├── git.py            # Git operations
│       ├── lineage.py        # Lineage graph API
│       ├── models.py         # Model metadata API
│       ├── plugins.py        # Plugin management API
│       ├── runs.py           # Run history API
│       ├── schedules.py      # Scheduler API
│       ├── sql_workspace.py  # SQL query API
│       └── workspaces.py     # Workspace management
├── core/
│   ├── auth.py               # JWT, RBAC, dependencies
│   ├── config.py             # Pydantic settings
│   └── plugins/              # Plugin system core
│       ├── manager.py        # Plugin lifecycle manager
│       └── models.py         # Plugin data models
├── database/
│   ├── connection.py         # SQLAlchemy engine setup
│   ├── models/               # ORM models
│   └── services/             # Database service layer
├── schemas/                   # Pydantic request/response models
├── services/                  # Business logic
│   ├── artifact_service.py   # Artifact parsing
│   ├── artifact_watcher.py   # File system watcher
│   ├── audit_service.py      # Audit logging
│   ├── catalog_service.py    # Catalog operations
│   ├── dbt_executor.py       # dbt command execution
│   ├── git_service.py        # Git operations
│   ├── lineage_service.py    # Lineage computation
│   ├── notification_service.py # Notifications
│   ├── plugin_service.py     # Plugin facade
│   ├── scheduler_service.py  # Scheduler logic
│   └── sql_workspace_service.py # SQL execution
└── main.py                    # FastAPI application entry
```

---

### **2.3 Database Schema**

**Core Tables:**

| Table | Purpose |
|-------|---------|
| `workspaces` | Multi-tenant workspace isolation |
| `users` | User accounts and credentials |
| `user_workspaces` | User-workspace membership |
| `environments` | dbt execution environments |
| `schedules` | Cron-based schedule definitions |
| `scheduled_runs` | Schedule execution history |
| `runs` | dbt run records |
| `models` | Model metadata snapshots |
| `lineage` | Model-level relationships |
| `column_lineage` | Column-level relationships |
| `git_repositories` | Connected repositories |
| `plugin_workspace_configs` | Per-workspace plugin settings |
| `audit_logs` | Audit trail |

---

### **2.4 Artifact Ingestion**

The backend reads dbt-generated JSON artifacts from a mounted directory.

**Supported Artifacts:**

| File | Purpose |
|------|---------|
| `manifest.json` | Model definitions, nodes, sources, tests |
| `run_results.json` | Execution results and timing |
| `catalog.json` | Column metadata and statistics |
| `sources.json` | Source freshness data (if synced) |

**Watcher Service:**
- Polls for file changes every N seconds (configurable)
- Maintains version history (configurable limit)
- Triggers metadata refresh automatically
- Notifies frontend via API

---

## 3. Docker Architecture

```yaml
# docker-compose.yml structure
services:
  db:              # PostgreSQL database
    ports: 5432
    volumes: pgdata

  backend:         # FastAPI application
    ports: 8000
    volumes:
      - ./sample_artifacts:/app/dbt_artifacts:ro
      - ./plugins:/app/plugins:ro
      - ./data/repos:/app/data/repos
    depends_on: db

  frontend:        # React/Vite application
    ports: 3000
    depends_on: backend
```

**Networking:**
- All containers on shared Docker network
- Frontend proxies API calls via environment variable
- Backend connects to PostgreSQL via internal hostname

---

## 4. Authentication & Authorization Flow

```
┌─────────┐    POST /auth/login    ┌─────────────┐
│ Browser │ ─────────────────────► │   Backend   │
└────┬────┘                        └──────┬──────┘
     │                                    │
     │  ◄─────────────────────────────────┤
     │   { access_token, refresh_token }  │
     │                                    │
     │    GET /api/* (Bearer token)       │
     │ ──────────────────────────────────►│
     │                                    │
     │    1. Validate JWT                 │
     │    2. Extract user + role          │
     │    3. Check workspace access       │
     │    4. Enforce RBAC                 │
     │                                    │
     │  ◄─────────────────────────────────┤
     │        Response (or 403)           │
```

**When AUTH_ENABLED=false:**
- All requests treated as authenticated Admin user
- No JWT validation performed
- Suitable for local development and single-user deployments

---

## 5. Plugin System Architecture

```
plugins/
├── my-plugin/
│   ├── manifest.json     # Plugin metadata and configuration
│   ├── backend/          # Python modules for backend extension
│   │   └── routes.py     # FastAPI router factory
│   ├── frontend/         # Frontend assets (if any)
│   └── static/           # Static assets (images, etc.)
```

**Plugin Lifecycle:**

1. **Discovery** - Scan PLUGINS_DIRECTORY for manifest.json files
2. **Validation** - Check manifest schema, compatibility, permissions
3. **Loading** - Import backend modules, register routes
4. **Activation** - Enable plugin, emit lifecycle event
5. **Hot-Reload** - Watch for changes, reload on modification

**Plugin Manager Features:**
- Thread-safe plugin registry with locking
- Event bus for lifecycle notifications
- Capability-based permission model
- Compatibility checking (version constraints)

---

## 6. Data Flow

### Request Flow
```
1. User action in UI
2. Frontend calls API via Axios
3. FastAPI route handler invoked
4. RBAC check via dependency injection
5. Service layer executes business logic
6. Database/file operations as needed
7. Response returned to frontend
8. UI updated with results
```

### dbt Execution Flow
```
1. User triggers run via UI
2. API creates run record
3. Executor spawns subprocess
4. Log streaming via async generator
5. Artifacts captured on completion
6. Watcher detects new artifacts
7. Metadata refreshed automatically
```

---

## 7. Scaling Considerations

| Component | Horizontal Scaling | Notes |
|-----------|-------------------|-------|
| Frontend | ✅ Stateless | Deploy behind load balancer |
| Backend | ⚠️ Limited | Shared state in DB, executor is single-node |
| Database | ✅ Standard | Use managed PostgreSQL for HA |
| Scheduler | ❌ Single | Leader election needed for multi-instance |

**Future Improvements:**
- Distributed task queue for dbt execution
- Redis for shared state and caching
- Kubernetes deployment manifests

---

## 8. Security Model

| Layer | Protection |
|-------|------------|
| Network | CORS restricted to frontend origin |
| Transport | HTTPS (configure via reverse proxy) |
| Authentication | JWT with configurable expiration |
| Authorization | Role-based access control (RBAC) |
| Workspace | Data isolation per workspace |
| Secrets | Environment variables (not in code) |
| SQL Injection | SQLAlchemy ORM with parameterized queries |
| File Access | Restricted to configured directories |

**Recommendations for Production:**
1. Set `JWT_SECRET_KEY` to cryptographically random value
2. Enable `AUTH_ENABLED=true`
3. Configure HTTPS via reverse proxy (nginx, Caddy)
4. Use managed PostgreSQL with encryption at rest
5. Restrict `SQL_WORKSPACE_ALLOW_DESTRUCTIVE_DEFAULT=false`

---

## 9. Monitoring & Observability

**Built-in Endpoints:**

| Endpoint | Purpose |
|----------|---------|
| `/health` | Liveness probe |
| `/docs` | Swagger UI (OpenAPI) |
| `/redoc` | ReDoc documentation |
| `/config` | Current configuration |

**Logging:**
- Python standard logging
- Structured log output
- Configurable log level

**Metrics (Future):**
- Prometheus endpoint planned
- Run duration histograms
- API latency tracking

---

This architecture supports rapid iteration while maintaining clean separation between UI, API, and data layers.
