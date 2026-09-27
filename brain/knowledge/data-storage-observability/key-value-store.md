---
icon: 🔑
---

# Key-Value Store

A persistent, project-scoped key-value store that connector steps read/write during workflow execution. Values are arbitrary JSON (`jsonb`). On top of it sit **named data stores** (数据存储, design doc §4.7), which have a management page.

### Entities & services
- **StoreEntry** (`store-entry` table): `key`, `value` jsonb, `projectId`, plus nullable `dataStoreId` and `expiresAt`. `store-entry.service.ts`: `upsert`, `getOne`, `delete` — these only touch the implicit store (`dataStoreId IS NULL`).
- **DataStore** (`data_store` table): 数据存储，项目内按名称分组的键值集合。`name` ≤ 50 且项目内唯一、不能含 `/`，`description` ≤ 200，`ttlDays` 1–365（默认 30），`ownerId` 为创建人。
- **Implicit store**: rows with `dataStoreId` NULL and no expiry. This is what the Store connector's project / workflow / run scopes have always written. The UI never shows it.
- Limits: key ≤ 128 chars (`STORE_KEY_MAX_LENGTH`), serialized value ≤ 512 KB (`STORE_VALUE_MAX_SIZE`); a named store's value is also capped at 10000 characters (`DATA_STORE_VALUE_MAX_LENGTH`).

### How it works
- Engine routes under `/v1/store-entries` (POST upsert, GET, DELETE) require `securityAccess.engine()`. `projectId` comes from the engine token.
- 工作流访问命名存储：Store 连接器选「项目」范围，键写成 `datastore:<存储名>/<键>`（前缀常量 `DATA_STORE_KEY_PREFIX`）。API 按名称找到本项目的存储后读写它的记录，写入时按存储的有效期设置 `expiresAt`。存储不存在：GET 返回 404（读到空值），写和删返回 409，引擎报 `StorageInvalidKeyError`。
- 用户接口在 `/v1/data-stores`（列表带记录数、增删改、记录列表最多 500 条按更新时间倒序、清空）。读需要 `READ_WORKFLOW`，写需要 `WRITE_WORKFLOW`。存储增删改、清空、删键写审计。
- 过期清理：系统任务 `data-store-expiry-purge` 每小时第 41 分钟批量删除 `expiresAt <= now()` 的行。引擎读取时也把已过期的行当作不存在；管理页会显示尚未清理的行并标「已过期」。

### Gotchas
- Upserts must name the partial unique index: implicit rows use `indexPredicate: '"dataStoreId" IS NULL'` on `(projectId, key)`, named rows use `'"dataStoreId" IS NOT NULL'` on `(dataStoreId, key)`. Without the predicate Postgres cannot infer the conflict target.
- 引擎校验的是完整键 ≤ 128，所以 `datastore:` + 存储名 + `/` + 键 合起来不能超过 128 个字符。
- 只有动作（action）能用 `datastore:` 键；触发器的 store 带前缀，键不会以 `datastore:` 开头，仍落在隐式存储。
- 修改有效期只影响之后写入的数据，已有记录的 `expiresAt` 不变。
- 引擎把 4xx 都报成 `StorageInvalidKeyError`，文案是“键为空或过长”，真正原因（存储不存在、值超过 10000 字）在 cause 里。
- 删除存储会级联删除它的记录（`fk_store_entry_data_store_id` ON DELETE CASCADE）；项目副本只复制存储结构，不复制记录（`dataStoreService.copyStructure`）。
- Value size check (`object-sizeof` > 512 KB → HTTP 413) happens in the controller before the DB. Values run through `sanitizeObjectForPostgresql`.

### Key files
Entry points: `storeEntryModule` and `dataStoreModule`, registered in `packages/server/api/src/app/app.ts`.

- `packages/server/api/src/app/store-entry/` — engine-facing routes, implicit-store service, entity
- `packages/server/api/src/app/data-store/` — named stores: entity, controller, services, cleanup job, `dataStoreUtils.parseEngineKey`
- `packages/core/shared/src/lib/core/store-entry/` — `StoreEntry` type, limit constants, engine DTOs
- `packages/core/shared/src/lib/automation/data-store/` — data store DTOs and limits
- `packages/server/engine/src/lib/connector-context/store.ts` — engine side that calls `/v1/store-entries`, builds the scoped key, maps errors
- `packages/web/src/features/data-stores/` and `packages/web/src/app/routes/data-stores/` — the 数据存储 page
