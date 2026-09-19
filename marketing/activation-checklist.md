# Activation Checklist

Use this before announcing the project. The goal is a measurable first-run experience, not just a
successful documentation build.

## Clean-machine test

- [ ] Clone the repository from a fresh working directory.
- [ ] Confirm Docker and Docker Compose prerequisites are documented.
- [ ] Run `docker compose up --build`.
- [ ] Open the UI at `http://localhost:3000`.
- [ ] Open API docs at `http://localhost:8000/docs`.
- [ ] Run the bundled demo project.
- [ ] Inspect lineage and catalog metadata.
- [ ] Review run logs and run history.
- [ ] Stop and restart the stack without losing expected state.

## Evaluation test

- [ ] Test authentication and each RBAC role.
- [ ] Configure a scheduled run and verify its timezone behavior.
- [ ] Mount or ingest representative artifacts.
- [ ] Follow the air-gapped or restricted-network guide if applicable.
- [ ] Record adapter, database, browser, and deployment details.
- [ ] File every blocker as a reproducible GitHub issue.

## Funnel instrumentation

- [ ] Configure `GA4_ID` if analytics consent and policy allow it.
- [ ] Verify GitHub CTA UTM parameters in rendered links.
- [ ] Record documentation visits, GitHub outbound CTR, clones, stars, issues, and discussions.
- [ ] Add an activation event when a user completes the Docker quickstart, if product analytics are introduced.
- [ ] Review the baseline before setting a 90-day target.

## Exit criteria

The activation path is ready for promotion when a new evaluator can complete the clean-machine test
without maintainer intervention and the team can explain every remaining limitation.
