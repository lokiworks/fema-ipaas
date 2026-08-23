---
title: 重新生成基线迁移
icon: 🗜️
---

本仓库只有一个迁移：`migration/postgres/*-InitialSchema.ts`（见
[decisions ADR 0011](../../../docs/adr/0011-squash-upstream-migrations-into-one-baseline.md)）。
领域重命名会让它整体作废，届时按下面的步骤重新生成，而不是往后追加改名迁移。

## 步骤

1. 起一个**空的、专用的** Postgres，端口不要用 5432：

   ```bash
   docker run -d --name fema-baseline-pg \
     -e POSTGRES_DB=fema -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=fema_baseline \
     -p 15432:5432 postgres:14.4
   ```

2. 清空迁移目录，并把 `postgres-connection.ts` 的 `getMigrations()` 暂时改成返回 `[]`。

3. 生成。`.env.tests` 通常读不到（会被权限规则挡住），直接在命令行给全变量：

   ```bash
   cd packages/server/api
   FEMA_POSTGRES_HOST=127.0.0.1 FEMA_POSTGRES_PORT=15432 FEMA_POSTGRES_USERNAME=postgres \
   FEMA_POSTGRES_PASSWORD=fema_baseline FEMA_POSTGRES_DATABASE=fema \
   FEMA_POSTGRES_IDLE_TIMEOUT_MS=30000 FEMA_ENVIRONMENT=dev FEMA_DEV_CONNECTORS='' \
   FEMA_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef FEMA_JWT_SECRET=test-secret \
   FEMA_FRONTEND_URL=http://localhost:4200 FEMA_CONTAINER_TYPE=WORKER_AND_APP \
   npx ts-node --transpile-only -r tsconfig-paths/register -P tsconfig.app.json \
     node_modules/typeorm/cli.js migration:generate -p \
     -d src/app/database/migration-data-source.ts \
     src/app/database/migration/postgres/InitialSchema
   ```

4. **手工把 `en_natural` 加回生成结果的最前面**（见下方 Gotchas）：

   ```ts
   await queryRunner.query(`
       CREATE COLLATION IF NOT EXISTS en_natural (LOCALE = 'en-US-u-kn-true', PROVIDER = 'icu')
   `);
   ```
   `down()` 里对应 `DROP COLLATION IF EXISTS en_natural`。

5. 把新类名接回 `getMigrations()`，然后**验证两件事**：对空库 `migration:run` 成功，
   且随后 `migration:generate --dryrun --check` 输出
   `No changes in database schema were found`。

6. `docker rm -f fema-baseline-pg`。

## Gotchas

- **不要用 5432。** 开发机上常有本地 Postgres 监听 `127.0.0.1:5432`，它会遮蔽容器的
  端口映射，症状是 `role "postgres" does not exist` ——看起来像认证问题，实际是连错了库。
  用 `lsof -nP -iTCP:5432 -sTCP:LISTEN` 确认。
- **`en_natural` 不会被自动生成。** 它是上游一条早期迁移用 `CREATE COLLATION` 建的，
  `migration:generate` 只会在列上写 `COLLATE "en_natural"` 而不会创建它本身。
  漏掉的症状是 `collation "en_natural" for encoding "UTF8" does not exist`。
  它给 `connector_metadata.version` 提供自然版本号排序，不能改成默认排序规则。
- **实体里的悬空关系会让生成直接失败**，报
  `Entity metadata for X#y was not found`。删除实体后要顺手删掉别处指向它的
  `many-to-one` 关系块，只删 `getEntities()` 里的登记是不够的。
- **索引名不能超过 63 字节，否则 schema 会永久漂移。** Postgres 会把超长标识符截断，
  而 TypeORM 拿未截断的名字去比对，于是每次 `migration:generate --check` 都产出同一对
  `DROP INDEX` / `CREATE INDEX`，看起来像"改了没生效"。领域重命名最容易触发这个——
  `flow`→`workflow`、`project`→`workspace` 会让本来 60 出头的名字集体越界。
  生成前先跑一遍：

  ```bash
  grep -rhoE "name: '(idx|fk|uq)_[a-zA-Z_]*'" packages/server/api/src/app --include='*.ts' \
    | sed "s/name: '//;s/'//" | awk '{ if (length($0) > 63) print length($0)": "$0 }'
  ```

  修在实体侧（缩短名字），不要修在迁移里，否则下次生成又会漂回去。
