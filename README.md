# dbt-Workbench

A lightweight, open-source UI for dbt that provides model browsing, lineage visualization, run orchestration, documentation previews, and environment management — without vendor lock-in.  
Designed for local, on‑prem, and air‑gapped deployments.

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

### **Mounting dbt Artifacts**

The backend mounts:

```
./sample_artifacts → /app/dbt_artifacts
```

Replace `sample_artifacts` with your dbt `target/` directory containing:

- `manifest.json`
- `run_results.json`
- `catalog.json`

The UI will load and display real metadata from your dbt project automatically.

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

---

### **Frontend (React + TypeScript + Tailwind)**

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
├── frontend/              # React + TS + Tailwind UI
├── sample_artifacts/      # Minimal demo dbt artifacts
├── plugins/               # Marketplace-style plugin directory (manifest + backend/frontend assets)
├── docker-compose.yml     # Full stack orchestration
└── README.md
```

### Plugin bootstrap

- Set `PLUGINS_DIRECTORY` to point to your plugin root (default `./plugins`).
- Each plugin lives in `plugins/<name>/manifest.json` with optional `backend/`, `frontend/`, and `static/` folders.
- Use the admin-only Plugins navigation in the UI to enable/disable or hot-reload plugins at runtime.

---

## 🧩 Features Overview

### **Phase 1 — Artifact Viewer (Complete)**
- Browse models, sources, tests  
- Model details (columns, metadata)  
- Basic lineage graph  
- Runs list + statuses  
- Dashboard overview  

### **Phase 2 — Live Metadata Updates**
- Auto-detect changes to dbt artifacts  
- Background watcher reloads metadata  
- Frontend shows update indicators  
- In-memory versioning  

### **Phase 3 — dbt Execution Engine**
- Run dbt commands from UI  
- Real-time log streaming  
- Persist artifacts per run  

### **Phase 4 — Metadata Persistence Layer**
- PostgreSQL backend
- Historical model snapshots
- Model diff viewer
- Historical lineage browser

### **Phase 5 — Advanced Lineage (Complete)**
- Column-level lineage derived from manifest and catalog artifacts
- Grouping by schema, resource type, and tags with collapsible aggregates
- Interactive expand/collapse of subgraphs to simplify large projects
- Upstream and downstream impact highlighting at model and column granularity
- Configurable defaults for grouping mode, graph depth, and column-level loading

### **Phase 8 — Data Catalog Layer (New)**
- Global fuzzy/prefix search across models, sources, exposures, macros, tests, tags, and columns
- Rich entity detail pages with dbt metadata, owners, tags, documentation, lineage previews, and column statistics
- Test health indicators surfaced in search, detail pages, and validation reports
- Source freshness visibility (max loaded timestamp, age, thresholds, status, last check)
- Persistent metadata enrichment for owners/tags/descriptions with optional edit controls
- Column-level descriptions, data types, nullability, and statistics synced from `catalog.json`
- Validation of missing documentation, owners/tags, failing tests, freshness gaps, and stale sources

### **Phase 10 — Plugin Ecosystem (New)**
- Backend plugin manager with manifest validation, capability/permission checks, and lifecycle events
- Hot-reloadable plugins discovered from the configurable `PLUGINS_DIRECTORY` (default `./plugins`)
- Admin APIs to list, enable, disable, and reload plugins without restarting the server
- Frontend marketplace and installed-plugins views with dynamic enable/disable controls
- Standardized plugin layout (`/plugins/<name>/manifest.json`, `backend/`, `frontend/`, `static/`)
- Safe opt-out via `PLUGIN_SYSTEM_ENABLED=false` for minimal installations

---

## 🧪 Testing

### Backend
```bash
pytest
```

### Frontend
```bash
npm test
```

## 🔗 Lineage API

- `GET /lineage/graph?max_depth=` — model-level lineage with grouping metadata
- `GET /lineage/columns` — column-level lineage graph
- `GET /lineage/model/{unique_id}` — parents, children, and columns for a model
- `GET /lineage/upstream/{id}` / `GET /lineage/downstream/{id}` — impact highlighting for models or columns (via `column` query param)
- `GET /lineage/groups` — grouping metadata for schemas, resource types, and tags

Configuration flags (via environment variables or `/config` endpoint):

- `DEFAULT_GROUPING_MODE`
- `MAX_INITIAL_LINEAGE_DEPTH`
- `LOAD_COLUMN_LINEAGE_BY_DEFAULT`
- `LINEAGE_PERFORMANCE_MODE`

---

## 📚 Catalog API

- `GET /catalog/entities` — list all catalog entities with tags, owners, freshness, and test summaries
- `GET /catalog/entities/{unique_id}` — full detail including columns, tests, metadata overrides, and statistics
- `GET /catalog/search?q=` — fuzzy/prefix search grouped by resource type (models, sources, exposures, macros, tests, tags, columns)
- `GET /catalog/validation` — validation issues (missing docs/owners/tags, failing tests, stale or missing freshness)
- `PATCH /catalog/entities/{unique_id}` — apply metadata overrides (owner, tags, description) when edits are enabled
- `PATCH /catalog/entities/{unique_id}/columns/{column_name}` — update column-level overrides (description, owner, tags)

Configuration (env vars or `/config`):

- `ALLOW_METADATA_EDITS` — toggle editability of catalog metadata
- `SEARCH_INDEXING_FREQUENCY_SECONDS` — controls how often searches refresh from artifacts
- `FRESHNESS_THRESHOLD_OVERRIDE_MINUTES` — optional override for source freshness thresholds
- `VALIDATION_SEVERITY` — default severity for validation rules
- `STATISTICS_REFRESH_POLICY` — determines when column statistics refresh (default: `on_artifact_change`)

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
