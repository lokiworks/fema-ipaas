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

### 分享与权限（§4.13、§7.3）
- **连接权限** —— 所有者 / 可编辑 / 可使用。来源三处，取最强的一个：`ownerId`、`connection_share` 行（USE / EDIT）、`connection.projectMembersPermission`（可用项目的成员默认得到的权限，可为空）。判断逻辑只有一份：shared 的 `connectionAccessUtils.resolvePermission`。
- **全部项目** —— `scope = TENANT` 且 `preSelectForNewProjects = true`，此时不看 `projectIds`，以后新建的项目也可用；只有租户管理员能设。旧的「全局连接」（TENANT + 显式 `projectIds`）仍只在列出的项目里可用。
- **节点能选的连接** = 分享给我 ∩ 在本项目可用：`GET /v1/connections?projectId=` 对用户只返回可见的连接，`workflowVersionService.applyOperation` 拒绝把编辑者不能用的连接**新**写进步骤。
- 跨项目页面走租户级接口：`GET /v1/connections/accessible`、`GET /:id/detail`（含被引用的工作流、MCP 服务固定连接、环境连接替换、分享成员）、`POST/DELETE /:id/shares[/:userId]`、`POST /:id/access`、`POST /:id/access-impact`（缩小范围前算出会失去连接的工作流）。分享变更写审计 `connection.share.updated`。

### Endpoints
`POST /v1/connections` (upsert, validates via worker EXECUTE_VALIDATION), `POST /:id` (update meta), `GET` (filters), `GET /owners`, `POST /replace`, `DELETE /:id`, `POST /oauth2/authorization-url` (optional scope subset).

### Gotchas
- Deleting a PLATFORM-scope connection via the project route is rejected `403` — delete those via platform admin `DELETE /v1/global-connections/:id`.
- Replace: platform/global connections can be the source, but `deleteSourceConnection` on a platform source → `403`; deleting a project source while a published version still references it → `409`. Draft versions always updated; published only when requested.
- Deleting a connection does NOT cascade to workflows; they fail at runtime with a validation error.
- Global (platform-scope) connections require `globalConnectionsEnabled`; bulk-delete in the project UI skips them client-side.
- `FEMA_ENFORCE_CONNECTION_CONNECTOR_BINDING` (default `false`) makes a step resolve only connections whose `connectorName` equals the step's own connector; a mismatch raises a USER-level `ConnectionConnectorMismatchError`. The check lives in the **engine's** `connection-resolver`, not the worker endpoint. Set the var on the **app** container — the engine cannot read `process.env` (sandbox env is an allowlist), so the flag rides `WorkerSettings` → `SandboxSettings` → sandbox env, the same path as `FEMA_DEV_CONNECTORS`. Code / loop / router steps have no connector, so a missing name is a denial — they lose connection access entirely, and enabling the flag breaks workflows that feed a connection into custom JS.
- `metadata.accountIdentifier` (the "which account is this" label) must be **rewritten on every upsert, never left untouched** — `spreadIfDefined` omits the column and TypeORM `upsert(connection, ['id'])` then leaves the old value in place, so a reconnect that fails to resolve would keep labelling the connection with an account it no longer authenticates as. `mergeConnectionMetadata` also strips the key from caller-supplied `metadata`, because `metadata` is a caller-owned jsonb bag: without that, any `WRITE_CONNECTION` holder can forge the label. Note `POST /:id` (update) still replaces the whole bag.

- **迁移要给存量连接回填 `projectMembersPermission = 'EDIT'`。** 引入分享之前项目成员都能用、能改项目里的连接；不回填的话升级后除所有者外所有人都看不到存量连接，工作流编辑时换不了步骤。新建的连接默认是空（只有所有者和被分享的人）。
- **`POST /:id`、`/:id/revalidate`、`DELETE /:id` 现在是租户级路由。** 以前靠 `ProjectResourceType.TABLE` 取 `projectIds[0]` 判项目权限，多项目连接、全部项目连接（`projectIds` 为空）会被误拒；现在按连接权限判：改名要可编辑，测试要能使用，删除只有所有者。
- **重新授权不改所有者、不改可用范围。** `upsert` 命中已有连接时沿用原 `ownerId`、`projectIds`、`scope`；以前可编辑成员重新授权会顺手把自己变成所有者，并把多项目连接缩成当前项目。
- **引用判断只看新增的连接。** `applyOperation` 比较操作前后的 `connectionIds`，只校验新出现的；别人配置好的步骤照样能改其他字段。`USE_AS_DRAFT`（回滚草稿）不校验。
- **`externalId` 在租户内不唯一。** 两个项目可以有同名 externalId 的连接，所以按 externalId 找连接时一定要再按项目可用性过滤（`connectionAvailability.whereAvailableIn`），不能只按租户找。
- **自托管下 OAuth2 授权码流程走不通。** 回调地址来自 flag `THIRD_PARTY_AUTH_PROVIDER_REDIRECT_URL`，`flag.service.ts` 里写死为 `null`，连接弹窗显示并发给对方的是 `no_redirect_url_found`。前端 `/redirect` 路由其实在。连接器开发的认证测试和 MCP 服务器表单用的是同一个 flag。
- **没有租户级 OAuth 应用。** `CLOUD_OAUTH2` 一律抛 `INVALID_CLOUD_CLAIM`，`TENANT_OAUTH2` 的实现没有注入（`setTenantOAuthService` 无调用方），前端 `useConnectorsOAuth2AppsMap` 返回空对象，所以每个人都得在连接弹窗里自己填 Client ID 和 Secret。国产系统（飞书、北森）目前走 `CustomAuth` 填自建应用的 App ID 和 Secret，不受这条影响。

### Key files
Entry point: `connectionService`, exported from the connection service and reached through `connectionModule`, registered in `packages/server/api/src/app/app.ts`.

- `packages/server/api/src/app/connection/` — backend module: controllers (project, platform, worker, share), entity, module wiring, and the `connection-service/` folder holding the service, handler, and OAuth2 handlers; `connectionAccessService` (permissions), `connectionShareService` (accessible list, detail, shares, access), `connectionReferenceService` (references)
- `packages/core/shared/src/lib/automation/connection/connection-share.ts` — `connectionAccessUtils`, share DTOs
- `packages/server/api/src/app/core/security/oidc/` — OIDC provider: key manager, token controller, discovery controller, module
- `packages/core/shared/src/lib/automation/connection/` — shared types, enums, value unions, and the upsert/read DTOs under `dto/`
- `packages/web/src/features/connections/` — frontend slice: `api/` clients, `hooks/` TanStack Query hooks, `components/` global and rename dialogs, `utils/` OAuth2 redirect and name-uniqueness helpers
- `packages/web/src/app/connections/` — connection dialogs and per-auth-type form settings (new, create/edit, replace, reconnect, OIDC, OAuth2, custom, basic, secret text)
- `packages/web/src/app/routes/connections/` — project connections list page
- `packages/web/src/app/routes/platform/setup/connections/` — platform-wide global connections page

Paths verified 2026-07-17.
