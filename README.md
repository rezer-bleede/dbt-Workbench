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
├── docker-compose.yml     # Full stack orchestration
└── README.md
```

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
