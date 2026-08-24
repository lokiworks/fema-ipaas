---
icon: 🔗
---

# App Connections

Encrypted credential records (OAuth2 tokens, API keys, basic/custom auth, OIDC props) that workflow steps use to call external services. Support automatic OAuth2 refresh with distributed locking, a project-or-platform scope model, and a project-scoped "replace" that rewires workflow references from one connection to another.

### Entity
`Connection`: id, displayName, externalId (stable ref in workflow settings, survives rename), type, status (ACTIVE/EXPIRED/ERROR), value (encrypted AES-256), platformId, connectorName/Version, projectIds[], scope (PROJECT/PLATFORM), preSelectForNewProjects.

### Connection types (8)
`OAUTH2`, `CLOUD_OAUTH2` (exchanged via `secrets.fema.local`), `PLATFORM_OAUTH2` (platform-managed OAuth app), `SECRET_TEXT`, `BASIC_AUTH`, `CUSTOM_AUTH` (opt-in refresh callback), `NO_AUTH`, `OIDC`.

### How it works
- **OAuth2 auto-refresh** on retrieval: `lockAndRefreshConnection()` refreshes 15 min early; acquires Redis lock keyed `${platformId}_${externalId}` (60s) so projects sharing a connection serialize; re-encrypts tokens; sets status ERROR on invalid refresh. API responses always strip `refresh_token` + `client_secret`.
- **Custom-auth refresh**: connector defines a `refresh.generate` callback; `token_refresh_at = now + expiresIn - min(15min, expiresIn/2)`; dispatched via `EXECUTE_TOKEN_REFRESH` worker job. Support cached in `connectorRefreshSupportCache` (LRU 500, 5-min TTL). Timeout keeps old creds (no ERROR); engine error → ERROR.
- **OIDC**: FEMA acts as an OIDC identity provider so connectors get short-lived cloud creds (e.g. AWS `AssumeRoleWithWebIdentity`). Engine calls `POST /api/v1/worker/oidc-token` with `{audience, expiresInSeconds?}` → RS256 JWT `sub: platform:{id}:project:{id}`, TTL default/cap 1h. Public discovery: `/.well-known/openid-configuration` + `/jwks.json`; `kid` is an RFC 7638 SHA-256 thumbprint. Signing key auto-generated + persisted (encrypted) to the shared `flag` table with first-writer-wins (`INSERT ... ON CONFLICT DO NOTHING`), no env var needed.

### Endpoints
`POST /v1/connections` (upsert, validates via worker EXECUTE_VALIDATION), `POST /:id` (update meta), `GET` (filters), `GET /owners`, `POST /replace`, `DELETE /:id`, `POST /oauth2/authorization-url` (optional scope subset).

### Gotchas
- Deleting a PLATFORM-scope connection via the project route is rejected `403` — delete those via platform admin `DELETE /v1/global-connections/:id`.
- Replace: platform/global connections can be the source, but `deleteSourceConnection` on a platform source → `403`; deleting a project source while a published version still references it → `409`. Draft versions always updated; published only when requested.
- Deleting a connection does NOT cascade to workflows; they fail at runtime with a validation error.
- Global (platform-scope) connections require `globalConnectionsEnabled`; bulk-delete in the project UI skips them client-side.
- `FEMA_ENFORCE_CONNECTION_CONNECTOR_BINDING` (default `false`) makes a step resolve only connections whose `connectorName` equals the step's own connector; a mismatch raises a USER-level `ConnectionConnectorMismatchError`. The check lives in the **engine's** `connection-resolver`, not the worker endpoint. Set the var on the **app** container — the engine cannot read `process.env` (sandbox env is an allowlist), so the flag rides `WorkerSettings` → `SandboxSettings` → sandbox env, the same path as `FEMA_DEV_CONNECTORS`. Code / loop / router steps have no connector, so a missing name is a denial — they lose connection access entirely, and enabling the flag breaks workflows that feed a connection into custom JS.
- `metadata.accountIdentifier` (the "which account is this" label) must be **rewritten on every upsert, never left untouched** — `spreadIfDefined` omits the column and TypeORM `upsert(connection, ['id'])` then leaves the old value in place, so a reconnect that fails to resolve would keep labelling the connection with an account it no longer authenticates as. `mergeConnectionMetadata` also strips the key from caller-supplied `metadata`, because `metadata` is a caller-owned jsonb bag: without that, any `WRITE_CONNECTION` holder can forge the label. Note `POST /:id` (update) still replaces the whole bag.

### Key files
Entry point: `connectionService`, exported from the connection service and reached through `connectionModule`, registered in `packages/server/api/src/app/app.ts`.

- `packages/server/api/src/app/connection/` — backend module: controllers (project, platform, worker), entity, module wiring, and the `connection-service/` folder holding the service, handler, and OAuth2 handlers
- `packages/server/api/src/app/core/security/oidc/` — OIDC provider: key manager, token controller, discovery controller, module
- `packages/core/shared/src/lib/automation/connection/` — shared types, enums, value unions, and the upsert/read DTOs under `dto/`
- `packages/web/src/features/connections/` — frontend slice: `api/` clients, `hooks/` TanStack Query hooks, `components/` global and rename dialogs, `utils/` OAuth2 redirect and name-uniqueness helpers
- `packages/web/src/app/connections/` — connection dialogs and per-auth-type form settings (new, create/edit, replace, reconnect, OIDC, OAuth2, custom, basic, secret text)
- `packages/web/src/app/routes/connections/` — project connections list page
- `packages/web/src/app/routes/platform/setup/connections/` — platform-wide global connections page

Paths verified 2026-07-17.
