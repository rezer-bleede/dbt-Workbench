# dbt-Workbench Plugin & Extensibility System (Phase 10)

This document specifies the functional and behavioral requirements of the dbt-Workbench plugin system. It defines what the system must support without prescribing implementation details. Another agent is responsible for designing and implementing the concrete backend, frontend, configuration, and infrastructure changes.

## Current Implementation Snapshot

The Phase 10 implementation includes a FastAPI-based `PluginManager` that validates manifests, enforces capability and permission declarations, hot-reloads plugin folders, and exposes administrative APIs at `/plugins`. A React marketplace experience surfaces installed plugins, capability requirements, and enable/disable toggles. Plugins are discovered under `PLUGINS_DIRECTORY` (default `./plugins`) following the standardized layout described below, and the system can be disabled entirely with `PLUGIN_SYSTEM_ENABLED=false`.

---

## 1. Goals and Scope

The plugin system must enable a modular ecosystem where external developers and internal teams can extend dbt-Workbench in a controlled way.

The system must:

- Allow plugins to extend all major areas of dbt-Workbench.
- Support discovery, installation, update, enablement, disablement, and removal of plugins.
- Support hot-reloading of plugins without restarting the core application.
- Enforce isolation, permissions, and safety guarantees.
- Provide marketplace-style browsing and management in the UI.
- Maintain backward compatibility and support a fully plugin-disabled mode.

The plugin system must not require any plugin to be present for core dbt-Workbench functionality to work.

---

## 2. Extensible Areas

The plugin system must allow extensions to modify or add functionality in all major areas of dbt-Workbench:

1. **UI Extensions**
   - Custom tabs in the main navigation.
   - New pages.
   - Widgets injected into existing pages.
   - New panels on model and source detail pages.
   - Extensions to the SQL workspace (e.g., templates, additional panels).
   - New dashboard widgets.
   - Lineage graph overlays, annotations, or visual enhancements.

2. **Backend/API Extensions**
   - New API endpoints.
   - New backend services and logic.
   - Metadata processors and enrichers.
   - Lineage transformations and overlays.
   - Extended model or column metadata fields.
   - Scheduler triggers and automation hooks.
   - Run post-processing handlers.
   - Controlled modifications to the catalog search index.

3. **Scheduling and Automation**
   - Plugin-defined scheduler triggers.
   - Plugin-defined automation hooks before and after scheduled runs.
   - Plugin-defined run post-processing.

4. **Metadata and Lineage**
   - Metadata processing and enrichment of dbt artifacts.
   - Lineage graph transformations, overlays, and annotations.
   - Controlled access to and extension of catalog and search metadata.

The system must ensure that plugins do not interfere with core features or with each other beyond what is explicitly allowed by the permissions model and extension points.

---

## 3. Plugin Packaging and Folder Structure

Plugins must follow a marketplace-style packaging layout under a dedicated plugins directory.

### 3.1 Standard Layout

Each plugin must live under a directory of the form:

- `/plugins/&lt;plugin-name&gt;/manifest.json`
- `/plugins/&lt;plugin-name&gt;/backend/`
- `/plugins/&lt;plugin-name&gt;/frontend/`
- `/plugins/&lt;plugin-name&gt;/static/` (optional)

Requirements:

- The manifest file must contain the plugin’s metadata and configuration required for discovery and loading.
- The `backend` folder must contain any backend-specific plugin resources.
- The `frontend` folder must contain any frontend-specific plugin resources.
- The optional `static` folder may contain assets (such as images) that can be referenced from the UI and marketplace.

### 3.2 Discoverability and Marketplace Metadata

The system must:

- Discover plugins by scanning the configured plugins directory.
- Treat any directory containing a valid `manifest.json` as a plugin candidate.
- Validate plugin manifests before the plugin can be listed or loaded.
- Provide sufficient metadata for displaying plugins in a “Plugin Marketplace” view.

The metadata for display must include:

- Name.
- Description.
- Author.
- Version.
- Capabilities required.
- Optional screenshots or visual assets.

---

## 4. Plugin Metadata and Manifest

Each plugin must declare the following in its manifest or equivalent metadata:

- **Identification**
  - Name.
  - Version.
  - Description.
  - Author information (for marketplace display).

- **Capabilities and Permissions**
  - Capabilities required by the plugin (see section 9).
  - Permissions required to interact with dbt-Workbench subsystems.

- **Entrypoints**
  - Backend entrypoints used to register routes, services, hooks, and processors.
  - Frontend entrypoints used to register components, pages, and overlays.

- **Compatibility**
  - Required dbt-Workbench version range.
  - Plugin API version.
  - Dependencies on other plugins, including any minimum versions.

The system must validate plugin configurations before loading, including:

- Required fields presence.
- Compatibility information format.
- Declared capabilities and permissions.

Plugins whose configuration fails validation must not be activated.

---

## 5. Backend Plugin API (Functional Specification)

The backend must expose a structured plugin API that provides controlled extension points.

Plugins must be able to:

1. **Register Backend API Endpoints**
   - Register new API endpoints that are exposed via the existing backend API layer.
   - These endpoints must only be active while the plugin is enabled.
   - When a plugin is disabled or removed, its endpoints must no longer be available.

2. **Add Metadata Processors or Enrichers**
   - Register processors that can read and enrich metadata derived from dbt artifacts and catalogs.
   - Processors may add or modify extended fields, subject to permissions and validation.

3. **Add Lineage Transformations or Overlays**
   - Register lineage transformations that adjust or decorate the lineage graph representation.
   - Register lineage overlays that can add additional edges, nodes, or annotations.
   - Transformations and overlays must not permanently alter underlying stored artifacts.

4. **Extend Model or Column Metadata Fields**
   - Declare additional metadata fields for models, sources, columns, or other dbt entities.
   - Provide default values or derivation logic for those extended fields.
   - Ensure that extended fields are clearly associated with the originating plugin.

5. **Scheduler and Automation Hooks**
   - Add scheduler triggers that can initiate runs or other automated tasks.
   - Register pre- and post-hooks related to scheduled runs.
   - Add run post-processing handlers that execute after dbt runs or schedules complete.

6. **Catalog Search Index Extensions**
   - Safely modify or extend the search index for catalog entities.
   - Extensions must be strictly controlled; unauthorized changes must be rejected.
   - All changes must respect the plugin’s permissions and must be reversible upon plugin disablement.

7. **Artifact Lifecycle Events**
   - Attach logic to dbt artifact lifecycle events:
     - `on-artifact-load`.
     - `on-run-complete`.
     - `on-lineage-build`.

The backend plugin API must ensure:

- Plugins cannot perform operations for which they do not have explicit permissions.
- Plugins are loaded and executed in a controlled context.
- Backend extensions can be enabled, disabled, or hot-reloaded without restarting the entire backend service.

---

## 6. Frontend Plugin API (Functional Specification)

The frontend must support UI plugins capable of extending the user interface dynamically.

UI plugins must be able to:

1. **Navigation and Pages**
   - Add new tabs to the main navigation.
   - Add new pages accessible from navigation or other UI entrypoints.

2. **In-Page Widgets**
   - Inject widgets into existing pages (e.g., dashboards, model detail, run views).
   - Add new panels to model or source detail pages.

3. **Lineage Graph Extensions**
   - Extend the lineage graph with overlays, annotations, or custom visualization layers.
   - Contribute custom behaviors for nodes or edges, subject to permissions and safety rules.

4. **SQL Workspace Extensions**
   - Extend the SQL workspace by:
     - Providing SQL templates.
     - Contributing additional panels (e.g., result visualizations).
     - Providing extra controls or metadata panes.

5. **Dashboard Widgets**
   - Introduce new dashboard widgets that surface plugin-specific metrics or insights.

Functional requirements:

- The UI must render plugin components dynamically, based on installed and enabled plugins.
- When a plugin is disabled or removed, its UI elements must be removed or hidden without impacting the core UI.
- UI plugins must respect per-workspace enablement (see section 11).

---

## 7. Plugin Discovery, Listing, and Marketplace

The system must include a marketplace-style experience for managing plugins.

### 7.1 Discovery and Listing

- Discover all plugins from the configured plugins directory.
- Validate each plugin’s manifest and configuration.
- Make only validated plugins available for listing in the admin and marketplace views.
- Provide a structured representation of:
  - Installed plugins.
  - Available (but not yet installed) plugins, if external catalogs or registries are supported in the future.

### 7.2 Marketplace UI

The frontend must provide:

- An **Installed Plugins** page showing:
  - Name.
  - Description.
  - Author.
  - Version.
  - Capabilities required.
  - Current status (enabled/disabled).
  - Compatibility information and warnings.
  - Any active errors or diagnostic information.

- A **Plugin Marketplace** browser showing:
  - Installable plugins and their metadata (as above).
  - Optional screenshots or visual assets.
  - Install, enable, disable, update, and remove actions, subject to admin permissions.

Marketplace behavior must include:

- Displaying error and compatibility warnings, including:
  - Incompatible dbt-Workbench version.
  - Conflicts with other installed plugins.
  - Missing or unapproved capabilities.

---

## 8. Plugin Lifecycle and Hot-Reloading

### 8.1 Lifecycle Events

The system must implement the following lifecycle events, which plugins can subscribe to:

- `on-plugin-load`.
- `on-plugin-unload`.
- `on-plugin-update`.
- `on-artifact-load` (post Phase 2).
- `on-lineage-build` (post Phase 5).
- `on-catalog-refresh` (post Phase 8).
- `on-schedule-run-start`.
- `on-schedule-run-complete`.

Requirements:

- Events must be delivered in order for each plugin.
- Multiple plugins may subscribe to the same event.
- Failures in one plugin’s event handler must not prevent other handlers from running, but must be tracked and reported.

### 8.2 Hot-Reloading

The system must support hot-reloading of plugins without restarting the entire application.

Hot-reload must:

- Watch plugin folders for changes.
- Detect when plugin manifests, backend resources, or frontend resources change.
- Reload plugin metadata and UI registration.
- Re-register backend routes and extension points.
- Refresh lineage overlays and metadata enrichers.
- Not interrupt running dbt processes.
- Only reload modified plugins, not all plugins.

Hot-reload failures must:

- Be reported clearly in logs.
- Be surfaced in the admin UI and/or plugin diagnostics view.
- Not leave the system in a partially updated or inconsistent state for that plugin.

---

## 9. Plugin Permissions and Capabilities Model

Each plugin must declare required capabilities. These capabilities must be used to gate access to sensitive functionality.

### 9.1 Capabilities

Supported capabilities include, at a minimum:

- `read-metadata`:
  - Read metadata and artifacts.
- `write-metadata`:
  - Modify or extend metadata in permitted ways.
- `extend-api`:
  - Register new API endpoints.
- `modify-lineage`:
  - Apply transformations or overlays to lineage.
- `access-sql-workspace`:
  - Interact with the SQL workspace and associated data.
- `register-schedule-hooks`:
  - Register scheduler triggers and hooks.
- `access-environment-config`:
  - Access controlled environment configuration data.

### 9.2 Permissions Flow

- Plugins must declare their required capabilities in their manifest.
- During installation (or first activation), admins must review and approve these capabilities.
- If the declared capabilities cannot be approved (for policy or configuration reasons), the plugin must fail to load.
- If a plugin attempts to perform an action outside its approved capabilities:
  - The action must be rejected.
  - The rejection must be logged.
  - The event should be surfaced in diagnostics for inspection.

Unauthorized or unapproved plugins must fail to load and must be presented in the UI as inactive with clear error details.

---

## 10. Plugin Management (Enable/Disable, Install/Update/Remove)

Admins must be able to manage plugins through backend APIs and corresponding UI.

### 10.1 Enable/Disable

Admins must be able to:

- Enable plugins that are installed and compatible.
- Disable plugins at any time.

When a plugin is disabled:

- Its backend routes and services must be deregistered and become inactive.
- Its UI components (tabs, pages, widgets, overlays) must no longer be rendered.
- Its metadata hooks and lifecycle subscriptions must no longer be invoked.
- Any plugin-specific scheduled tasks must be stopped or skipped.
- The plugin’s configuration may remain persisted, but it must not have runtime effects.

### 10.2 Install and Remove

Admins must be able to:

- Install plugins into the plugins directory (e.g., by uploading or referencing packages, or by adding them to the directory in a supported way).
- Remove plugins safely, including:
  - Deregistering all extension points.
  - Removing plugin-specific persistent configuration where applicable.
  - Ensuring the removal does not compromise core system stability.

Removal must:

- Be disallowed while critical plugin operations are in-flight where such conflicts are detectable.
- Be transparent in logs and admin UI.

### 10.3 Update

Admins must be able to:

- Update plugins to newer versions.
- View version and compatibility details before updating.
- Review any changes in required capabilities between versions (e.g., new permissions).

Before activating an updated plugin:

- The system must validate the new version’s manifest and compatibility.
- Any new capabilities must be re-approved by admins.
- Conflicts must be reported and must prevent activation until resolved.

---

## 11. Configuration Model

The plugin system must support configuration at several levels.

### 11.1 Global Plugin Configuration

- There must be global configuration settings that define:
  - Whether the plugin system is enabled at all.
  - The location of the plugins directory.
  - Default policies for plugin permissions and capabilities.
  - Constraints related to sandboxing and resource limits.

### 11.2 Per-Plugin Configuration

- Each plugin may define its own configuration options.
- Admins must be able to set and override per-plugin configuration values.
- Configuration changes must be applied without requiring a full system restart, subject to plugin hot-reload behavior.

### 11.3 Per-Workspace Enablement (Phase 9 Integration)

- The system must support enabling or disabling plugins per workspace.
- A plugin may be:
  - Enabled globally.
  - Enabled only for specific workspaces.
  - Disabled for specific workspaces even if enabled globally.

Per-workspace rules must be respected in:

- Backend hooks and extension points.
- UI presentation (e.g., workspace-specific pages and widgets).
- Access to workspace-specific data and artifacts.

Plugins must not access unauthorized project workspaces, consistent with the multi-project and RBAC model from Phase 9.

---

## 12. Sandbox and Safety Rules

The plugin system must enforce sandboxing to ensure safety and isolation.

### 12.1 Isolation Between Plugins

- Plugin runtime environments must be isolated so that:
  - One plugin cannot directly modify or break another plugin’s state.
  - Failures in one plugin do not destabilize other plugins or the core system, beyond clearly controlled failure modes.

### 12.2 Capability-Based Permissions

- All sensitive operations must be guarded by the capabilities defined in section 9.
- Plugins must not perform actions for which they do not have explicit permissions.
- Any attempt to exceed permissions must be blocked and logged.

### 12.3 Resource and Operation Limits

- The system must enforce limits on long-running operations initiated by plugins.
- Plugins must not be allowed to:
  - Block core system operations indefinitely.
  - Consume unbounded resources (within what is reasonably enforceable in the implementation environment).

### 12.4 Environment and Filesystem Access

- Access to environment variables must be controlled and limited to what the plugin is explicitly allowed to see or use.
- Filesystem access must be restricted where appropriate:
  - Plugins must not read or write arbitrary files outside permitted directories.
  - Plugins must not access unauthorized project workspaces or artifact directories.

---

## 13. Version Compatibility and Conflicts

The system must validate version compatibility before activating plugins.

### 13.1 Compatibility Checks

For each plugin, the system must validate:

- **dbt-Workbench Version Compatibility**
  - The plugin declares the range of dbt-Workbench versions it supports.
  - The current instance must fall within that range.

- **Plugin API Version**
  - The plugin declares the plugin API version it targets.
  - Only supported API versions may be loaded.

- **Dependencies on Other Plugins**
  - If the plugin declares dependencies on other plugins:
    - Required versions of those plugins must be installed and active.
    - Conflicts (such as incompatible version ranges) must be detected.

### 13.2 Conflict Handling

- If any compatibility check fails, the plugin must not be activated.
- Conflicts must be reported:
  - To administrators via the admin/marketplace UI.
  - In logs for diagnostics.

The system must never partially activate a plugin whose compatibility validation has failed.

---

## 14. Logging and Diagnostics

The plugin system must produce logs and diagnostics to support observability and troubleshooting.

At a minimum, logs must include:

- Plugin load events.
- Plugin unload events.
- Plugin update events.
- Plugin warnings and errors.
- Rejected plugin actions due to permissions or capability violations.
- Hot-reload successes and failures.
- Significant performance impacts attributable to plugins, where measurable.

An admin-facing diagnostics view must:

- Surface per-plugin status, including:
  - Last load time.
  - Last update time.
  - Any errors during initialization, event handling, or hot-reload.
- Surface details of rejected actions (e.g., attempts to exceed permissions).
- Surface performance-related warnings or metrics where available.

---

## 15. Backwards Compatibility and Plugin-Disabled Mode

The plugin system must be strictly additive and must not change core behavior unless plugins explicitly extend it.

Requirements:

- All existing dbt-Workbench features must continue to function with **no plugins installed**.
- When the plugin system is present but no plugins are enabled:
  - The system must behave as it did before the plugin system was introduced.
  - No plugin-specific UI or API elements must be active.
- The system must support a **plugin-disabled mode**, where:
  - Plugin discovery, loading, and execution are fully disabled.
  - Core dbt-Workbench behavior remains intact.
  - Existing environment configuration and security guarantees remain unchanged.

In all modes, the core application must remain stable and fully functional, regardless of plugin presence or absence.

---

## 16. Summary of Required Capabilities

The plugin system must provide:

- A standardized plugin packaging format and directory structure.
- Backend and frontend extension points covering:
  - UI.
  - Backend APIs and services.
  - Metadata processors.
  - Lineage enhancements.
  - SQL workspace extensions.
  - Scheduling and automation.
- A manifest-driven permissions and capabilities model with admin approval.
- Lifecycle events and hook mechanisms for artifacts, lineage, catalog, and scheduler runs.
- Hot-reloading of individual plugins without restarting the core application.
- Marketplace-style UI for browsing, installing, enabling, disabling, updating, and diagnosing plugins.
- Strong isolation, sandboxing, and compatibility checking.
- Full backwards compatibility and a plugin-disabled mode.

This specification is complete for functional and behavioral requirements of Phase 10 and is intended to guide subsequent detailed design and implementation work.