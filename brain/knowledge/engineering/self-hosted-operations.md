---
icon: 🛠️
---

# 自托管运维页

管理后台「基础设施」下的两个页面，给运维看版本、升级步骤、备份和恢复预检。平台**不执行升级也不执行恢复**，只检查并生成命令；备份由平台自己执行。

**系统与升级** —— 当前版本、更新检查、数据库和 Redis 版本、在线工作节点版本、可选服务状态、升级与回滚步骤（Compose / Helm）。接口 `GET /v1/health/overview`。
**诊断包** —— 不含密码、密钥、邮箱和业务数据的部署摘要 JSON，`GET /v1/health/diagnostics-bundle`。
**安装向导** —— 还没有任何账号时，`/sign-in` 和 `/` 都会跳到 `/setup`：环境检查、创建管理员、组织信息、可选服务、确认五步（`features/setup-wizard`），步骤写在地址的 `?step=` 里，所以刷新和后退都有效。最后一步才调 `sign-up` 和 `complete-sign-up`（带组织名称），账号和组织一次建好；确认页点两次也只建一个。
**安装检查** —— 向导第一步的数据来源：数据库、Redis、加密密钥、文件存储、数据目录可写、工作节点（`GET /v1/health/setup`，账号建好后只返回 `initialized: true`）。「访问地址」一项由浏览器对比当前地址和 `PUBLIC_URL` 标志。
**可选服务测试** —— 邮件、对象存储、连接器仓库、模板仓库都能「测试连接」：安装前走 `POST /v1/health/setup/service-check`（公开、限流、只验证不发信、账号建好后拒绝），安装后走 `POST /v1/health/services/check`（租户管理员，带收件人时真的发一封测试邮件）。
**平台设置清单** —— 管理后台项目页顶部，跟踪邀请成员、登录方式、定时备份、告警渠道、邮件服务五项，全部完成后隐藏。
**备份与恢复** —— 平台自己做备份（`features/backup`，服务端 `app/backup`）：备份计划（每天或每周、几点、保留份数，默认每天 02:00 保留 7 份）、手动备份、备份列表（大小、时间、结果、是否可恢复）、删除、恢复预检。零配置：写到 `FEMA_CONFIG_PATH/backups`，可选再复制到已配置的对象存储。PostgreSQL 用 `pg_dump` 自定义格式（镜像带 `postgresql-client` 15），PGlite 导出数据目录（tar.gz）。每份备份旁有 `.manifest.json`，记录版本、迁移名、校验和、密钥指纹、数量。命令行备份的命令仍保留在页面底部（折叠）。
**恢复预检** —— `GET /v1/backups/:id/restore-precheck`：文件在不在和大小、SHA-256 校验和、能否读出（`pg_restore --list` 或解 tar）、引擎是否一致、版本关系（相同 / 较旧会迁移 / 较新拒绝）、密钥指纹、当前库是否非空和会替换什么、磁盘空间。只检查，恢复步骤（Compose、Helm、PGlite）由页面按预检结果生成，管理员在服务器上执行。
**可选服务配置** —— 邮件、对象存储、连接器仓库、模板仓库可以在系统页保存（`app/service-settings`）：保存前先用同一套测试连接校验，失败不保存；密钥加密存进 `service_setting`；保存的值通过 `savedOverrides` 覆盖进 `system.get`，环境变量永远优先，设了环境变量的服务在界面只读；每 30 秒从数据库重新加载，所以多台服务器最多晚 30 秒看到。

## Gotchas
- 安装向导阶段还没有账号，可选服务只能用环境变量；账号建好后才能在系统页保存配置。`problem` 字段（端口不是数字、地址不是 http、同步模式为 NONE、最近一封邮件失败）仍然只反映当前生效的配置。向导的草稿存在 sessionStorage，重启服务后保留，密码不保留。
- 界面保存的对象存储配置在已有文件落在对象存储后不能移除（移除会让这些文件读不出）；环境变量设置的服务整体只读。工作节点不读这些值（它们只通过接口访问文件）。
- `FEMA_FRONTEND_URL` 没设时默认 `http://localhost:<端口>`，用别的地址打开时向导会警告；远程工作节点仍然必须显式设置。
- 注册不会联网：曾经生产环境注册会把邮箱 POST 给外部订阅接口，离线时卡十几秒，已删除。
- 向导依赖 AuthLanding 里一个只在挂载时取值的 `showWizard`，不要改成随标志变化：注册成功会让 `USER_CREATED` 变真，改了会让向导在建组织之前被卸载。
- 服务端日志里 `[mailSender#send] Failed to deliver email` 之前没有任何界面提示，现在最近一次结果记在进程内存里（多实例各自一份）。
- 备份执行靠系统任务 `backup-tick` 每 15 分钟检查一次「最近的计划时间点之后有没有尝试过」，所以服务停机错过 02:00 会在恢复后补跑一次；新装的实例要到安装之后的第一个计划时间点才首次备份。BullMQ 的重复任务保证多台服务器只有一台执行，手动备份和定时备份靠数据库里的「运行中」记录互斥（6 小时没结束的记录算失败）。
- 备份列表本身存在数据库里：恢复到较早的备份后，那之后做的备份不再出现在列表里，文件还留在备份目录。备份期间它自己的记录在快照里还是「运行中」，所以恢复后会按旁边的清单文件自愈成成功；没有清单且 3 分钟没心跳（备份中每 30 秒写一次）才算失败。
- PGlite 的 `dumpDataDir` 既不加锁也不做检查点：在服务器处理请求时直接导出，得到的数据目录打不开（实测 `Aborted()`）。现在在独占事务里先 `CHECKPOINT` 再导出，导出后在子进程里解开并真启动一次数据库验证（用 ESM 入口，CJS 入口带 `dataDir` 会报错），恢复预检复用同一验证。
- 备份页的时间一律按服务器时区显示（计划时间点是服务器时区，文件名里的时间也是），页面会写明时区。
- 备份默认在应用容器的 `/root/.fema/backups`，不挂卷会随容器重建丢失；页面用「目录和根文件系统同一设备」粗略判断并提醒，Compose 已默认挂命名卷 `app_data`。
- 镜像里的 pg_dump 是 Debian bookworm 的 15：能导出 15 及以下的服务器，更新的服务器会降级为「未启用」并提示装对应版本的客户端，命令行备份仍可用。
- 「定时备份」清单项现在可以读真实计划，不再靠浏览器本地标记（旧的手动标记逻辑仍在 `componentHealthService`）。
- 备份文件不含加密密钥和 JWT 密钥（PGlite 模式下它们在 `settings.json`，不在 `pglite/` 目录里），只记密钥指纹；加密过的连接凭据在备份里，所以恢复到别处要带上当时的密钥。
- 加密密钥来源三种：`FEMA_ENCRYPTION_KEY` 环境变量；内存 Redis 模式下首次启动生成在 `CONFIG_PATH/settings.json`；两者都没有时显示错误。Helm 部署的密钥在 `fema-secrets` 的 `encryption-key`。
- 更新检查失败返回 `UpdateCheckStatus.FAILED`，页面给出代理和离线镜像的做法；不要把 `0.0.0` 当成真实版本。
- `getMigrations()` 的顺序必须等于时间戳顺序，`npm run rollback` 按这个顺序撤销，并校验它们正是库里最近执行的那几条；错位会报 `Migration order mismatch`，升级后无法回滚（`SnapshotAgentApprovalWorkflowName1791010000000` 曾排在 `AddBackups1790961100000` 前面）。现在回滚按名字末尾的时间戳排序，单测锁住清单顺序。
- `npm run rollback -- --to <版本>` 撤销所有 `release` 比它新的迁移；分叉之后的迁移都标 `0.89.0`，所以在同一个版本号的两个构建之间回滚只能用 `--manifest`（旧镜像里的 `migration-manifest.json`），而 `--to 0.88.3` 会列出 22 条并因两条标了 breaking 而在没有 `--force` 时一条都不撤。
- 限流和审计日志的客户端地址读 `FEMA_CLIENT_REAL_IP_HEADER`（默认 `x-real-ip`），没有反向代理写这个头时曾是 `undefined`：所有人共用一个计数，任何人 1 分钟内错 50 次就让全员登录 429，审计事件里的来源地址也为空。现在头缺失或为空时用连接地址；头本身仍按原样信任，代理必须覆盖客户端自带的值。
- 外部 Postgres 加 `FEMA_ENVIRONMENT=prod` 时，应用在迁移之前检查密钥强度（`helper/secret-strength.ts`，`validateSecretsOnStartup`）：JWT 密钥少于 32 个字符、或任一密钥是重复图案、不同字符少于 10 个，直接拒绝启动。内嵌 PGlite 与非生产环境不查，所以以 `e2e-slot-N-secret` 为密钥的开发脚本不受影响。
- 500 错误不再把数据库报错原文发给客户端（`helper/error-handler.ts`）：22xxx 数据异常（`limit` 越界、时间格式错）回 400 `INVALID_REQUEST_VALUE`，其他 500 只回通用说明，细节在服务端日志。4xx 的入参校验信息保持原样。
- 文档里的一行 `docker run`（`FEMA_DB_TYPE=PGLITE`、`FEMA_REDIS_TYPE=MEMORY`，不设任何密钥）曾经起不来：`docker-entrypoint.sh` 只在设了 `FEMA_JWT_SECRET` 时才生成 `FEMA_WORKER_TOKEN`，零配置时 JWT 密钥由 API 生成在 `settings.json`，内嵌工作节点拿不到令牌就退出，`WORKER_AND_APP` 里任一进程退出整个容器就退出。现在 `MEMORY` 加 `WORKER_AND_APP` 且没设密钥时，入口脚本读写同一个 `settings.json`（`JWT_SECRET` 是 base64 的 32 字节）签发令牌；文件存在但解析失败时不改写，避免丢掉里面的加密密钥。入口脚本也会等应用健康后再起工作节点。
- 更新检查（`versionUtil.getLatestRelease`）读 GitHub，超时 5 秒；系统与升级、系统健康、组件健康各调一次，以前没有缓存，连不上外网的内网里每个系统页慢 5 到 10 秒并各打一条 warn。现在成功缓存 1 小时、失败缓存 10 分钟，同时到达的调用共用一次请求；内网里重启后的第一个系统页仍会等约 5 秒。
- evlog 在 `onError` 里把所有错误都按 `error` 级别记，`ApplicationError` 没有 `statusCode` 还会记成 `status: 500`；`enrichWideEventWithError` 现在对 4xx 调 `setLevel('info')` 并补上真实状态码。后台任务沿用请求的异步上下文时，请求事件早已发出，evlog 往 stderr 打「called after the wide event was emitted」并丢掉日志，后台任务要用 `wideEvent.detached` 脱离（手动备份就是这样）。

## Key files
- `packages/server/api/src/app/health/system-overview.service.ts`
- `packages/web/src/features/system/` — `systemRunbook`
