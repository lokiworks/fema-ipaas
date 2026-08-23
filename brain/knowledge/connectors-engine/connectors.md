---
icon: 🧩
---

# Connectors

The metadata catalog of automation integrations ("connectors") — each a named integration like `@fema/connector-gmail` providing actions and triggers. Stored in `connector_metadata` and served from an in-memory `connectorCache` rebuilt from the DB on startup and refreshed via pub/sub.

### Entities & services
- `connector_metadata` (ConnectorMetadataEntity) — unique on `(name, version, platformId)`; `platformId` null = official, set = custom connector for that platform. `actions`/`triggers` are JSON maps (each may carry an optional `outputSchema`).
- `connectorMetadataService` — `list` / `getOrThrow` / `listVersions` / `create` / `delete` / `registry`; owns cache interactions.
- `connectorInstallService.installConnector` — saves archive, dispatches an `EXECUTE_METADATA` engine job to extract metadata, then stores it.
- `connectorSyncService.sync` — upserts official connectors from the bundled registry file.
- Routes under `/v1/connectors`: list, `:name` get, `:name/versions`, `POST /options` (dynamic dropdown eval on a worker), `POST /` (platformAdmin — install custom connector), `POST /sync`, `DELETE /:id`.

### Types
- **ConnectorType** — `OFFICIAL` (bundled) or `CUSTOM` (platform-installed).
- **PackageType** — `REGISTRY` (NPM) or `ARCHIVE` (uploaded tarball; `archiveId` FKs to `file`).
- **OutputSchema** — optional per-action/trigger structured render hint (`fields`, `itemLabel`); set by the connector author, consumed by the builder's Smart Output Viewer and data selector. Opt-in and non-breaking.

### Gotchas
- Available all editions; base listing + install is Community-level.
- EE/Cloud per-connector and per-action/trigger visibility flows through `resolveVisibility` (`ee/connectors/filters/connector-filtering-utils.ts`), which returns a `VisibilityPolicy` or `null` on CE / when `platformId`/`projectId` is nil (callers treat `null` as no filtering). The policy is derived from the project's **connector set** (via `project.connectorSetId`, falling back to the platform Default).
- Install and sync also enqueue a tool-search reindex, but only when `isToolSearchEnabled()`; no-op otherwise.
- `delete` removes all versions sharing the name on that platform, and only for `CUSTOM` connectors the caller owns.
- **A connector silently vanishes from the list when its `minimumSupportedRelease` is ahead of the root `package.json` version.** `fetchLatestConnectors` filters every connector through `isSupportedRelease(apVersionUtil.getCurrentRelease(), connector)`. Connectors are routinely merged targeting the *next* release, so on `main` a couple dozen are invisible locally until the version bump lands. No warning is logged — it just isn't there.
- **DynamicProperties clears its value before it knows the new schema, so the merge source must be a snapshot.** `DynamicPropertiesImplementation` re-fetches the child schema on every refresher change, clearing the form value synchronously and re-populating it in the mutation callback. The merge source for `getDefaultValueForProperties` has to be a `lastKnownValue` ref captured *before* the clear — reading `form.getValues()` in the callback sees the cleared `null` and defaults every child (GIT-1514). The snapshot must be spread-cloned: RHF `getValues(name)` hands back the live object and the clear's `setValue(...child, null)` mutates it in place. Guard the ref with `isNil` so it survives rapid successive changes, where later effect runs already observe `null`.
- `DynamicPropertiesContext` tracks loading by property name only, so two in-flight requests for the same property let the first completion clear the flag for both — briefly re-enabling Test Step while the value is still cleared.
- **The frontend `POST /v1/connectors/options` client only rejects for DYNAMIC.** `connectorsApi.options` (`packages/web/src/features/connectors/api/`) catches DROPDOWN failures, toasts, and *resolves* with a disabled-dropdown fallback — so for dropdowns every error path wired onto that mutation is dead: `useConnectorOptions`' `onError` handlers, its `retry: 1`, and the `if (error) throw error` into `DynamicPropertiesErrorBoundary`. DYNAMIC must rethrow: a swallowed failure arrives as a *successful* empty schema, which resets the property's children to defaults and gets persisted by step-settings autosave.
- **`FEMA_DEV_CONNECTORS` shadows the DB registry copy by name**, so a dev connector failing the release gate removes the connector *entirely* rather than falling back to the published version. Dropping the name from `FEMA_DEV_CONNECTORS` (or bumping the local root `package.json`) brings it back.

### Key files
Entry point: `connectorModule`, the Fastify plugin registered in `packages/server/api/src/app/app.ts` that mounts every `/v1/connectors` route.

- `packages/server/api/src/app/connectors/metadata/` — controller, service, TypeORM entity, and the pub/sub-invalidated `connector-cache.ts`
- `packages/server/api/src/app/connectors/` — `community-connector-module.ts` (POST `/v1/connectors` install), `connector-install-service.ts`, `connector-sync-service.ts`
- `packages/server/api/src/app/ee/connectors/filters/connector-filtering-utils.ts` — `resolveVisibility` and the EE/Cloud `VisibilityPolicy`
- `packages/web/src/features/connectors/api/` — frontend HTTP client
- `packages/web/src/features/connectors/hooks/` — React Query hooks for listing, connector model, options, and output schema
- `packages/web/src/features/connectors/components/` — `ConnectorIcon`, `ConnectorIconList`, `ConnectorSelectorSearch`, `InstallConnectorDialog`
- `packages/connectors/sdk/src/lib/output-schema.ts` — `OutputSchema` / `OutputSchemaField` / `FieldFormat` types

Paths verified 2026-07-17.
