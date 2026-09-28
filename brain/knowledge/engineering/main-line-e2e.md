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
- **api 和 worker 的 `bootstrap.ts` 会用 dotenv 加载 `.env.dev`。** 在 shell 里 `unset FEMA_DEV_CONNECTORS` 没用，它会被 `.env.dev` 那份开发名单补回来（名单里没有北森和飞书），表现为建连接时报 `connector_metadata_not_found`。要么显式列全，要么用镜像验证「不设变量即全部内置」这条路径。
- **步骤引用要带 `['output']`**，例如 `{{trigger['output']['DepartmentName']}}`，漏了会解析成空字符串，映射表查找报 `"" is not in mapping table`。
- **发布后要等触发器启用完再写入变动。** 触发器启用是异步的，启用时记下的轮询起点晚于已有的变动，启用前的变动不会被处理，这是预期行为。
- **本机开发服务也跑在同一仓库**（3000/4200 端口），不要用 `pkill -f` 按入口文件匹配，会连用户的开发 API 一起杀掉，turbo 再把 vite 也停了。
- **自托管实例有租户后注册仅限邀请**（`INVITATION_ONLY_SIGN_UP`），重跑要么清空 PGLITE 目录，要么用已有账号登录。
