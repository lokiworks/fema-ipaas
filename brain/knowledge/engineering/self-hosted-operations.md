---
icon: 🛠️
---

# 自托管运维页

管理后台「基础设施」下的两个页面，给运维看版本、升级步骤和备份命令。平台只展示和生成命令，**不执行升级也不执行备份**。

**系统与升级** —— 当前版本、更新检查、数据库和 Redis 版本、在线工作节点版本、可选服务状态、升级与回滚步骤（Compose / Helm）。接口 `GET /v1/health/overview`。
**诊断包** —— 不含密码、密钥、邮箱和业务数据的部署摘要 JSON，`GET /v1/health/diagnostics-bundle`。
**安装向导** —— 还没有任何账号时，`/sign-in` 和 `/` 都会跳到 `/setup`：环境检查、创建管理员、组织信息、可选服务、确认五步（`features/setup-wizard`），步骤写在地址的 `?step=` 里，所以刷新和后退都有效。最后一步才调 `sign-up` 和 `complete-sign-up`（带组织名称），账号和组织一次建好；确认页点两次也只建一个。
**安装检查** —— 向导第一步的数据来源：数据库、Redis、加密密钥、文件存储、数据目录可写、工作节点（`GET /v1/health/setup`，账号建好后只返回 `initialized: true`）。「访问地址」一项由浏览器对比当前地址和 `PUBLIC_URL` 标志。
**可选服务测试** —— 邮件、对象存储、连接器仓库、模板仓库都能「测试连接」：安装前走 `POST /v1/health/setup/service-check`（公开、限流、只验证不发信、账号建好后拒绝），安装后走 `POST /v1/health/services/check`（租户管理员，带收件人时真的发一封测试邮件）。
**平台设置清单** —— 管理后台项目页顶部，跟踪邀请成员、登录方式、定时备份、告警渠道、邮件服务五项，全部完成后隐藏。
**备份与恢复** —— 按当前部署生成 `pg_dump` / `pg_restore` 命令、cron 行和加密密钥的备份方式。

## Gotchas
- 可选服务配置在环境变量里，没有界面保存配置；所谓「保存时校验」就是系统页的测试按钮和 `problem` 字段（端口不是数字、地址不是 http、同步模式为 NONE、最近一封邮件失败）。向导的草稿存在 sessionStorage，重启服务后保留，密码不保留。
- `FEMA_FRONTEND_URL` 没设时默认 `http://localhost:<端口>`，用别的地址打开时向导会警告；远程工作节点仍然必须显式设置。
- 注册不会联网：曾经生产环境注册会把邮箱 POST 给外部订阅接口，离线时卡十几秒，已删除。
- 向导依赖 AuthLanding 里一个只在挂载时取值的 `showWizard`，不要改成随标志变化：注册成功会让 `USER_CREATED` 变真，改了会让向导在建组织之前被卸载。
- 服务端日志里 `[mailSender#send] Failed to deliver email` 之前没有任何界面提示，现在最近一次结果记在进程内存里（多实例各自一份）。
- 平台不做备份：没有备份计划、备份列表和恢复预检，只有命令。要做需要先决定在镜像里带 pg_dump、备份目标和恢复流程。
- 「定时备份」平台探测不到（备份在服务器上跑），清单里只能由管理员手动标记，记在浏览器本地。
- 应用镜像里没有 PostgreSQL 客户端，备份命令在 postgres 容器里执行（Compose）或在能连数据库的机器上执行（Helm）。
- 加密密钥来源三种：`FEMA_ENCRYPTION_KEY` 环境变量；内存 Redis 模式下首次启动生成在 `CONFIG_PATH/settings.json`；两者都没有时显示错误。Helm 部署的密钥在 `fema-secrets` 的 `encryption-key`。
- 更新检查失败返回 `UpdateCheckStatus.FAILED`，页面给出代理和离线镜像的做法；不要把 `0.0.0` 当成真实版本。

## Key files
- `packages/server/api/src/app/health/system-overview.service.ts`
- `packages/web/src/features/system/` — `systemRunbook`
