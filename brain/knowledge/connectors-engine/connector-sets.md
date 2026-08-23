---
icon: 🗂️
---

# Connector Sets

A named, reusable connector/action/trigger visibility configuration a platform admin defines once and assigns to many projects. Visibility is **derived at read time** — nothing is written when a new connector or action is installed.

### Model
- **ConnectorSetConfig** — `{ connectors: ConnectorSelection, selectedActions: Record<connector, action[]>, selectedTriggers: Record<connector, trigger[]> }`.
- **ConnectorSelection** — `{ mode: 'include_all' | 'exclude_all', exceptions: string[] }`. `include_all` = everything present and future except exceptions (auto-includes new connectors); `exclude_all` = only exceptions, hiding future connectors.
- **Selected components** — a connector key present in `selectedActions`/`selectedTriggers` means "curated": only listed components visible, new ones stay hidden. Absent key = all visible incl. future.
- **Default Set** — one per platform (`isDefault`, `key: 'default'`); unassigned projects resolve to it. Can't be deleted; projects reassign to it rather than being removed.
- Shared pure resolvers `isConnectorVisible` / `isComponentVisible` live in `core/shared/.../ee/connector-set/` (used by both server and web).

### Entities & services
- `connector_set` entity — `platformId` (CASCADE), `name`, `key` (embed handle, unique per platform, auto `kebabCase(name)-<random>`), `isDefault` (partial unique index), `config` jsonb. Projects reference it via `project.connectorSetId` (FK SET NULL).
- `connectorSetService` — CRUD + `getOrCreateDefaultConnectorSet` (distributed lock), `duplicate`, `assignProject(s)` / `removeProjectAssignment`. `update` runs `connectorSetConfig.applyUpdate` (declarative merge, never touches unreferenced component keys).
- Routes `/v1/connector-sets` (platformAdminOnly). Update uses **ComponentIntent**: `{ mode: 'all' }` resets a connector to all; `{ mode: 'selected', selected }` sets the allow-list (empty array = hide all).

### Gotchas
- EE/Cloud only, gated behind `platform.plan.manageConnectorsEnabled`. On CE / flag off, connector sets are inert and filtering falls back to legacy project-plan allow/block lists.
- The **whole** `/v1/connector-sets` module is behind that flag, `GET` included — so on a locked plan the web list query is `enabled: false`, the table is simply empty, and row actions never render. Only toolbar/entry points need a UI guard. The `LockedAlert` + `RequestTrial featureKey="ENTERPRISE_CONNECTORS"` lives once on `PlatformConnectorsPage`, above the tabs, since the same flag gates both the Connectors and Connector Sets tabs; the details route redirects back to the tab rather than hanging on a spinner waiting for a query that will never run.
- There is **no** install-time sync and no `onConnectorCreated` hook — resolution is purely read-time. See ADR 0001 (visibility derived, not materialized).
- Embed auth: a v4 JWT carries a `connectorSet` key claim; legacy v2/v3 tokens carry `connectorsTags` (only the first tag honored, resolved to `key = tag`, else Default). Enforcement (`applyProjectConnectorAccess`) runs unconditionally, not gated by the flag.
- Migration is three ordered steps: create table + backfill (`1807...`), then `CREATE INDEX CONCURRENTLY` (`1808...`, non-transactional), then the breaking drop of legacy platform connector-filter columns (`1809...`). Legacy `tag`/`connector_tag` tables are kept only because the backfill reads them once via raw SQL.

### Key files
Entry point: `connectorSetService`, defined in `connector-set.service.ts` and wired to the `/v1/connector-sets` routes by `connector-set.controller.ts`.

- `packages/server/api/src/app/ee/connectors/connector-set/` — entity, service, controller, module, and the `applyUpdate` config merge
- `packages/core/shared/src/lib/ee/connector-set/` — shared models, request DTOs, and the pure `isConnectorVisible` / `isComponentVisible` resolvers
- `packages/server/api/src/app/ee/connectors/filters/connector-filtering-utils.ts` — applies the resolved set when filtering connectors and components
- `packages/server/api/src/app/ee/managed-authn/managed-authn-service.ts` — embed token enforcement via `applyProjectConnectorAccess`
- `packages/server/api/src/app/ee/projects/ee-project-hooks.ts` — assigns the Default set on project `postCreate`
- `packages/web/src/features/connector-sets/` — client api and hooks
- `packages/web/src/app/routes/platform/setup/connectors/connector-sets/` — management UI, tabs and dialogs
- `brain/decisions/000007-connector-set-visibility-is-derived-at-read-time.md` — why visibility is derived rather than materialized

Paths verified 2026-07-17.
