```
██████╗ ██████╗ ████████╗      ██╗    ██╗ ██████╗ ██████╗ ██╗  ██╗██████╗ ███████╗███╗   ██╗ ██████╗██╗  ██╗
██╔══██╗██╔══██╗╚══██╔══╝      ██║    ██║██╔═══██╗██╔══██╗██║ ██╔╝██╔══██╗██╔════╝████╗  ██║██╔════╝██║  ██║
██║  ██║██████╔╝   ██║         ██║ █╗ ██║██║   ██║██████╔╝█████╔╝ ██████╔╝█████╗  ██╔██╗ ██║██║     ███████║
██║  ██║██╔══██╗   ██║         ██║███╗██║██║   ██║██╔══██╗██╔═██╗ ██╔══██╗██╔══╝  ██║╚██╗██║██║     ██╔══██║
██████╔╝██████╔╝   ██║         ╚███╔███╔╝╚██████╔╝██║  ██║██║  ██╗██████╔╝███████╗██║ ╚████║╚██████╗██║  ██║
╚═════╝ ╚═════╝    ╚═╝          ╚══╝╚══╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝
```

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](docker-compose.yml)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](backend)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](frontend)

A lightweight, open-source UI for dbt that provides model browsing, lineage visualization,
run orchestration, documentation previews, and environment management — without vendor lock-in.
Designed for local, on‑prem, and air‑gapped deployments.

---
## ✨ Highlights

- **Unified dbt control plane** for artifacts, runs, and environments
- **Interactive lineage** at model and column granularity with a deterministic D3/dagre layout, pan/zoom, and grouping controls
- **Workspace-aware** multi-project setup with strict path scoping
- **Secure by design** with optional JWT authentication + RBAC
- **Extensible** plugin system and Git-integrated workspace
- **Ready out-of-the-box** with a local demo project and git repo that persists your last active workspace

---

## 🧭 Table of Contents

- [Screenshots](#-screenshots)
- [Quickstart](#-quickstart)
- [Run with Docker Compose](#-run-with-docker-compose)
- [Multi-Project Workspaces](#-multi-project-workspaces)
- [Local Development](#-local-development)
- [Project Structure](#-project-structure)
- [Authentication & RBAC](#-authentication--rbac)
- [Environment Variables](#-environment-variables)
- [Features Overview](#-features-overview)
- [API Reference](#-api-reference)
- [Testing](#-testing)
- [Documentation](#-documentation)
- [Contributing](#-contributing)
- [License](#-license)

---

## 📸 Screenshots

### Lineage
<img width="1507" height="706" alt="image" src="https://github.com/user-attachments/assets/2496b665-831b-4c45-96b1-dcc8c00e3534" />

### Run history & execution insights
<img width="1512" height="708" alt="image" src="https://github.com/user-attachments/assets/76a23b14-0182-442e-b9fc-9bcf1f775cec" />

---

## 🚀 Quickstart

### **Prerequisites**
- Docker
- Docker Compose

---

## 🐳 Run with Docker Compose

```bash
docker-compose up --build
# or
docker compose up --build
```

### **Services**
- **UI:** http://localhost:3000
- **API:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs (Swagger UI)

### **Mounting dbt Artifacts**

The backend mounts:

```
./sample_artifacts → /app/dbt_artifacts
```

Replace `sample_artifacts` with your dbt `target/` directory containing:

- `manifest.json`
- `run_results.json`
- `catalog.json`

For the in-app **Docs** page, include the full contents from `dbt docs generate` (the `index.html` and accompanying assets)
inside your mounted `target/` directory. The viewer will automatically serve that site from the latest artifacts so you can
browse the complete dbt documentation without leaving the UI.

The UI will load and display real metadata from your dbt project automatically.

---

## 🧭 Multi-Project Workspaces

dbt-Workbench can manage multiple isolated projects in a single instance. Each workspace gets its own
repository folder under the configured `GIT_REPOS_BASE_PATH`, independent artifacts storage, and
per-workspace settings. File operations are hard-scoped to the active workspace root to prevent
cross-project access or path traversal, and switching workspaces refreshes the active project context
across the UI and API.

For local development, set a dedicated base path for repositories:

```bash
export GIT_REPOS_BASE_PATH=$(pwd)/data/repos
```

Each workspace will use a subdirectory under that path (e.g., `data/repos/<workspace-key>`), keeping
source files, artifacts, and run history isolated by project.

When authentication is disabled you can still switch the active project by sending the
`X-Workspace-Id` header on any API call. The frontend persists the last-selected workspace locally so
reloading the UI keeps the correct project context without leaking data between workspaces.

dbt-Workbench automatically bootstraps a local **Demo Project** with its own git repository on first
launch so you can explore the UI immediately. The Projects & Version Control page lets you add
local-only projects (each with their own repo) or connect remotes; on subsequent visits the UI loads
whichever project you last activated. The Project Files browser now renders an IDE-style hierarchy and
supports in-place editing or creating new files so you can keep dbt assets tidy without leaving the UI.

---

## 🔧 Local Development

### **Backend (FastAPI)**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### **Frontend (React + TypeScript + Vite)**

```bash
cd frontend
npm install
npm run dev -- --host --port 3000
```

Set the API base URL if needed:

```
VITE_API_BASE_URL = http://localhost:8000
```

---

## 📁 Project Structure

```
dbt-Workbench/
│
├── backend/               # FastAPI service for metadata + execution engine
│   ├── app/
│   │   ├── api/routes/    # API endpoint handlers
│   │   ├── core/          # Config, auth, plugins
│   │   ├── database/      # SQLAlchemy models and services
│   │   ├── schemas/       # Pydantic request/response models
│   │   ├── services/      # Business logic services
│   │   └── main.py        # FastAPI application entry
│   └── requirements.txt
├── frontend/              # React + TS + Vite UI
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── context/       # React contexts (Auth, etc.)
│   │   ├── pages/         # Page components
│   │   └── services/      # API service clients
│   └── package.json
├── plugins/               # Plugin directory (manifest + backend/frontend assets)
├── sample_artifacts/      # Demo dbt artifacts
├── docker-compose.yml     # Full stack orchestration
├── ARCHITECTURE.md        # System architecture documentation
├── PLUGIN_SYSTEM.md       # Plugin system specification
├── CONTRIBUTING.md        # Contribution guidelines
├── ROADMAP.md             # Development roadmap
└── README.md
```

---

## 🔐 Authentication & RBAC

### Authentication Modes

| Setting | Behavior |
|---------|----------|
| `AUTH_ENABLED=false` (default) | No login required, all users have Admin access |
| `AUTH_ENABLED=true` | JWT-based authentication with username/password |

### Authentication Endpoints (when enabled)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/login` | POST | Login with username/password, returns JWT tokens |
| `/auth/refresh` | POST | Refresh access token using refresh token |
| `/auth/logout` | POST | Logout (client discards tokens) |
| `/auth/me` | GET | Get current user information |
| `/auth/switch-workspace` | POST | Switch active workspace |

### Roles & Permissions

| Role | Level | Permissions |
|------|-------|-------------|
| **Viewer** | 0 | Read-only access to all data |
| **Developer** | 1 | + Create/edit environments, schedules, run dbt commands |
| **Admin** | 2 | + Manage users, plugins, workspaces, global settings |

### RBAC by Feature

| Feature | Viewer | Developer | Admin |
|---------|--------|-----------|-------|
| View models, lineage, catalog | ✅ | ✅ | ✅ |
| View runs and history | ✅ | ✅ | ✅ |
| Execute dbt commands | ❌ | ✅ | ✅ |
| Create/edit environments | ❌ | ✅ | ✅ |
| Create/edit schedules | ❌ | ✅ | ✅ |
| Enable/disable plugins | ❌ | ❌ | ✅ |
| Manage users | ❌ | ❌ | ✅ |
| Manage workspaces | ❌ | ❌ | ✅ |

---

## ⚙️ Environment Variables

### Database Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | `localhost` | PostgreSQL server hostname |
| `POSTGRES_PORT` | `5432` | PostgreSQL server port |
| `POSTGRES_USER` | `user` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `password` | PostgreSQL password |
| `POSTGRES_DB` | `dbt_workbench` | PostgreSQL database name |
| `DATABASE_URL` | - | Override full database URL (optional) |

### Core Application

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_PORT` | `8000` | Backend API server port |
| `DBT_ARTIFACTS_PATH` | `./dbt_artifacts` | Path to dbt artifacts directory |
| `DBT_PROJECT_PATH` | `./dbt_project` | Path to dbt project for execution |
| `GIT_REPOS_BASE_PATH` | `./data/repos` | Base path for cloned Git repositories |

### Authentication & Security

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_ENABLED` | `false` | Enable JWT authentication |
| `SINGLE_PROJECT_MODE` | `true` | Single workspace mode (no workspace switching) |
| `JWT_SECRET_KEY` | `change_me` | **CHANGE IN PRODUCTION** - Secret key for JWT signing |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Access token expiration time |
| `REFRESH_TOKEN_EXPIRE_MINUTES` | `43200` | Refresh token expiration (30 days) |

### Password Policy

| Variable | Default | Description |
|----------|---------|-------------|
| `PASSWORD_MIN_LENGTH` | `12` | Minimum password length |
| `PASSWORD_REQUIRE_UPPERCASE` | `true` | Require uppercase letter |
| `PASSWORD_REQUIRE_LOWERCASE` | `true` | Require lowercase letter |
| `PASSWORD_REQUIRE_NUMBER` | `true` | Require number |
| `PASSWORD_REQUIRE_SPECIAL` | `false` | Require special character |

### Default Workspace

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_WORKSPACE_KEY` | `default` | Default workspace key identifier |
| `DEFAULT_WORKSPACE_NAME` | `Default dbt Project` | Default workspace display name |
| `DEFAULT_WORKSPACE_DESCRIPTION` | `Default workspace` | Default workspace description |

### Artifact Watcher

| Variable | Default | Description |
|----------|---------|-------------|
| `ARTIFACT_POLLING_INTERVAL` | `5` | Polling interval in seconds |
| `MAX_ARTIFACT_VERSIONS` | `10` | Maximum artifact versions to retain |
| `MONITORED_ARTIFACT_FILES` | `manifest.json,run_results.json,catalog.json` | Files to monitor for changes |

### Lineage Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_GROUPING_MODE` | `none` | Default graph grouping (`none`, `schema`, `tag`) |
| `MAX_INITIAL_LINEAGE_DEPTH` | `4` | Maximum initial graph depth |
| `LOAD_COLUMN_LINEAGE_BY_DEFAULT` | `false` | Load column-level lineage by default |
| `LINEAGE_PERFORMANCE_MODE` | `balanced` | Performance mode (`fast`, `balanced`, `detailed`) |

### dbt Execution

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_CONCURRENT_RUNS` | `1` | Maximum concurrent dbt runs |
| `MAX_RUN_HISTORY` | `100` | Maximum runs to keep in history |
| `MAX_ARTIFACT_SETS` | `50` | Maximum artifact sets to retain |
| `LOG_BUFFER_SIZE` | `1000` | Log buffer size in lines |

### Data Catalog

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOW_METADATA_EDITS` | `true` | Allow editing catalog metadata |
| `SEARCH_INDEXING_FREQUENCY_SECONDS` | `30` | Search index refresh interval |
| `FRESHNESS_THRESHOLD_OVERRIDE_MINUTES` | - | Override source freshness threshold |
| `VALIDATION_SEVERITY` | `warning` | Default validation severity |
| `STATISTICS_REFRESH_POLICY` | `on_artifact_change` | When to refresh column statistics |

### Scheduler

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHEDULER_ENABLED` | `true` | Enable the scheduler background process |
| `SCHEDULER_POLL_INTERVAL_SECONDS` | `30` | Scheduler polling interval |
| `SCHEDULER_MAX_CATCHUP_RUNS` | `10` | Maximum catch-up runs on restart |
| `SCHEDULER_DEFAULT_TIMEZONE` | `UTC` | Default timezone for schedules |

### SQL Workspace

| Variable | Default | Description |
|----------|---------|-------------|
| `SQL_WORKSPACE_DEFAULT_CONNECTION_URL` | - | **Required** - Database URL for SQL queries |
| `SQL_WORKSPACE_MAX_ROWS` | `5000` | Maximum rows returned per query |
| `SQL_WORKSPACE_TIMEOUT_SECONDS` | `60` | Query execution timeout |
| `SQL_WORKSPACE_ALLOW_DESTRUCTIVE_DEFAULT` | `false` | Allow destructive queries by default |

The SQL Workspace supports two execution modes:

- **Custom SQL**: freeform queries against the selected environment, honoring destructive-query guardrails and row limits.
- **dbt models**: dual-pane editor showing the model source next to the compiled SQL (read-only). The compiled SQL is refreshed per environment/target and is the only code sent to the warehouse for execution. Viewer roles can inspect compiled SQL, while Developers/Admins can execute it.

Additional behaviors:

- Profiling is always enabled for executed queries so column statistics are consistently available alongside results.
- Results are paginated in the UI to keep browsing responsive; server-side limits (such as `SQL_WORKSPACE_MAX_ROWS`) still cap the dataset returned from the warehouse.
- Running dbt models executes the compiled SQL artifact; if compiled code is missing the UI prompts you to compile/build first.
- The model file picker mirrors an IDE tree so large dbt projects remain navigable.

### Notifications

| Variable | Default | Description |
|----------|---------|-------------|
| `NOTIFICATIONS_SLACK_TIMEOUT_SECONDS` | `10` | Slack notification timeout |
| `NOTIFICATIONS_WEBHOOK_TIMEOUT_SECONDS` | `10` | Webhook notification timeout |
| `NOTIFICATIONS_EMAIL_FROM` | `dbt-workbench@example.com` | Email sender address |
| `NOTIFICATIONS_EMAIL_SMTP_HOST` | `localhost` | SMTP server host |
| `NOTIFICATIONS_EMAIL_SMTP_PORT` | `25` | SMTP server port |
| `NOTIFICATIONS_EMAIL_USE_TLS` | `false` | Use TLS for SMTP |
| `NOTIFICATIONS_EMAIL_USERNAME` | - | SMTP username |
| `NOTIFICATIONS_EMAIL_PASSWORD` | - | SMTP password |

### Plugin System

| Variable | Default | Description |
|----------|---------|-------------|
| `PLUGIN_SYSTEM_ENABLED` | `true` | Enable the plugin system |
| `PLUGINS_DIRECTORY` | `./plugins` | Plugin discovery directory |
| `PLUGIN_HOT_RELOAD_ENABLED` | `true` | Enable hot-reload on file changes |
| `PLUGIN_API_VERSION` | `1.0.0` | Plugin API version |
| `PLUGIN_ALLOWED_ENV_PREFIXES` | `DBT_,DBT_WORKBENCH_` | Allowed environment variable prefixes for plugins |

---

## 🧩 Features Overview

### **Phase 1 — Artifact Viewer (Complete)**
- Browse models, sources, tests
- Model details (columns, metadata)
- Basic lineage graph
- Runs list + statuses
- Dashboard overview

### **Phase 2 — Live Metadata Updates (Complete)**
- Auto-detect changes to dbt artifacts
- Background watcher reloads metadata
- Frontend shows update indicators
- In-memory versioning

### **Phase 3 — dbt Execution Engine (Complete)**
- Run dbt commands from UI
- Quick-launch Run/Test/Seed/Docs actions directly from the dbt Execution page via dedicated execution buttons (no separate command selector)
- Real-time log streaming
- Persist artifacts per run

### **Phase 4 — Metadata Persistence Layer (Complete)**
- PostgreSQL backend
- Historical model snapshots

### **Phase 5 — Advanced Lineage (Complete)**
- Column-level lineage derived from manifest and catalog artifacts
- Grouping by schema, resource type, and tags with collapsible aggregates
- Interactive expand/collapse of subgraphs to simplify large projects
- Upstream and downstream impact highlighting at model and column granularity
- Configurable defaults for grouping mode, graph depth, and column-level loading

### **Phase 6 — Scheduler (Complete)**
- Cron-style scheduled runs with timezone support
- Email, Slack, and webhook notifications
- Environment-specific configurations
- Retry policies with exponential backoff
- Catch-up and overlap policies

### **Profile management in Environments (New)**
- View configured dbt profiles and their available targets directly from the Environments page
- Add a new profile with a YAML snippet that is merged into `profiles.yml`
- Edit the full `profiles.yml` file inline when you need advanced changes

### **Phase 7 — SQL Workspace (Complete)**
- SQL editor with syntax highlighting
- Dual-pane dbt model view showing editable source alongside read-only compiled SQL
- Query execution against configured database with dbt model runs using compiled SQL only
- Environment-aware compilation and execution with role-based run restrictions
- Result profiling and statistics shared across custom SQL and dbt model runs
- Query history with execution mode, model references, and compiled SQL checksums

### **Phase 8 — Data Catalog Layer (Complete)**
- Global fuzzy/prefix search across models, sources, exposures, macros, tests, tags, and columns
- Rich entity detail pages with dbt metadata, owners, tags, documentation, lineage previews, and column statistics
- Test health indicators surfaced in search, detail pages, and validation reports
- Source freshness visibility (max loaded timestamp, age, thresholds, status, last check)
- Persistent metadata enrichment for owners/tags/descriptions with optional edit controls
- Column-level descriptions, data types, nullability, and statistics synced from `catalog.json`
- Validation of missing documentation, owners/tags, failing tests, freshness gaps, and stale sources

### **Phase 9 — RBAC & Multi-Project (Complete)**
- JWT-based authentication (optional)
- Role-based access control (Viewer, Developer, Admin)
- Multiple workspaces with independent data
- Workspace switching and per-user defaults

### **Phase 10 — Plugin Ecosystem (Complete)**
- Backend plugin manager with manifest validation, capability/permission checks, and lifecycle events
- Hot-reloadable plugins discovered from the configurable `PLUGINS_DIRECTORY` (default `./plugins`)
- Admin APIs to list, enable, disable, and reload plugins without restarting the server
- **Workspace-scoped plugin configuration API** for per-workspace settings
- Frontend marketplace and installed-plugins views with dynamic enable/disable controls
- Standardized plugin layout (`/plugins/<name>/manifest.json`, `backend/`, `frontend/`, `static/`)
- Safe opt-out via `PLUGIN_SYSTEM_ENABLED=false` for minimal installations

### **Phase 11 — Git-Integrated dbt Workspace (Complete)**
- Workspace-scoped Git connections with branch switching, pull, push, and commit workflows
- In-app file tree with SQL/Jinja editor for models and YAML editor support for dbt configs
- Git-aware commit diffing, status, and history panels plus audit log visibility
- Role-aware editing controls for protected configuration files and conflict handling cues
- Model diff viewer
- Historical lineage browser

---

## 🔗 API Reference

### Lineage API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/lineage/graph` | GET | Model-level lineage with grouping metadata |
| `/lineage/columns` | GET | Column-level lineage graph |
| `/lineage/model/{unique_id}` | GET | Parents, children, and columns for a model |
| `/lineage/upstream/{id}` | GET | Upstream impact analysis |
| `/lineage/downstream/{id}` | GET | Downstream impact analysis |
| `/lineage/groups` | GET | Grouping metadata for schemas, types, tags |

### Catalog API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/catalog/entities` | GET | List all catalog entities |
| `/catalog/entities/{unique_id}` | GET | Full entity detail with columns and tests |
| `/catalog/search` | GET | Fuzzy/prefix search across all entities |
| `/catalog/validation` | GET | Validation issues report |
| `/catalog/entities/{unique_id}` | PATCH | Update entity metadata (owner, tags, description) |
| `/catalog/entities/{unique_id}/columns/{column_name}` | PATCH | Update column-level metadata |

### Execution API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/execution/run` | POST | Start a new dbt run |
| `/execution/runs` | GET | List run history |
| `/execution/runs/{run_id}` | GET | Get run details |
| `/execution/runs/{run_id}/logs` | GET | Stream run logs |
| `/execution/runs/{run_id}/artifacts` | GET | Get run artifacts |
| `/execution/runs/{run_id}/cancel` | POST | Cancel a running job |

### Scheduler API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/schedules` | GET | List all schedules |
| `/schedules` | POST | Create a new schedule |
| `/schedules/{id}` | GET | Get schedule details |
| `/schedules/{id}` | PUT | Update schedule |
| `/schedules/{id}` | DELETE | Delete schedule |
| `/schedules/{id}/pause` | POST | Pause schedule |
| `/schedules/{id}/resume` | POST | Resume schedule |
| `/schedules/{id}/run` | POST | Trigger immediate run |
| `/schedules/environments` | GET | List environments |
| `/schedules/environments` | POST | Create environment |

### Plugin API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/plugins/installed` | GET | List installed plugins |
| `/plugins/{name}/enable` | POST | Enable a plugin (Admin) |
| `/plugins/{name}/disable` | POST | Disable a plugin (Admin) |
| `/plugins/reload` | POST | Hot-reload plugins (Admin) |
| `/plugins/config` | GET | List workspace plugin configs |
| `/plugins/config/{name}` | GET | Get plugin config |
| `/plugins/config` | POST | Create plugin config (Admin) |
| `/plugins/config/{name}` | PUT | Update plugin config (Admin) |
| `/plugins/config/{name}` | DELETE | Delete plugin config (Admin) |

### Git API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/git/connect` | POST | Clone and connect a repository |
| `/git/status` | GET | Get repository status |
| `/git/branches` | GET | List branches |
| `/git/checkout` | POST | Switch branch |
| `/git/pull` | POST | Pull latest changes |
| `/git/push` | POST | Push commits |
| `/git/commit` | POST | Create a commit |
| `/git/history` | GET | Get commit history |
| `/git/diff` | GET | Get file diff |
| `/git/files` | GET | List repository files |
| `/git/files/{path}` | GET | Read file content |
| `/git/files/{path}` | PUT | Write file content |

### Configuration API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/config` | GET | Get application configuration |
| `/workspaces/active` | GET | Get active workspace |
| `/workspaces` | GET | List workspaces (when auth enabled) |

---

## 🧪 Testing

### Backend
```bash
cd backend
pytest
```

### Frontend
```bash
cd frontend
npm test
```

Unit and integration coverage uses **Vitest** with **React Testing Library** (jsdom). The suite exercises the Version Control workflows (connected vs. missing repositories), dashboard fallbacks, and plugin pages. End-to-end UI checks use Playwright:

```bash
cd frontend
npm run test:e2e
```

---

## 📚 Documentation

- **Architecture:** `ARCHITECTURE.md`
- **Plugin system:** `PLUGIN_SYSTEM.md`
- **Contributing:** `CONTRIBUTING.md`
- **Roadmap:** `ROADMAP.md`

---

## 🤝 Contributing

Contributions are welcome!
See **CONTRIBUTING.md** for style guidelines, workflows, and expectations.

---

## 📜 License

MIT License — fully permissive for commercial and open-source use.

---

## ⭐ Support

If dbt-Workbench helps you, please star the repository to support the project.
