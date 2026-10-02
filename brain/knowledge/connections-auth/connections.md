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

- **「项目成员权限」设成可编辑，对没有编辑权的项目角色只算可使用。** `resolvePermission` 多收一个 `writableProjectIds`（项目里有 `WRITE_WORKFLOW` 的项目，来自 `projectAccess.projectsWithPermission`）：成员权限为 EDIT 但用户在可用项目里都不能写，就降成 USE。直接分享给个人的 EDIT 不受影响；不传 `writableProjectIds` 的调用保持旧行为。所以查看者永远不能通过连接的成员权限改名、分享、改可用项目。

- **引擎拿到 `EXPIRED` 或 `ERROR` 的连接都抛 `ConnectionExpiredError`。** `connection-resolver` 以前只认 `ERROR`，`EXPIRED` 出现后带着过期令牌继续调第三方，失败原因变成各家的 401，也建不出 `conn:<externalId>` 问题，运行日志里没有「授权已过期」。改引擎代码后要重新构建 `dist/packages/engine` 并重启 worker 才会生效（沙箱缓存会重装）。
- **分享对话框的候选人来自 `GET /v1/connections/share-candidates`。** `GET /v1/users` 实际只有租户管理员能调，普通所有者以前打开分享框看到「没有可以添加的成员」；新接口返回本租户的活跃成员（不含自己），支持 `search` 和 `limit`（最多 500）。
- **`GET /v1/connections/:id` 看不到的连接返回 `404`；`POST /replace` 的源和目标都必须是调用者能用的连接**，否则操作员可以把工作流改指到别人的私有连接。引用面板里的 MCP 服务和环境替换也按成员项目过滤，不可见的只给 `hiddenMcpServiceCount`、`hiddenProjectConfigCount`；删除时仍然按全部引用拦。
- **连接显示名上限 30 个字符**（`CONNECTION_DISPLAY_NAME_MAX_LENGTH`），创建、重命名、全局连接更新都在 shared 的请求 schema 里校验。
- **连接列表搜索里的 `%`、`_` 按字面匹配**，用 `likePatternUtils.escape` 转义，否则搜 `_` 会命中所有连接。
- **`EXPIRED` 和 `ERROR` 是两种坏连接。** 令牌刷新失败（OAuth2 用户类错误、自定义认证刷新错误）记为 `EXPIRED`，重新授权就能恢复；连接校验没通过记为 `ERROR`。两者都不再自动刷新，运行前检查和构建器校验都按「非 ACTIVE」处理。旧数据里已有的 `ERROR` 不会自动改成 `EXPIRED`。
- **重新授权必须是同一个账号。** `connectionService.upsert` 对已存在的连接，会拿新凭证解析出的 `accountIdentifier` 和库里的比较（忽略大小写和首尾空格），不一致就拒绝，提示新建连接；占位连接（`MISSING`）和任一侧解析不出账号时不拦。账号标识取自 OAuth 令牌里的邮箱或连接器的 `resolveConnectionIdentifier`，连接器没实现的就校验不到。
- Deleting a PLATFORM-scope connection via the project route is rejected `403` — delete those via platform admin `DELETE /v1/global-connections/:id`.
- Replace: platform/global connections can be the source, but `deleteSourceConnection` on a platform source → `403`; deleting a project source while a published version still references it → `409`. Draft versions always updated; published only when requested.
- Deleting a connection does NOT cascade to workflows; they fail at runtime with a validation error.
- Global (platform-scope) connections require `globalConnectionsEnabled`; bulk-delete in the project UI skips them client-side.
- `FEMA_ENFORCE_CONNECTION_CONNECTOR_BINDING` (default `false`) makes a step resolve only connections whose `connectorName` equals the step's own connector; a mismatch raises a USER-level `ConnectionConnectorMismatchError`. The check lives in the **engine's** `connection-resolver`, not the worker endpoint. Set the var on the **app** container — the engine cannot read `process.env` (sandbox env is an allowlist), so the flag rides `WorkerSettings` → `SandboxSettings` → sandbox env, the same path as `FEMA_DEV_CONNECTORS`. Code / loop / router steps have no connector, so a missing name is a denial — they lose connection access entirely, and enabling the flag breaks workflows that feed a connection into custom JS.
- `metadata.accountIdentifier` (the "which account is this" label) must be **rewritten on every upsert, never left untouched** — `spreadIfDefined` omits the column and TypeORM `upsert(connection, ['id'])` then leaves the old value in place, so a reconnect that fails to resolve would keep labelling the connection with an account it no longer authenticates as. `mergeConnectionMetadata` also strips the key from caller-supplied `metadata`, because `metadata` is a caller-owned jsonb bag: without that, any `WRITE_CONNECTION` holder can forge the label. Note `POST /:id` (update) still replaces the whole bag.

- **迁移要给存量连接回填 `projectMembersPermission = 'EDIT'`。** 引入分享之前项目成员都能用、能改项目里的连接；不回填的话升级后除所有者外所有人都看不到存量连接，工作流编辑时换不了步骤。新建的连接默认是空（只有所有者和被分享的人）。
- **删除连接前必须没有任何引用。** `DELETE /:id`（项目路由和租户级 `global-connections` 都是）先调 `connectionReferenceService.assertUnreferenced`：还有工作流（含你看不到的项目里的）、MCP 服务固定连接、环境连接替换在用，就返回 `VALIDATION` 并写明各有几处，要先把它们换成别的连接。「批量替换并删除」（`/replace` 的 `deleteSourceConnection`）不受这条限制，它先换后删。前端删除弹窗在有引用时只列引用方，不给确认输入框。
- **只有「使用」权限的人可以提醒所有者重新授权。** `POST /v1/connections/:id/remind-reauth`，连接失效才允许，自己是所有者不允许；同一个人对同一个连接 6 小时内只发一次，所有者收到 `CONNECTION_REAUTH_REQUESTED` 站内通知（和令牌刷新失败自动发的 `CONNECTION_BROKEN` 是两种）。
- **`POST /:id`、`/:id/revalidate`、`DELETE /:id` 现在是租户级路由。** 以前靠 `ProjectResourceType.TABLE` 取 `projectIds[0]` 判项目权限，多项目连接、全部项目连接（`projectIds` 为空）会被误拒；现在按连接权限判：改名要可编辑，测试要能使用，删除只有所有者。
- **重新授权不改所有者、不改可用范围。** `upsert` 命中已有连接时沿用原 `ownerId`、`projectIds`、`scope`；以前可编辑成员重新授权会顺手把自己变成所有者，并把多项目连接缩成当前项目。
- **引用判断只看新增的连接。** `applyOperation` 比较操作前后的 `connectionIds`，只校验新出现的；别人配置好的步骤照样能改其他字段。`USE_AS_DRAFT`（回滚草稿）不校验。
- **`externalId` 在租户内不唯一。** 两个项目可以有同名 externalId 的连接，所以按 externalId 找连接时一定要再按项目可用性过滤（`connectionAvailability.whereAvailableIn`），不能只按租户找。
- **OAuth2 回调地址是 `<FEMA_FRONTEND_URL>/redirect`。** 来自 flag `THIRD_PARTY_AUTH_PROVIDER_REDIRECT_URL`，以前写死为 `null`，界面显示 `no_redirect_url_found`，自托管下授权码流程走不通。回调页只把授权码 `postMessage` 给同源的打开者；用和 `FEMA_FRONTEND_URL` 不同的地址（比如 IP）访问平台时，弹窗授权会收不到授权码，要用配置的那个地址访问。连接器开发的认证测试和 MCP 服务器表单用的是同一个 flag。
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
