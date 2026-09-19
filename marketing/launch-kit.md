# Launch Kit

These drafts are starting points. Verify the current release, links, and behavior before publishing.

## Hacker News: Show HN

**Title:** Show HN: dbt-Workbench - an open-source, self-hosted UI for dbt lineage and operations

**Body:**

dbt-Workbench is an MIT-licensed, self-hosted dbt control plane for teams that need lineage,
catalog, run orchestration, scheduling, SQL exploration, and documentation workflows inside their
own infrastructure. It includes a Docker demo project so people can try the workflow without
connecting a production warehouse.

The project is aimed at teams that have outgrown static `dbt docs`, need an operational UI around
dbt Core, or work in local, on-prem, or air-gapped environments. The main tradeoff is that adopters
operate the deployment themselves; the architecture, roadmap, and production-readiness checklist
are public.

Try it: https://github.com/rezer-bleede/dbt-Workbench

Feedback requested: installation friction, adapter coverage, security requirements, and which dbt
workflow should be prioritized next.

## Product Hunt description

**One-liner:** A self-hosted, open-source control plane for dbt lineage, runs, catalog, and docs.

**Maker comment:**

dbt-Workbench is for data teams that want a usable dbt UI while keeping projects, artifacts, and
execution inside their own infrastructure. Start with Docker, explore the bundled project, then
evaluate RBAC, scheduling, lineage, and air-gapped deployment for your environment.

Ask visitors for feedback and evaluation reports. Do not ask directly for upvotes.

## Community post

Static dbt docs are useful, but operating a dbt project also means reviewing run history, finding
upstream impact, inspecting artifacts, and coordinating access. I put together dbt-Workbench, an
open-source self-hosted UI for those workflows. The demo runs locally with Docker and includes a
sample project. I would especially value feedback from teams with private-network or air-gapped
deployment requirements.

## Release post template

We released dbt-Workbench `VERSION` with `OUTCOME`. The workflow to try is `WORKFLOW`: start with
`LINK`. This release changes `DETAIL`, and the known limitation is `LIMITATION`. Feedback and issues
are welcome in the repository.
