---
icon: 🏭
---

# 生产形态验证

开发栈（tsx、vite、`UNSANDBOXED`、`FEMA_ENVIRONMENT=dev`、PGlite 加内存 Redis）跑通不等于企业真实部署能跑：企业跑的是镜像里的构建产物、非 dev 环境、沙箱执行、真实 Postgres 与 Redis。本机没有 Docker 时按下面的办法复现镜像的运行方式，脚本都在 `tools/e2e/`，面向运维的核对清单是 `docs/install/configure-operate/production-checklist.mdx`。

1. 复制仓库做构建副本（`cp -cR` 在 APFS 上是秒级写时复制，node_modules 的符号链接是相对的，副本里改不到原仓库），`git reset --hard` 到要验证的提交，再按 Dockerfile 的顺序 `npx turbo run build --filter=web --filter=@fema-ipaas/engine --filter=api --filter=worker`，然后再构建 `packages/connectors/{core,community}/*`。
2. 生成迁移清单写进 `packages/server/api/dist/src/migration-manifest.json`（Dockerfile 里那段 `node -e`），删掉 web 的 `.map`。
3. 仿 Dockerfile 的运行阶段：再复制一份，删掉 `packages/{web,cli,tests-e2e}`，从根 `package.json` 的 workspaces 里去掉它们，保留 `bun.lock`，用 `bun install --lockfile-only` 更新裁剪后的工作区清单，再删 `node_modules` 并 `bun install --production`。生产模式隐含冻结锁文件，不能直接拿未裁剪的锁安装；删锁重解析又会改变传递依赖版本。本机构建用的是完整依赖，生产安装才能暴露未声明的运行时导入。
4. 镜像把 `isolated-vm` 装在 `/usr/src/node_modules`（应用在 `/usr/src/app`）。本机在应用目录的**上一级**执行 `bun install isolated-vm@6.0.2`，缓存目录放在它下面，引擎子进程靠祖先目录解析到它；少了这一步 `SANDBOX_CODE_ONLY` 下每个代码步骤都报 `Cannot find module 'isolated-vm'`。
5. `tools/e2e/stack/start-prod-stack.sh <槽位>`：用 `docker-entrypoint.sh` 起 APP 和 WORKER 两个进程，临时 Postgres（`55440+槽位`）和 Redis（`56440+槽位`），停用 `stop-prod-stack.sh <槽位> [--deps]`。`PROD_ZERO=1` 只设端口，用内嵌 PGlite 加内存 Redis 和 `WORKER_AND_APP` 单进程，对应文档里的一行 `docker run`；`PROD_WORKER_COUNT=3` 起三个共用缓存目录的工作节点（compose 的做法）；`PROD_WORKER_BUNDLE=<目录>` 用 Dockerfile.worker 的 esbuild 单文件产物（它没有内置连接器，发布带 Webhook 触发器的工作流会报 `Connector not found for package`，只用来看它能不能启动连上 API）；`PROD_API_PORT` 加 `E2E_STATE_ROOT` 可以在同一个槽位的另一个端口（如 4201）再起一套，状态目录分开。
6. 验证脚本：`prod-sandbox.mjs`（沙箱里代码步骤与连接器）、`prod-security.mjs`、`prod-upgrade.mjs`（旧提交的构建产物造数据，换新产物启动，回滚，再升级）、`prod-ui.mjs`（浏览器走向导和主要页面）、`prod-system.mjs`（系统页、备份、日志）、`prod-workers.mjs`、`prod-resilience.mjs`。首发主线用 `tools/e2e/main-line/run-official-solution.mjs`，前端主线用 `s3-main-line-and-issues.mjs`（去掉 `downtime` 一段，它会起开发用的 tsx worker）。
7. 有 Docker 时直接验镜像：`scenarios/container-zero-config.mjs` 不传容器环境变量，检查注册、内置连接器、代码沙箱与连接器执行、卷持久化；`scenarios/two-host-container-drill.mjs` 通过 `E2E_DOCKER_HOST_A`、`E2E_DOCKER_HOST_B` 接两个独立 Linux Docker daemon，要求镜像 ID 相同，演练并发调岗、写入期间备份、200+50 人实际恢复和万级对账。两者都要求独立 `E2E_STATE_ROOT`、`E2E_SLOT` 和结果目录；同一物理机上的两个虚拟机只证明虚拟机隔离，不能记作两台物理服务器的容量实测。

## Gotchas

- **小库备份的并发检查要保证真实重叠。** `pg_dump` 可能在第二个请求到达前完成；验收先短暂锁住专用探针表，让备份保持进行中，再检查第二次启动返回 409，不能把顺序完成的两个 201 判为锁失效。

- **北森当前名单与未来生效记录不同。** 全量接口使用 `isGetLatestRecord=false` 读取已生效记录；并发调岗夹具要使用相对过去的生效日期，硬编码未来日期会让夹具的预期部门与当前名单矛盾。

- **引擎的 source map 是运行时文件。** 安装沙箱引擎会读取 `main.js.map` 和 `connector-child.js.map`；只保留 JavaScript 的镜像能启动，却会在测试连接或执行步骤时失败。Dockerfile 的清理只删 web 的 map；镜像验收要实际执行连接器，不能只查健康接口。
- **钉钉工作通知的重复请求不等于重复送达。** 官方 `asyncsend_v2` 对同一员工一天内的相同内容返回成功但不重复投递；模拟服务应保留重复请求计数并抑制重复送达。连接器仍按不安全写入处理，不能把这个平台限制推广到机器人或跨天重放。
- **起不来的第一个原因多半是旧进程还没退出。** 工作节点收到终止信号后要等在途作业，实测 18 秒；这时新工作节点在同一个健康检查端口上报 `EADDRINUSE` 直接退出，API 一侧就表现成「轮询作业一直排队、没有人领」。起脚本要等旧 pid 退出再起新的。
- **应用重启后，被旧进程占着的轮询作业要等锁过期才会恢复**（`LOCK_DURATION_MS` 是 120 秒，再加 30 秒的卡住检测），重启后两三分钟内触发器不轮询，期间的员工变动不会丢，下一轮会补上。
- **端口 3101 之类的槽位端口别和别的验证共用。** 并行验证时每个人用自己的槽位，停进程只按端口或记下的进程号。
- **开发形态的脚本在生产形态下的差别：** `FEMA_DEV_CONNECTORS` 不设（镜像里的连接器全部加载）、没有种子账号 `dev@ap.com`（先走向导或 `sign-up` 加 `complete-sign-up`）、限流按连接地址计数而不是读不到的代理头、弱密钥在外部 Postgres 下直接拒绝启动。
- **起脚本里 `cd 目录 && 命令 &` 的 `$!` 是整个与列表的子 shell，不是 node。** 记下这个 pid 再 kill，node 还活着继续领作业；记 pid 要先 `cd` 再单独起命令。残留的旧工作节点会抢走新栈的作业并在没有连接器时失败，表现为莫名的 `TRIGGER_UPDATE_STATUS` 和 `Worker did not respond within the safety timeout`。
- **Node 的 fetch 会复用连到旧进程的长连接，服务重启后的第一个请求报 `ECONNRESET`。** 重启后的脚本先轮询 `/health`（捕获异常）再发业务请求。
- **同时跑编译或别的重活会让轮询类检查超时。** 主线脚本里按分钟轮询的步骤（离职那一步等 240 秒）在机器同时在构建时失败过一次，单独重跑通过；跑主线时别并行做别的。
- **主线的模拟服务和脚本要和被验证的连接器是同一个提交。** 别的代理改北森或飞书连接器时模拟服务和主线脚本会一起改，用构建副本里的那份（`E2E_MOCK_SCRIPT=<副本>/tools/e2e/main-line/mock-server.mjs`）才和构建产物一致。
