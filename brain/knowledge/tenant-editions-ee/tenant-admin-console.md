---
icon: 🛠️
---

# 管理后台

租户管理员的后台（`/tenant/*`）。本页写的是本仓库的现状，不是上游。

**平台角色** — 所有者 = `tenant.ownerId`；管理员 = `TenantRole.ADMIN`；成员 = `MEMBER`，`OPERATOR` 仍保留为「运维」。_Avoid_：给所有者单独建角色。
**模块权限** — `TenantModule`：业务集成（人人都有）、连接器开发、MCP 服务、平台管理。前两个可分配的存在 `user.modules`（邀请时存在 `user_invitation.modules`，接受邀请时写进用户）；平台管理不单独存，等于 ADMIN 角色；管理员拥有全部模块。
**模块守卫** — `tenantModuleGuard.requireModule` 挂在插件的 `preHandler` 上：连接器蓝图、OpenAPI 导入要「连接器开发」，`/v1/mcp-services` 要「MCP 服务」。项目权限照旧在 `securityAccess.project` 里判，两层都满足才放行。
**无权限提示** — `tenant.moduleAccessSettings`：联系管理员 / 指定人 / 网址 / 申请入口。前端 `ModuleGate` 按 `/v1/tenant-access/me` 渲染。
**权限申请** — `module_access_request` 表，待审核 / 已同意 / 已拒绝，只在平台内审核；飞书审批没有做。
**待激活** — 就是还没被接受的租户邀请，不是用户表里的状态。
**集成资源转移** — `ownedResourcesService.transfer`：工作流、连接、MCP 服务、数据存储、项目。自定义连接器（`connector_blueprint`）没有所有者，不参与。
**登录与安全** — 六种登录方式按固定顺序展示：邮箱和密码、OIDC、飞书可用，SAML（构建里被关掉）、企业微信、钉钉没有实现，显示「暂不可用」。`tenant.passwordMinLength`（8–64，默认 10）在注册和重置密码时校验；`tenant.sessionDurationDays`（1/7/30）决定密码登录和单点登录签发的 JWT 有效期。
**单点登录** — 配置存在 `tenant.federatedAuthProviders` 的 `oidc` / `feishu` 两个键里（jsonb，不需要迁移），密钥用 `encryptUtils` 加密，读取接口只返回 `hasClientSecret`。流程在 `packages/server/api/src/app/sso`：`/v1/authn/sso/start` 跳身份提供方，`/callback` 校验后发 60 秒一次性票据，SPA 在 `/sso/complete` 用 `/exchange` 换会话。_Avoid_：把令牌放进回调地址。
**测试登录** — 管理员配置保存后必须在设置页点「测试登录」并用自己的公司账号走通，才能启用；改了颁发者、客户端、密钥、邮箱声明或飞书应用任何一项都要重测。**停用密码登录**（`emailAuthEnabled = false`）要求至少一个已启用且测试通过的单点登录方式，防止管理员把自己锁在外面。
**工作节点** — 列表来自 Redis 心跳：60 秒没心跳算离线，离线记录保留 24 小时；排空 = `workerMachines:drained` 里有这个 workerId，poll 时直接不给活。
**健康状态** — `GET /v1/health/components` 汇总十项；「备份」只是管理员手动登记的时间（flag `BACKUP_CONFIRMATION`），平台自己不备份。

## Gotchas

- **单点登录按「最早的租户」认租户。** 公开的 `/providers`、`/start` 和密码登录一样靠 `getTenantIdForRequest`，同一实例有多个租户时只有最早的租户能用单点登录；多租户按域名分流没有做。
- **回调用的是前端地址。** 重定向地址是 `FEMA_FRONTEND_URL` + `/api/v1/authn/sso/callback`，要原样登记在身份提供方；浏览器绑定 Cookie 的路径是 `/api/v1/authn/sso`，反向代理改了前缀就会收到 `BROWSER_MISMATCH`。
- **身份提供方要放行回环或内网地址时设 `FEMA_SSRF_ALLOW_LIST`。** 发现文档、密钥集、令牌端点都走 `safeHttp`。
- **保存配置时发现文档不走缓存，登录时缓存 5 分钟。** 管理员改了身份提供方后马上保存能立刻看到真实结果。
- **密码登录先查租户策略再验密码。** 否则停用密码登录之后，「密码对不对」仍能从错误码里探测出来。
- **租户品牌以前从没生效过。** `flagHooks` 是 EE 时代的注入点，删 EE 后没人 `set`，`THEME` flag 永远是 `defaultTheme`，外观页保存了也看不到。现在 `tenantBrandingFlags.install()` 按请求所属租户（匿名请求取最早的租户）生成主题，并带上 `welcomeText`。
- **工作节点令牌不能做成一次性的。** 令牌是用 `FEMA_JWT_SECRET` 签的无状态 JWT，节点每次重连都要出示同一个；两小时过期的令牌会让节点在两小时后掉线。也没法单独吊销，只能换密钥全部作废。所以「添加节点」只给出 `npx @fema-ipaas/cli workers token` 和 docker 命令，不做注册隧道（见 ADR 0018）。
- **workerId 每次启动都会变。** 所以标签不能存在服务端按 workerId 记，只能由节点通过 `FEMA_WORKER_LABELS` 自己上报；重启后的节点在列表里是一条新记录，旧记录 24 小时后自动清掉。
- **排空、恢复、移除只能在最早的租户里做。** 工作节点是整个实例共享的，其他租户的管理员动它会影响别人。
- **管理员重置密码会改全局的 `user_identity`。** 同一个身份如果还属于别的租户就拒绝，否则等于替别的租户改了密码。
- **移除用户会软删他的个人项目。** 所以移除前的资源转移会把个人项目改成团队项目再转给接收人，不然里面的工作流会跟着被删。
- **已软删的项目仍占着 `project.ownerId`。** 用户自己删过项目后再移除他，会撞上外键 `fk_project_owner_id`；`countOwnedBy` 不数已删项目，所以删用户前由 `deletePersonalProjectForUser` 把他名下已软删的项目改归租户所有者。
- **加密算法是 AES-256-CBC，不是设计文档写的 GCM。** 页面如实显示；「密钥已用多少天」是平台第一次看到这个 keyId 的时间（flag `ENCRYPTION_KEY_OBSERVATION`），不是密钥真正生成的时间。

## Key files

- `packages/server/api/src/app/tenant-access` — `tenantAccessController`、`tenantModuleGuard`、`ownedResourcesService`
- `packages/server/api/src/app/workers/machine` — `workerFleetService`
- `packages/server/api/src/app/health` — `componentHealthService`
- `packages/web/src/features/tenant-access` — `ModuleGate`、`tenantAccessHooks`
- `packages/web/src/app/routes/tenant` — 各页面
