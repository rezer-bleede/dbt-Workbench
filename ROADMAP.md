# Roadmap — dbt-Workbench

This document tracks the future development milestones of dbt-Workbench.

---

## Phase 1 — Core UI + Artifact Viewer (MVP)  
- FastAPI backend for serving dbt metadata  
- React + Tailwind UI  
- Model list + detail view  
- Basic lineage graph  
- Runs viewer  
- Dashboard  

---

## Phase 2 — Live Metadata Updates
- Auto-refresh when artifacts change  
- Backend watcher for JSON updates  
- Versioning of loaded artifacts  

---

## Phase 3 — dbt Execution Engine
- API to execute dbt commands  
- Live logs (WebSockets / SSE)  
- Run status page  
- Auto-ingest artifacts after run  

---

## Phase 4 — Metadata Persistence Layer
- PostgreSQL backend for model/run storage  
- Model history + diffs  
- Historical lineage visualization  

---

## Phase 5 — Advanced Lineage
- Column-level lineage  
- Schema/tag grouping  
- Impact analysis  
- Collapsible DAG sections  

---

## Phase 6 — Scheduler
- Cron-style scheduled runs  
- Notifications  
- Environment-specific configs  

---

## Phase 7 — SQL Workspace
- SQL editor with autocomplete  
- Query execution through backend  
- Profiling + statistics  

---

## Phase 8 — Data Catalog
- Global search  
- Ownership + tags  
- Column descriptions  
- Test results overview  
- Source freshness UI  

---

## Phase 9 — RBAC + Multi-Project
- JWT-based auth  
- Multiple dbt projects  
- Independent workspaces  

---

## Phase 10 — Plugin System
- Extend backend / UI  
- Graph overlays  
- Custom metadata processors  

---

## Long-Term Vision
- Distributed runner  
- CI ingestion API  
- Air-gapped enterprise mode  

