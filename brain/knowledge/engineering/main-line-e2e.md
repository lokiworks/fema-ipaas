---
icon: 🧪
---

# 跑一遍首发主线

在本机不碰开发库和 Docker，把「北森员工变动 → 查映射表 → 飞书按部门开通账号 → 通知 HR 群，出错后在问题中心修复重放」从头走到尾，8 项判定全过才算通过。脚本在 `tools/e2e/main-line/`。

1. 构建会用到的包：`npx turbo run build --filter=@fema-ipaas/shared --filter=@fema-ipaas/engine` 加上 `packages/connectors/{core,community}/*` 全部连接器，前端要看页面时再加 `--filter=web`。
2. 起模拟服务：`node tools/e2e/main-line/mock-server.mjs`（默认 18900 端口），同时模拟北森和飞书，另有 `/__admin/employees`（写入员工变动）、`/__admin/feishu-failure`（让飞书开通账号返回指定错误码）、`/__admin/state`（看飞书收到了什么）。
3. 在独立端口起 API 和 worker，数据库用 PGLITE、Redis 用内存，关键环境变量：
   - `FEMA_PORT=18090`、`FEMA_FRONTEND_URL=http://localhost:18090`、`FEMA_ENVIRONMENT=prod`、`FEMA_DB_TYPE=PGLITE`、`FEMA_CONFIG_PATH=<临时目录>`、`FEMA_REDIS_TYPE=MEMORY`、`FEMA_CACHE_BASE_PATH=<临时目录>`，加密和 JWT 密钥随机生成，`FEMA_WORKER_TOKEN` 用 JWT 密钥签一个 `type: WORKER` 的令牌
   - `FEMA_TRIGGER_DEFAULT_POLL_INTERVAL=1`、`FEMA_SSRF_ALLOW_LIST=127.0.0.1`
   - `FEMA_BEISEN_BASE_URL=http://127.0.0.1:18900/beisen`、`FEMA_FEISHU_BASE_URL=http://127.0.0.1:18900/feishu`，并用 `FEMA_SANDBOX_PROPAGATED_ENV_VARS=FEMA_BEISEN_BASE_URL,FEMA_FEISHU_BASE_URL` 传进沙箱
   - `FEMA_DEV_CONNECTORS` 显式列出全部连接器目录名（原因见 Gotchas）
   - API：`FEMA_CONTAINER_TYPE=APP npx tsx --tsconfig packages/server/api/tsconfig.app.json packages/server/api/src/bootstrap.ts`；worker 另用 `FEMA_PORT=18091 FEMA_CONTAINER_TYPE=WORKER`，入口 `packages/server/worker/src/bootstrap.ts`
4. 跑 `node tools/e2e/main-line/run-main-line.mjs`，全新实例会自己注册账号；已有租户的实例用 `E2E_EMAIL` / `E2E_PASSWORD` 登录。换成真实飞书时设 `E2E_FEISHU_APP_ID`、`E2E_FEISHU_APP_SECRET`、`E2E_FEISHU_HR_CHAT_ID`，并去掉 `FEMA_FEISHU_BASE_URL`。
5. 停服务时只按上面这几个端口 kill 进程。

## Gotchas
- **模拟服务的管理接口（`tools/e2e/main-line/mock-server.mjs`）。** `/__admin/beisen-mode` 现在接 `{ rules: [...] }`，每条规则 `{ mode, retryAfterSeconds, appKey, whenEmpStatusIncludes, unlessEmpStatusIncludes }`，按顺序取第一条匹配的；`mode` 有 `RATE_LIMIT_429`、`RATE_LIMIT_BODY`、`SERVER_ERROR_500`，空数组清除，旧的 `{ mode }` 写法仍可用。三个入职、调岗、离职工作流的轮询请求分别带不同的 `empStatus`（离职只有 8），所以能让其中一个工作流单独失败或恢复。`/__admin/feishu-failure` 多了 `times`（只失败这么多次再自动恢复）和 `resetSeconds`（回 `x-ogw-ratelimit-reset` 头）；`/__admin/state` 多了 `failuresServed`。北森令牌现在带着 app_key，规则才能按连接区分。
- **宕机补事件的场景要等三分钟左右。** 脚本停 worker（`stop-worker.sh`）约 165 秒，超过「2 个轮询间隔 + 30 秒」才会被判为补上的事件，再用 `start-worker.sh` 拉起。
- **api 和 worker 的 `bootstrap.ts` 会用 dotenv 加载 `.env.dev`。** 在 shell 里 `unset FEMA_DEV_CONNECTORS` 没用，它会被 `.env.dev` 那份开发名单补回来（名单里没有北森和飞书），表现为建连接时报 `connector_metadata_not_found`。要么显式列全，要么用镜像验证「不设变量即全部内置」这条路径。
- **步骤引用要带 `['output']`**，例如 `{{trigger['output']['DepartmentName']}}`，漏了会解析成空字符串，映射表查找报 `"" is not in mapping table`。
- **发布后要等触发器启用完再写入变动。** 触发器启用是异步的，启用时记下的轮询起点晚于已有的变动，启用前的变动不会被处理，这是预期行为。
- **本机开发服务也跑在同一仓库**（3000/4200 端口），不要用 `pkill -f` 按入口文件匹配，会连用户的开发 API 一起杀掉，turbo 再把 vite 也停了。
- **自托管实例有租户后注册仅限邀请**（`INVITATION_ONLY_SIGN_UP`），重跑要么清空 PGLITE 目录，要么用已有账号登录。

## 规模与故障注入（`tools/e2e/scenarios/load-*.mjs`）

在本机用真实 Postgres（`postgres` 二进制，端口 55440+槽位）和 Redis（`redis-server`，端口 56440+槽位，不持久）压主线，临时数据放 `/tmp/fema-e2e/slot-<槽位>/`，脚本按精确进程号起停，不碰 3000、5173、5432、6379、8080。

- `lib/load-stack.mjs` 起栈（`node load-stack.mjs up --db real --redis real --workers 2` 或脚本里调 `loadStack.up`），支持强杀 worker、优雅停、清空重启 Redis；`lib/load-kit.mjs` 装官方北森到飞书方案、造员工、统计。
- `load-scale.mjs`：`LOAD_DB=real LOAD_N=2000` 按批注入入职、调岗（含同一员工多次变动和重复编辑），断言飞书账号数、无重复开通、部门与北森最后一条一致、通知恰好一次、运行监控与库一致。
- `load-faults.mjs`：`LOAD_SCENARIOS=kill-worker,redis-wipe,...` 逐个跑故障场景，每个场景断言不丢事件、不重复开通、不丢通知、问题只有一个。
- `load-verify.mjs`：把真实运行克隆成上万条测写后读回核对的耗时；`load-retention.mjs`：把日志改成 40 天前，触发保留期清理。

## Gotchas（规模与故障）
- **别的代理改连接器源码会让你的栈里的运行中途失败。** API 在开发环境会监视连接器源码并重编译，实测遇到过一次运行在触发器步骤报 `Cannot read properties of undefined (reading 'TIMEBASED')`，与重编译发生在同一时刻，另一次是 `Cannot convert undefined or null to object`。`load-stack.mjs` 用 `prepareSnapshot` 把 `packages/connectors` 复制成快照目录并以它为工作目录起 API，改了连接器要重新 build 再 `prepareSnapshot({ refresh: true })`。
- **机器被别的代理占着时吞吐数字不可比。** 实测同一台机器负载在 17 到 46 之间，2000 人入职季每秒 1.3 到 1.8 个运行（默认 5 个并发），换一台空闲机器会高很多；比较要用同一时段，或看每个运行的 CPU 时间。
- **Postgres 起不来报 `postmaster became multithreaded`：** 本机要设 `LC_ALL=en_US.UTF-8`。
- **连接器的存储步骤范围值要写 `COLLECTION` 不是 `PROJECT`。** 写错了要等第一个员工到达才在运行里报错，方案单测现在会检查。

## 规模与故障的实测结果（2026-10-05，本机，模拟北森和飞书）
- **规模**：2000 人入职季（2000 个入职、480 个第一次调岗、160 个第二次调岗、200 条重复编辑，共 2640 个运行）。PGLite 加内存 Redis 用时 24 分钟、1.84 个运行每秒；真实 Postgres 加 Redis 用时 35 分钟、1.27 个运行每秒（默认每个 worker 5 路并发，机器负载 17 到 46，被别的代理占着，数字偏低，同机 1000 人负载低时是 2 个运行每秒）。飞书账号 2000、没有重复开通、通知恰好 2000 条、部门全对、没有失败运行。API 内存峰值 412 到 820 MB，worker 进程树峰值 1.3 到 1.6 GB（15 个进程）。2640 个运行占库 37 MB。
- **接口延迟**：积压最重时 p95 在 2 秒以上、最大 18 秒是机器负载 30 以上的结果；同样 1000 人的负载在负载 6 的机器上，不管限不限制启动并发，p95 约 110 毫秒、最大 0.4 到 0.5 秒。
- **保留期清理**：把 2640 个运行的日志改成 40 天前，7162 个运行日志文件加 3629 个载荷文件 6 秒清完，清理期间接口 p95 205 毫秒；运行记录行保留，库文件大小不缩（要 vacuum）。
- **核对（写后读回）**：1 万条运行 17 分钟、API 内存峰值 363 MB（并发 8 路、10 次每秒），串行版只有 5.6 次每秒（约 30 分钟）。
- **运行监控计数**：运行数、成功数和库一致；但运行积压时轮询被饿住，原来会把正常事件记成「宕机后补上」（1980 个误记），轮询优先级提高后为 0。
- **故障注入**（真实 Postgres 和 Redis，每个场景 60 到 300 个员工）：强杀 worker、优雅停 API 和 worker、Redis 清空且 API 不重启、飞书间歇 500 和 429 和写入成功但返回失败和响应拖过超时、北森重复乱序、两个 worker 并发、Webhook 同一事件号并发投递、触发器连续重新发布，都做到不丢事件、不重复开通、通知恰好一次、问题只有一个、重放后补平。已知限制：北森晚 15 分钟才可见的变动会丢（重叠窗口 5 分钟，没有全量名单对账）；飞书 500 的失败要人确认重放（不属于可自动重放的瞬时错误）；API 崩溃时的游标回滚要等卡住的任务被重新派发，约 3 分钟才补回事件。
- 重复编辑和重复事件：50% 重复率加乱序下没有重复开通；审计日志里每个运行有两条「运行结束」事件（6324 条结束对 3629 个运行），审计量比运行数多，没查根因。
