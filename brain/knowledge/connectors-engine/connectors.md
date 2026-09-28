---
icon: 🧩
---

# Connectors

The metadata catalog of automation integrations ("connectors") — each a named integration like `@fema-ipaas/connector-gmail` providing actions and triggers. Stored in `connector_metadata` and served from an in-memory `connectorCache` rebuilt from the DB on startup and refreshed via pub/sub.

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
- EE/Cloud per-connector and per-action/trigger visibility workflows through `resolveVisibility` (`ee/connectors/filters/connector-filtering-utils.ts`), which returns a `VisibilityPolicy` or `null` on CE / when `platformId`/`projectId` is nil (callers treat `null` as no filtering). The policy is derived from the project's **connector set** (via `project.connectorSetId`, falling back to the platform Default).
- Install and sync also enqueue a tool-search reindex, but only when `isToolSearchEnabled()`; no-op otherwise.
- `delete` removes all versions sharing the name on that platform, and only for `CUSTOM` connectors the caller owns.
- **A connector silently vanishes from the list when its `minimumSupportedRelease` is ahead of the root `package.json` version.** `fetchLatestConnectors` filters every connector through `isSupportedRelease(versionUtil.getCurrentRelease(), connector)`. Connectors are routinely merged targeting the *next* release, so on `main` a couple dozen are invisible locally until the version bump lands. No warning is logged — it just isn't there.
- **DynamicProperties clears its value before it knows the new schema, so the merge source must be a snapshot.** `DynamicPropertiesImplementation` re-fetches the child schema on every refresher change, clearing the form value synchronously and re-populating it in the mutation callback. The merge source for `getDefaultValueForProperties` has to be a `lastKnownValue` ref captured *before* the clear — reading `form.getValues()` in the callback sees the cleared `null` and defaults every child (GIT-1514). The snapshot must be spread-cloned: RHF `getValues(name)` hands back the live object and the clear's `setValue(...child, null)` mutates it in place. Guard the ref with `isNil` so it survives rapid successive changes, where later effect runs already observe `null`.
- `DynamicPropertiesContext` tracks loading by property name only, so two in-flight requests for the same property let the first completion clear the flag for both — briefly re-enabling Test Step while the value is still cleared.
- **The frontend `POST /v1/connectors/options` client only rejects for DYNAMIC.** `connectorsApi.options` (`packages/web/src/features/connectors/api/`) catches DROPDOWN failures, toasts, and *resolves* with a disabled-dropdown fallback — so for dropdowns every error path wired onto that mutation is dead: `useConnectorOptions`' `onError` handlers, its `retry: 1`, and the `if (error) throw error` into `DynamicPropertiesErrorBoundary`. DYNAMIC must rethrow: a swallowed failure arrives as a *successful* empty schema, which resets the property's children to defaults and gets persisted by step-settings autosave.
- **`FEMA_DEV_CONNECTORS` shadows the DB registry copy by name**, so a dev connector failing the release gate removes the connector *entirely* rather than falling back to the published version. Dropping the name from `FEMA_DEV_CONNECTORS` (or bumping the local root `package.json`) brings it back.

- **连接器市场的「最热」和「你的项目中有 N 个工作流在使用」来自 `GET /v1/connector-usage`。** 它用 `jsonb_path_query(trigger, 'lax $.**.connectorName')` 从每个工作流的最新版本里抽连接器名，一条 SQL 按项目分组；必须用 `lax`，`strict` 模式下 `.connectorName` 碰到数组或标量会直接报错。
- **「提交需求」存进 `connector_demand`，租户管理员在后台处理。** 只有配置了 SMTP 才给管理员发邮件；不往告警渠道发，因为渠道绑在告警策略上，会被当成告警噪音。
- **第一方连接器随镜像交付，从 `packages/connectors/{core,community,custom}/*/dist` 直接加载（决定 000037）。** 没设 `FEMA_DEV_CONNECTORS` 时，这些目录下所有构建好的连接器都是内置连接器；设了（包括空字符串）就只用显式列出的，这是开发和测试的行为。名单由 `localConnectorNames` 算出，通过 worker 设置的 `DEV_CONNECTORS` 下发给沙箱和引擎，所以它们不下载、不安装，直接读本地 dist。内置连接器总是加载翻译。
- **内置连接器只在 UNSANDBOXED 和 `SANDBOX_CODE_ONLY` 模式下可用。** isolate 模式（`SANDBOX_PROCESS`、`SANDBOX_CODE_AND_PROCESS`）里引擎的工作目录是 `/root`，看不到 `packages/connectors`，连接器依赖的 bun 软链接也指向没挂载的 `/usr/src/app/node_modules`。待办：构建时为每个内置连接器生成带依赖的独立包，只读挂进沙箱；不要把整个应用目录挂进去。
- **精简 worker 镜像（`Dockerfile.worker`）里没有内置连接器。** 它不带 `packages/connectors` 和工作区 `node_modules`，只在 `benchmark/` 里用；默认的 `docker-compose.yml` 和 helm 的 app、worker 都用主镜像。要让它能跑内置连接器，同样要走「每个连接器打成带依赖的独立包」这条路。
- **北森、飞书的接口地址可以用环境变量覆盖。** `FEMA_BEISEN_BASE_URL`、`FEMA_FEISHU_BASE_URL`（飞书优先于连接里选的地区），用于私有化网关和模拟服务；连接器跑在沙箱里，变量要同时列进 `FEMA_SANDBOX_PROPAGATED_ENV_VARS` 才传得进去。
- **没配注册中心时同步任务直接跳过。** 以前 `listCloudConnectors()` 返回空数组后，`deleteConnectorsIfNotOnCloud` 会把所有 OFFICIAL 连接器当成「云上已下架」删掉。

### Key files
Entry point: `connectorModule`, the Fastify plugin registered in `packages/server/api/src/app/app.ts` that mounts every `/v1/connectors` route.

- `packages/server/api/src/app/connectors/metadata/` — controller, service, TypeORM entity, and the pub/sub-invalidated `connector-cache.ts`
- `packages/server/api/src/app/connectors/` — `community-connector-module.ts` (POST `/v1/connectors` install), `connector-install-service.ts`, `connector-sync-service.ts`
- `packages/server/api/src/app/ee/connectors/filters/connector-filtering-utils.ts` — `resolveVisibility` and the EE/Cloud `VisibilityPolicy`
- `packages/server/api/src/app/connectors/market/`、`connectors/demand/` — 连接器使用统计和「提交需求」
- `packages/web/src/features/connectors/api/` — frontend HTTP client
- `packages/web/src/features/connectors/hooks/` — React Query hooks for listing, connector model, options, and output schema
- `packages/web/src/features/connector-usage/`、`packages/web/src/features/connector-demands/` — 前端对 `/v1/connector-usage` 和 `/v1/connector-demands` 的封装，市场页（`packages/web/src/app/routes/tenant/connectors/marketplace.tsx`）和连接器详情页用它们拿热度、使用它的工作流、提需求
- `packages/web/src/features/connectors/components/` — `ConnectorIcon`, `ConnectorIconList`, `ConnectorSelectorSearch`, `InstallConnectorDialog`
- `packages/connectors/sdk/src/lib/output-schema.ts` — `OutputSchema` / `OutputSchemaField` / `FieldFormat` types

Paths verified 2026-07-17.
