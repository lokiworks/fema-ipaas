---
icon: 🏭
---

# 生产形态验证

开发栈（tsx、vite、`UNSANDBOXED`、`FEMA_ENVIRONMENT=dev`、PGlite 加内存 Redis）跑通不等于企业真实部署能跑：企业跑的是镜像里的构建产物、非 dev 环境、沙箱执行、真实 Postgres 与 Redis。本机没有 Docker 时按下面的办法复现镜像的运行方式，脚本都在 `tools/e2e/`，面向运维的核对清单是 `docs/install/configure-operate/production-checklist.mdx`。

1. 复制仓库做构建副本（`cp -cR` 在 APFS 上是秒级写时复制，node_modules 的符号链接是相对的，副本里改不到原仓库），`git reset --hard` 到要验证的提交，再按 Dockerfile 的顺序 `npx turbo run build --filter=web --filter=@fema-ipaas/engine --filter=api --filter=worker`，然后再构建 `packages/connectors/{core,community}/*`。
2. 生成迁移清单写进 `packages/server/api/dist/src/migration-manifest.json`（Dockerfile 里那段 `node -e`），删掉 web 的 `.map`。
3. 仿 Dockerfile 的运行阶段：再复制一份，删掉 `packages/{web,cli,tests-e2e}`，从根 `package.json` 的 workspaces 里去掉它们，删 `node_modules` 和 `bun.lock`，`bun install --production`。本机构建用的是完整依赖，只有这一步才能暴露「只在生产依赖里缺」的导入。
4. 镜像把 `isolated-vm` 装在 `/usr/src/node_modules`（应用在 `/usr/src/app`）。本机在应用目录的**上一级**执行 `bun install isolated-vm@6.0.2`，缓存目录放在它下面，引擎子进程靠祖先目录解析到它；少了这一步 `SANDBOX_CODE_ONLY` 下每个代码步骤都报 `Cannot find module 'isolated-vm'`。
5. `tools/e2e/stack/start-prod-stack.sh <槽位>`：用 `docker-entrypoint.sh` 起 APP 和 WORKER 两个进程，临时 Postgres（`55440+槽位`）和 Redis（`56440+槽位`），停用 `stop-prod-stack.sh <槽位> [--deps]`。`PROD_ZERO=1` 只设端口，用内嵌 PGlite 加内存 Redis 和 `WORKER_AND_APP` 单进程，对应文档里的一行 `docker run`；`PROD_WORKER_COUNT=3` 起三个共用缓存目录的工作节点（compose 的做法）；`PROD_WORKER_BUNDLE=<目录>` 用 Dockerfile.worker 的 esbuild 单文件产物（它没有内置连接器，发布带 Webhook 触发器的工作流会报 `Connector not found for package`，只用来看它能不能启动连上 API）；`PROD_API_PORT` 加 `E2E_STATE_ROOT` 可以在同一个槽位的另一个端口（如 4201）再起一套，状态目录分开。
6. 验证脚本：`prod-sandbox.mjs`（沙箱里代码步骤与连接器）、`prod-security.mjs`、`prod-upgrade.mjs`（旧提交的构建产物造数据，换新产物启动，回滚，再升级）、`prod-ui.mjs`（浏览器走向导和主要页面）、`prod-system.mjs`（系统页、备份、日志）、`prod-workers.mjs`、`prod-resilience.mjs`。首发主线用 `tools/e2e/main-line/run-official-solution.mjs`，前端主线用 `s3-main-line-and-issues.mjs`（去掉 `downtime` 一段，它会起开发用的 tsx worker）。

## Gotchas

- **起不来的第一个原因多半是旧进程还没退出。** 工作节点收到终止信号后要等在途作业，实测 18 秒；这时新工作节点在同一个健康检查端口上报 `EADDRINUSE` 直接退出，API 一侧就表现成「轮询作业一直排队、没有人领」。起脚本要等旧 pid 退出再起新的。
- **应用重启后，被旧进程占着的轮询作业要等锁过期才会恢复**（`LOCK_DURATION_MS` 是 120 秒，再加 30 秒的卡住检测），重启后两三分钟内触发器不轮询，期间的员工变动不会丢，下一轮会补上。
- **端口 3101 之类的槽位端口别和别的验证共用。** 并行验证时每个人用自己的槽位，停进程只按端口或记下的进程号。
- **开发形态的脚本在生产形态下的差别：** `FEMA_DEV_CONNECTORS` 不设（镜像里的连接器全部加载）、没有种子账号 `dev@ap.com`（先走向导或 `sign-up` 加 `complete-sign-up`）、限流按连接地址计数而不是读不到的代理头、弱密钥在外部 Postgres 下直接拒绝启动。
- **起脚本里 `cd 目录 && 命令 &` 的 `$!` 是整个与列表的子 shell，不是 node。** 记下这个 pid 再 kill，node 还活着继续领作业；记 pid 要先 `cd` 再单独起命令。残留的旧工作节点会抢走新栈的作业并在没有连接器时失败，表现为莫名的 `TRIGGER_UPDATE_STATUS` 和 `Worker did not respond within the safety timeout`。
- **Node 的 fetch 会复用连到旧进程的长连接，服务重启后的第一个请求报 `ECONNRESET`。** 重启后的脚本先轮询 `/health`（捕获异常）再发业务请求。
- **同时跑编译或别的重活会让轮询类检查超时。** 主线脚本里按分钟轮询的步骤（离职那一步等 240 秒）在机器同时在构建时失败过一次，单独重跑通过；跑主线时别并行做别的。
- **主线的模拟服务和脚本要和被验证的连接器是同一个提交。** 别的代理改北森或飞书连接器时模拟服务和主线脚本会一起改，用构建副本里的那份（`E2E_MOCK_SCRIPT=<副本>/tools/e2e/main-line/mock-server.mjs`）才和构建产物一致。
