---
icon: 🛠️
---

# 管理后台

租户管理员的后台（`/tenant/*`）。本页写的是本仓库的现状，不是上游。

**运营后台** — `/operator/*`，只给实例运营者（`user_identity.instanceRole = OPERATOR`，前端读 `/v1/users/:id` 的 `instanceRole`）：租户列表与详情（停用、恢复、上限、改登录地址）、平台调用方、实例设置（自助注册、人机验证、短信、平台登录应用）、运营者名单。工作节点、健康、备份入口只对运营者显示。_Avoid_：再叫「最早的租户」或「主租户」。
**平台角色** — 所有者 = `tenant.ownerId`；管理员 = `TenantRole.ADMIN`；成员 = `MEMBER`，`OPERATOR` 仍保留为「运维」。_Avoid_：给所有者单独建角色。
**模块权限** — `TenantModule`：业务集成（人人都有）、连接器开发、MCP 服务、平台管理。前两个可分配的存在 `user.modules`（邀请时存在 `user_invitation.modules`，接受邀请时写进用户）；平台管理不单独存，等于 ADMIN 角色；管理员拥有全部模块。
**模块守卫** — `tenantModuleGuard.requireModule` 挂在插件的 `preHandler` 上：连接器蓝图、OpenAPI 导入要「连接器开发」，`/v1/mcp-services` 要「MCP 服务」。项目权限照旧在 `securityAccess.project` 里判，两层都满足才放行。
**无权限提示** — `tenant.moduleAccessSettings`：联系管理员 / 指定人 / 网址 / 申请入口。前端 `ModuleGate` 按 `/v1/tenant-access/me` 渲染。
**权限申请** — `module_access_request` 表，待审核 / 已同意 / 已拒绝，只在平台内审核；飞书审批没有做。
**待激活** — 还没被接受的租户邀请，或从成员名录选中、还没首次登录的预绑（成员列表里 `kind: BINDING`），都不是用户表里的状态。
**成员名录** — 身份源里这家租户的成员，用这家的集成服务应用经 fema `POST /iam-identity/member/find-all` 实时读，不落库；只在 `matchBy=SUBJECT` 且有 `oidc.memberSubscription` 的租户出现，见决定 000049。_Avoid_：「通讯录同步」（没有同步，只在选人时读）。
**集成资源转移** — `ownedResourcesService.transfer`：工作流、连接、MCP 服务、数据存储、项目。自定义连接器（`connector_blueprint`）没有所有者，不参与。
**登录与安全** — 六种登录方式按固定顺序展示：邮箱和密码、OIDC、飞书可用，SAML（构建里被关掉）、企业微信、钉钉没有实现，显示「暂不可用」。`tenant.passwordMinLength`（8–64，默认 10）在注册和重置密码时校验；`tenant.sessionDurationDays`（1/7/30）决定密码登录和单点登录签发的 JWT 有效期。
**单点登录** — 配置存在 `tenant.federatedAuthProviders` 的 `oidc` / `feishu` 两个键里（jsonb，不需要迁移），密钥用 `encryptUtils` 加密，读取接口只返回 `hasClientSecret`。流程在 `packages/server/api/src/app/sso`：`/v1/authn/sso/start` 跳身份提供方，`/callback` 校验后发 60 秒一次性票据，SPA 在 `/sso/complete` 用 `/exchange` 换会话。_Avoid_：把令牌放进回调地址。
**测试登录** — 管理员配置保存后必须在设置页点「测试登录」并用自己的公司账号走通，才能启用；改了颁发者、客户端、密钥、邮箱声明或飞书应用任何一项都要重测。**停用密码登录**（`emailAuthEnabled = false`）要求至少一个已启用且测试通过的单点登录方式，防止管理员把自己锁在外面。
**工作节点** — 列表来自 Redis 心跳：60 秒没心跳算离线，离线记录保留 24 小时；排空 = `workerMachines:drained` 里有这个 workerId，poll 时直接不给活。
**健康状态** — `GET /v1/health/components` 汇总十项；「备份」只是管理员手动登记的时间（flag `BACKUP_CONFIRMATION`），平台自己不备份。

## Gotchas
- **运营后台的权限只看 `instanceRole`，不看租户角色。** 租户管理员不是运营者；`OperatorLayout` 对非运营者直接跳回首页，侧栏和全局导航也不显示入口。
- **平台应用绑定和租户自建的 SSO 是两条路。** 单点登录页的「关联你的企业」只在实例配置了平台登录应用（`availablePlatformApps` 非空）时出现；`provisioned` 的 OIDC 只开放开关、按钮名称、准入规则和复核间隔，连接字段隐藏。
- **SAML 的 SP 信息在配置前就能拿到。** `SsoSettings.samlServiceProvider` 始终有值；`idpMetadataXml` 首次配置必填，已有配置留空表示保留原元数据。
- **平台开通（`provisioned`）的 OIDC 只锁连接参数。** 服务端拒绝改 issuer、客户端、密钥、scopes、emailClaim、匹配方式、附加参数；展示名、开关、复核间隔、准入规则（自动建用户、默认角色、允许域名、默认项目）仍可改，前端隐藏的是组到角色的映射和连接字段。
- **从名录加人只信 fema 的回答。** `POST /v1/tenant-access/members/directory/add` 先按 id 回 fema 复核（在这家名录里、状态 `ACTIVE`/`PENDING`），再按 issuer + 成员 ID 预绑角色和模块（`external_identity.prebindModules`），首次登录时 `sso-user-resolver` 建号并把模块写进 `user.modules`；已有绑定的跳过，所以重复加入是空操作。名录只能按显示名和用户名搜：fema 的成员名片不含手机号。名录读不到时返回 `memberDirectoryUnreachable`（409），不返回空页。
- **成员邀请里手机号不带区号按中国大陆补 +86。** 解析在 `tenantAccessUtils.parseContacts`，邀请请求的 `emails` 和 `phones` 至少一项非空。
- **连接总览和项目「连接」页用同一套列与详情抽屉**：列表接口 `listForTenant` 本来就带 `workflowIds`（被引用），行点开是 `ConnectionDetailSheet`；租户管理员的 `memberProjectIds` 是全部项目，所以详情能打开任何连接。

- **删除连接的审计事件要显式带项目**：`DELETE /v1/connections/:id` 请求里没有项目，事件会落成「平台级」；`connection.controller.ts` 用请求项目（若在连接的 `projectIds` 里）或连接的第一个项目作为审计范围，租户级连接仍记平台级。

- **健康状态按浏览器时区分日。** 「运行健康度」图表和 30 天健康条用请求里的 `timezone`（与运行监控同一个 `runMonitorUtils.safeTimezone`）做 `AT TIME ZONE` 分组，报告缓存键也带时区；不传就按 UTC。
- **备份计划存的是服务器时区的星期和小时。** 备份页按浏览器时区换算后显示，保存时再换回去（`backupTime.shiftPlan`，跨零点时星期也会跟着变）；两个时区差不是整小时就退回显示服务器时区。
- **「项目与上限」已并入「项目」。** 上限列和「调整上限」在 `/tenant/projects`，旧路由 `/tenant/limits/projects` 重定向过去；租户级的人统一叫「成员」，「全部连接」改名「连接总览」以区别于「全局连接」。
- **未登录请求怎么认租户。** `getTenantIdForRequest` 依次看：令牌 → 头 `x-fema-tenant` / 查询参数 `tenant`（slug 或 id，认不出直接 404）→ 已验证的 HOST 域名或 `<slug>.FEMA_TENANT_BASE_DOMAIN` → 实例只有一个租户就取它 → `null`。不再落到最早的租户；`FEMA_TENANT_BASE_DOMAIN` 没设就没有子域名这一条。
- **单点登录按 `issuer + subject` 认人（`external_identity`），邮箱只是显示用。** `matchBy=SUBJECT`（fema-iam 开通的配置）的身份不写 `user_identity.email`，邮箱放 `contactEmail` 和绑定行；`matchBy=EMAIL` 才按邮箱关联并补建绑定。`EMAIL_MISSING` 只在「按邮箱匹配、没有绑定、又没拿到邮箱」时出现。代码在 `sso/sso-user-resolver.ts`、`federation/external-identity.service.ts`。
- **联邦会话 8 小时，另有定时复核。** `matchBy=SUBJECT` 的登录在 `redeemTicket` 里换成短会话；`federation-session-recheck` 每 5 分钟扫一遍，按租户的 `sessionRecheckMinutes`（默认 15）用刷新令牌向身份源复核，只有 `invalid_grant` 才停用，网络错误只记日志。刷新令牌只在身份源发现文档列出 `offline_access` 时才会拿到。
- **成员变动走 fema 的业务事件通道，不是 ipaas 自己的联邦事件接口。** 开通时（请求体 `memberEvents`）用租户的集成服务应用（`client_credentials` 带 `tenant`）调 fema 的 `POST /webhook/subscription/create`，订阅 `iam-identity.member.{suspend,activate,remove,restore}`，推送地址是 `POST /v1/federation/members/:tenantId`；订阅 id、`plainSecret`（加密）存在 `oidc.memberSubscription`。`code` 每次新生成且撤销后 fema 也不回收；登记不确定时按 code `find-one`、撤销、换新 code 重建；轮换密钥就是撤销重建（`memberEvents.rotateSecret`）。
- **收到成员推送不按事件类型改状态。** 验证请求（`webhook.verification`）不依赖已存密钥，原样回显 `challenge`；推送用 `plainSecret` 验原始请求体 HMAC，签名不对、事件不在四种之内、`tenantId` 不是该租户的 `externalTenantId` 都返回 2xx 丢弃；按事件 id 去重 24 小时；然后用集成服务应用读 `GET /iam-identity/member/find-by-id`，`ACTIVE` 或 `PENDING`（待激活，fema 的 `isInGoodStanding`）→启用绑定与用户，`SUSPENDED`、`REMOVED`、没找到→停用并吊销会话；状态字段是 fema 枚举序列化出的对象 `{"@type", "code", "name"}`，订阅的 `status`（要 `ENABLED` 且 `activatedAt` 非空才算生效）同样，也兼容裸字符串。读不到成员（fema 不可达、没有读权限、连接缺失）返回 5xx 并释放事件 id，让 fema 重推。租户停用不推送，靠刷新令牌的 `invalid_grant` 和换票的 `invalid_target` 兜底。
- **因复核或成员事件被停用的用户，再次经 fema-iam 登录成功会自动恢复。** `external_identity.status = REVOKED` 只会由联邦复核或成员事件写入，管理员手动停用只动用户行，所以登录时见到 REVOKED 就恢复绑定和用户，手动停用的仍然进不去。
- **SAML 的 ACS 是跨站 POST，拿不到 Lax 的浏览器绑定 Cookie。** 所以 ACS 只校验签名并把结果按 state 存进 Redis，再 303 回 `/callback`（顶层 GET，Cookie 才会带上）；请求 ID 由我们生成并记在 state 里，`node-saml` 用 `validateInResponseTo: always` 校验。暂不支持签名 AuthnRequest（没有 SP 证书）。
- **平台登录应用的配置存在 flag 表 `PLATFORM_LOGIN_CONFIG`（≤21 字符是 id 列的限制）。** 企业微信平台应用走服务商扫码（`get_provider_token` + `get_login_info`），`appId` 填服务商 corpid；对应的接口形状按官方文档实现，没有对真实服务验证过。
- **回调用的是前端地址。** 重定向地址是 `FEMA_FRONTEND_URL` + `/api/v1/authn/sso/callback`，要原样登记在身份提供方；浏览器绑定 Cookie 的路径是 `/api/v1/authn/sso`，反向代理改了前缀就会收到 `BROWSER_MISMATCH`。
- **身份提供方要放行回环或内网地址时设 `FEMA_SSRF_ALLOW_LIST`。** 发现文档、密钥集、令牌端点都走 `safeHttp`。
- **保存配置时发现文档不走缓存，登录时缓存 5 分钟。** 管理员改了身份提供方后马上保存能立刻看到真实结果。
- **密码登录先查租户策略再验密码。** 否则停用密码登录之后，「密码对不对」仍能从错误码里探测出来。
- **租户品牌以前从没生效过。** `flagHooks` 是 EE 时代的注入点，删 EE 后没人 `set`，`THEME` flag 永远是 `defaultTheme`，外观页保存了也看不到。现在 `tenantBrandingFlags.install()` 按请求所属租户（匿名请求取最早的租户）生成主题，并带上 `welcomeText`。
- **工作节点令牌不能做成一次性的。** 令牌是用 `FEMA_JWT_SECRET` 签的无状态 JWT，节点每次重连都要出示同一个；两小时过期的令牌会让节点在两小时后掉线。也没法单独吊销，只能换密钥全部作废。所以「添加节点」只给出 `npx @fema-ipaas/cli workers token` 和 docker 命令，不做注册隧道（见 ADR 0018）。
- **workerId 每次启动都会变。** 所以标签不能存在服务端按 workerId 记，只能由节点通过 `FEMA_WORKER_LABELS` 自己上报；重启后的节点在列表里是一条新记录，旧记录 24 小时后自动清掉。
- **排空、恢复、移除、备份、服务设置、密钥轮换只有实例运营者能做。** 判定是 `instanceOperator.assert`（身份的 `instanceRole === OPERATOR`），不再是「最早的租户」。备份记录和服务设置仍存在最早租户名下（`instanceScope`，只当存放锚点，不做授权），所以那个租户不要删。
- **停用租户靠 `tenantStatusGuard.assertActive`。** 状态在进程内缓存 5 秒，多台服务器之间最多滞后 5 秒；登录、换租户、令牌校验都要调它。
- **租户上限取租户行与 `SYSTEM_LIMITS` 中更严的。** 成员数数的是启用的用户，项目数只数团队项目，启用流程数按租户下未删项目里状态为 ENABLED 的流程；并发上限在 `rateLimiterInterceptor` 里和项目维度同时生效，不受 `PROJECT_RATE_LIMITER_ENABLED` 开关影响。租户的 `workerGroupId` 在项目没有自己的节点组时生效，缓存最多 5 分钟。
- **自助建租户的开关在 `createTenantWithProject` 里判。** 实例里还没有租户时放行；已有租户时要实例设置 `tenantSelfSignup` 为开，否则 `INVITATION_ONLY_SIGN_UP`。运营者建租户和平台开通走 `provisionTenant`，不经过这个开关。
- **平台用量的「启用流程数」靠按日快照。** 表 `tenant_usage_snapshot`（租户 + UTC 日期唯一）由每天 00:05 的系统任务写入，每次启用/停用流程后也会刷新当天的行。`GET /v1/platform/usage` 对当天用实时计数，快照开始之后的日子取不晚于该日的最近快照，之前的日子仍是「现在启用的流程里创建日不晚于该日」的近似值，响应里 `activeWorkflowsExact` 为 false；删除流程不触发快照，当天值最迟到次日 00:05 才更正。
- **平台加成员的通知规则。** 有邮箱且配置了 SMTP：走租户邀请（待接受的邀请在成员列表里是 `INVITED`，`notified: true`）；没配 SMTP 或只有手机号：直接建账号，`notified: false`，手机号成员不发短信（短信模板只有验证码一个变量），让用户用短信登录；按 subject 预绑定的联邦成员不发任何通知。已是成员的邮箱只改角色，不重复邀请。
- **平台接口的受信 issuer 只能操作 `externalIssuer` 与自己一致的租户。** API 密钥不受这个限制；密钥明文只在签发时返回一次，库里只存 sha256。
- **管理员重置密码会改全局的 `user_identity`。** 同一个身份如果还属于别的租户就拒绝，否则等于替别的租户改了密码。
- **移除用户会软删他的个人项目。** 所以移除前的资源转移会把个人项目改成团队项目再转给接收人，不然里面的工作流会跟着被删。
- **已软删的项目仍占着 `project.ownerId`。** 用户自己删过项目后再移除他，会撞上外键 `fk_project_owner_id`；`countOwnedBy` 不数已删项目，所以删用户前由 `deletePersonalProjectForUser` 把他名下已软删的项目改归租户所有者。
- **加密算法是 AES-256-CBC，不是设计文档写的 GCM。** 页面如实显示；「密钥已用多少天」是平台第一次看到这个 keyId 的时间（flag `ENCRYPTION_KEY_OBSERVATION`），不是密钥真正生成的时间。

## Key files

- `packages/server/api/src/app/tenant-access` — `tenantAccessController`、`tenantModuleGuard`、`ownedResourcesService`、`tenantDirectoryService`
- `packages/server/api/src/app/workers/machine` — `workerFleetService`
- `packages/server/api/src/app/health` — `componentHealthService`
- `packages/web/src/features/tenant-access` — `ModuleGate`、`tenantAccessHooks`
- `packages/web/src/app/routes/tenant` — 各页面
