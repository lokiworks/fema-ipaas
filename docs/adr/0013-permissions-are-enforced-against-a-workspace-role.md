---
title: 权限在工作空间角色上强制执行，成员关系是访问前提
icon: 🔐
status: accepted
---

## Decision

`Permission` 从「路由上的声明」变成「真正被检查的约束」：
`assertAccessToWorkspace` 拿路由声明的 permission 去比对调用者的工作空间角色，不匹配即拒绝。

权限词表改为设计文档 §20 的 `RESOURCE:ACTION` 形式（`WORKFLOW:READ`、`CONNECTION:MANAGE`），
角色收敛为四个：Admin、Developer、Operator、Viewer（System Admin 是租户级的 `TenantRole.ADMIN`，不重复建模）。

访问工作空间的三条路径：**owner**、**租户管理员**、**`workspace_member` 表里有一行**。
除此之外一律拒绝。

## Context

每条路由早就在 `securityAccess.workspace(..., Permission.X, ...)` 里声明了权限，
`authorization-middleware` 也把它传进了授权配置 —— 但 `assertAccessToWorkspace` 只校验了
「这个人属于这个租户的这个工作空间吗」，从没读过 permission 字段。

结果是：只要能进工作空间，就拥有里面的一切。前端 `checkAccess` 当时直接 `return true`，
两端一致地什么都不拦。声明存在、执行缺席，比没有声明更危险 —— 它让每个读代码的人以为权限已经生效。

上游把这套 RBAC 放在 EE 里，删 EE 时连执行逻辑一起删掉了，只留下了声明。

## Why

权限点已经标注在每条路由上，这是最贵的部分，且已经做完了。缺的只是比对那一步。
选择在 `assertAccessToWorkspace` 里做，而不是在每个 service 里做：它是所有工作空间路由的唯一必经之处，
补一处就全覆盖，漏一个 service 不会造成缺口。

拒绝的替代方案是「继续放开，等完整 RBAC 产品化」—— 但那意味着已经写好的权限声明持续说谎，
而且越晚打开影响面越大。**fail closed** 现在只影响「非 owner、非租户管理员、且没有成员行」的用户，
这类用户在当前代码里本来就拿不到有意义的隔离。

`workspace_member` 是新表而不是复用 `user_invitation`：邀请是一次性事件且会过期，
成员关系是持续状态。之前 `provisionUserInvitation` 的 WORKSPACE 分支是个空 `break` ——
邀请被标记为已接受，却不授予任何东西。现在它写入成员行。

## Consequences

- 破坏性变更：非 owner、非租户管理员且无成员行的用户会被拒绝，需要显式加入。已记入 `docs/install/reference/breaking-changes.mdx`。
- 存储过旧 `READ_WORKFLOW` 形式权限字符串的 API 消费方需要迁移到 `WORKFLOW:READ`。
- 角色是硬编码的四个，不是数据库里的自定义角色表。自定义角色需要时再加，届时 `rolePermissions` 变成兜底默认值而非唯一来源。
- 角色阶梯（Viewer ⊂ Operator ⊂ Developer ⊂ Admin）由 `packages/core/shared/test/authentication/access-control-list.test.ts` 钉住，改动会失败。
