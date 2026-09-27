---
icon: 🛠️
---

# 自托管运维页

管理后台「基础设施」下的两个页面，给运维看版本、升级步骤和备份命令。平台只展示和生成命令，**不执行升级也不执行备份**。

**系统与升级** —— 当前版本、更新检查、数据库和 Redis 版本、在线工作节点版本、可选服务状态、升级与回滚步骤（Compose / Helm）。接口 `GET /v1/health/overview`。
**诊断包** —— 不含密码、密钥、邮箱和业务数据的部署摘要 JSON，`GET /v1/health/diagnostics-bundle`。
**安装检查** —— 还没有任何账号时，注册页旁显示数据库、Redis、加密密钥、文件存储、工作节点和可选服务的状态（`GET /v1/health/setup`，账号建好后只返回 `initialized: true`）。
**平台设置清单** —— 管理后台项目页顶部，跟踪邀请成员、登录方式、定时备份、告警渠道、邮件服务五项，全部完成后隐藏。
**备份与恢复** —— 按当前部署生成 `pg_dump` / `pg_restore` 命令、cron 行和加密密钥的备份方式。

## Gotchas
- 「定时备份」平台探测不到（备份在服务器上跑），清单里只能由管理员手动标记，记在浏览器本地。
- 应用镜像里没有 PostgreSQL 客户端，备份命令在 postgres 容器里执行（Compose）或在能连数据库的机器上执行（Helm）。
- 加密密钥来源三种：`FEMA_ENCRYPTION_KEY` 环境变量；内存 Redis 模式下首次启动生成在 `CONFIG_PATH/settings.json`；两者都没有时显示错误。Helm 部署的密钥在 `fema-secrets` 的 `encryption-key`。
- 更新检查失败返回 `UpdateCheckStatus.FAILED`，页面给出代理和离线镜像的做法；不要把 `0.0.0` 当成真实版本。

## Key files
- `packages/server/api/src/app/health/system-overview.service.ts`
- `packages/web/src/features/system/` — `systemRunbook`
