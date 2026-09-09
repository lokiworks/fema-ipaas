---
icon: 🏢
---

# Platform & Editions (EE)

> **历史资料。** 本仓库已删除整个 Edition 体系（见
> [decisions/000030](../decisions/000030-this-fork-has-no-editions-the-ee-pages-are-history.md)）。
> 本区所有页面描述的是上游 FEMA Integration Platform 的设计，不是本仓库的现状。
> `TenantPlan` 的 22 个功能开关也已删除，现在只剩容量上限
> （`usersLimit` / `workspacesLimit` / `activeWorkflowsLimit` / `workerGroupId`）。

How FEMA Integration Platform' tenancy (Platform → Project) and Community/Enterprise split work. Rule of thumb: CE never imports `src/app/ee/`; CE declares hook interfaces via `hooksFactory.create<T>(ceDefault)`, EE injects the real impl via `.set(eeImpl)` in the `app.ts` edition switch. Plan flags and numeric limits on `PlatformPlan` — projected from the platform's Autumn billing customer — gate features per-endpoint with `platformMustHaveFeatureEnabled()` (HTTP 402).

### Platform (CE)
Top-level tenant namespace; every install has ≥1. Owns branding (logos, theme colors, favicon), auth config (email toggle, allowed domains, SSO providers), pinned connectors, and connector-selector tab layout. Entity `platform`; `platformService` (create/update, `getOneWithPlanAndUsageOrThrow`). Endpoints under `/v1/platforms/:id`. Gotcha: sensitive SSO/SAML secrets stripped → `PlatformWithoutSensitiveData`; SAML config change invalidates the SAML client cache; DELETE is Cloud-only (async hard-delete job). All editions.

### Project (CE)
Workspace inside a platform holding workflows, connections, tables. `PERSONAL` (auto-created per user) or `TEAM` (EE). Always scoped by `platformId`; soft-delete via `deleted`. `projectService`; entity `project`. Gotcha: `projectHooks.postCreate` is the CE→EE seam — EE creates the `ProjectPlan`, sets connector filters, subscribes alert receiver. `externalId` maps projects to an embedder's own IDs.

### EE Overview
All commercial modules live under `src/app/ee/`, registered only for EE/Cloud in the `app.ts` edition switch (~lines 247-317). 30+ modules (audit-logs, api-keys, SSO/SCIM, secret-managers, global-connections, signing-key, managed-authn, project-members/roles/releases, billing…). Gate a new feature: add flag to `PlatformPlan`, guard with `platformMustHaveFeatureEnabled()`, register in `app.ts`, and if extending CE use the hooksFactory `.set()` pattern.

### EE Platform (billing / plan)
`PlatformPlan` = one-per-platform record: all feature flags + numeric limits (`activeWorkflowsLimit`, `projectsLimit`, numeric `billedTeamProjectsLimit`, `usersLimit`, `scheduledUsersLimit`, `includedCredits`) projected from the platform's **Autumn** billing customer, plus the Autumn credentials (`autumnCustomerId` + scoped `autumnApiKey`, entity-only). CE = `OPEN_SOURCE_PLAN` (unbilled, no Autumn customer); EE + Cloud enroll as Autumn customers (Cloud free tier = `AUTUMN_FREE_PLAN`). apCredits (workflow runs + AI steps + chat) are metered to Autumn via `track`; `checkActiveWorkflowsExceededLimit()` throws `QUOTA_EXCEEDED` (402), skipped in CE. Cloud-only admin endpoints under `/v1/admin/*` (API_KEY auth). Deep detail in EE Platform (Plans & Billing).

### EE Projects (team / RBAC / releases)
Adds members, roles, git-sync releases, per-project connector sets on top of CE projects. RBAC: `rbacService.assertPrincipalAccessToProject()` branches by principal (USER→member role, ENGINE→projectId match, SERVICE→platform match). 3 default roles (ADMIN/EDITOR/VIEWER) + custom roles (`customRolesEnabled`) over 26 permissions. `ProjectRelease` (GIT_BRANCH/MANUAL/ROLLBACK) diffs then applies state atomically under a memory lock; gated by `environmentsEnabled`. Optional `workerGroupId` routes a project's workflow jobs to a dedicated worker pool (`workerGroupsEnabled`).

### Embed / Signing Keys
Platform admin configures embedded workflows at `/platform/security/embed` (Cloud: 4 steps incl. Cloudflare hostname + DNS; CE/EE: 2 steps). Core is RSA-4096 signing keys (`/v1/signing-keys`, platform-admin only): private key returned exactly once, only public key stored. Vendor signs JWTs (RS256, `kid` = key id); AP verifies on `POST /v1/managed-authn/external-token`. `platform.allowedEmbedOrigins`, merged with the `FEMA_ALLOWED_EMBED_ORIGINS` env list, drives the CSP `frame-ancestors` header. Gated by `plan.embeddingEnabled`.
- *Avoid:* `allowedEmbedDomains` — the old field name, gone.

### License Keys
Activation/recovery handle for a self-hosted platform's Autumn billing identity — an opaque string, not a bundle of feature flags. `POST /v1/platform-billing/activate` delegates to the FEMA Integration Platform console, which resolves the key to an Autumn customer (creating one if needed), attaches the plan, and returns scoped credentials; entitlements then project from Autumn, never from the key itself. The legacy path (public `/v1/license-keys/*` endpoints, `secrets.fema.local` verification, `applyLimits()`, the daily `TRIAL_TRACKER` job) was deleted when billing moved to Autumn.

### Seats (billing language)
- **Seat** — a platform User slot; the user-facing term for the `users`/`usersLimit` billing dimension. A seat is consumed by an **active** User (deactivated users free it) OR **reserved** by a non-expired invitation to a not-yet-existing platform user (GitHub model — reserved at invite time, not at accept; the two are mutually exclusive). `usedSeats = active Users + distinct reserved invites` (decision 000014). *Avoid:* license, user license.
- **effectiveUsersLimit** — `min(usersLimit, scheduledUsersLimit)`; the limit seat-consuming operations actually enforce (helper in `platform-plan.service.ts`).
- **Seat floor (active-user floor)** — a seat-lowering action (plan downgrade or seat decrease) cannot set `usersLimit` below the current `usedSeats`; enforced at request time, DB-authoritatively (decision 000013). To go lower the admin deactivates users and/or revokes pending invites; only the owner is protected, so the minimum is 1. *Avoid:* seat limit (that is `usersLimit`); there is no seat overage — the floor blocks instead.
- **Scheduled seat cap** — the seat allotment of a pending scheduled plan change (paid→paid downgrade or cancel-to-Free, applying at period end), projected onto `scheduledUsersLimit` by the entitlement sync — never set at initiation. While pending, seat operations enforce `min(usersLimit, scheduled cap)` so a platform can't re-inflate before the switch lands (decision 000017); lifted by reactivating or when the switch applies. The floor guards the moment a lower limit is *requested*; the cap guards the *window* until it takes effect.
- **Top-up** — a purchase raising a billable quantity beyond the plan's base: **consumable** (AI credits — additive one-time balance) vs **unconsumable** (seats — recurring prepaid add-on set to a target total). *Avoid:* add-on (ambiguous), upgrade (that's a plan switch).

## Pages

- **Projects** — the workspace unit; personal vs team
- **Users** — platform membership and roles
- **User Invitations** — JWT invites, auto-accept for existing users, pending invites reserve seats
- **Platform Configuration** — branding, domains, settings
- **EE Overview** — what the enterprise layer adds
- **EE Platform (Plans & Billing)** — PlatformPlan flags, quotas, billing
- **EE Projects & RBAC** — ProjectRole and the 26 permissions
- **License Keys** — activating self-hosted EE
- **Embed** — signing keys, external tokens, the Cloudflare subdomain, and the frame-ancestors CSP
- **Platform Copilot** — retired; kept for the migration trail

## Gotchas
- **Encryption key rotation was reachable only from a browser, and had no button.** `POST /v1/encryption/rotate` is `tenantAdminOnly([PrincipalType.USER])` — an API key cannot call it — yet nothing in the UI did either, so after changing `FEMA_ENCRYPTION_KEY` existing connections and variables silently stayed on the old key. It is now 安全 → 加密 (`/tenant/security/encryption`). The operation is idempotent: `rotateTable` skips rows already encrypted with the current key and reports scanned/rotated/failed per table, which is why a confirm dialog plus a result toast is enough.

- **The Platform→Tenant rename corrupted the product's own name.** Fourteen files carried `FEMA Integration Tenant`, including the default white-label `websiteName` in `flags/theme.ts` (shown on the public form page), the email fallback sender name, the browser tab title and the OpenAPI title. The product is `FEMA Integration Platform`. When renaming an entity whose name is also a word in the product name, exclude the product name from the sweep first.
- **A project could be given members but never gain one.** Nothing in the UI sent an invitation — the members panel listed and edited roles only, while `POST /v1/user-invitations` worked fine. The panel now has an invite dialog (email + role) and a pending-invitations section with revoke, on top of `userInvitationMutations.useInviteToProject` / `useRevokeInvitation`. `useInvitations` also had to start passing `projectId`, or it listed every project's invitations.

- **The billing vocabulary is now fully gone; here is what it looked like so it is recognisable if it returns.** `QUOTA_EXCEEDED` (run status + `ErrorCode` + a `PAYMENT_REQUIRED` mapping), `createQuotaExceededRun` and its trigger-log helper, `TenantUsageMetric`, `BILLING_USAGE_REPORT`, `countReservedSeats` / `countAdditionalSeatsNeeded`, and an unused `CircularProgress` usage gauge. Every entry point sat behind a hardcoded `const creditsExhausted = false`, so nothing was reachable. `execution.status` is a `varchar` and no row carried the value, so no migration was needed — check that before assuming an enum removal is expensive.
- **`Tenant.plan` is `Tenant.limits`, and `TenantPlan`/`TenantPlanLimits` collapsed into `TenantLimits`.** `TenantPlan` carried `BaseModelSchema` and a `tenantId`, describing a `tenant_plan` table that does not exist. `SYSTEM_LIMITS` is unchanged and is still the right home for instance-wide caps.
- **A per-project active-workflow cap was pure UI.** The project settings form collected `activeWorkflowsLimit`, but the update request never sent it and the `project` table has no such column, so the value evaporated on save. Removed rather than implemented — adding it back means a migration plus server-side enforcement, not just a form field.
- **`docs/openapi.json` is generated but had no generator wired up, so it had drifted a whole rename behind.** It still described `/v1/workspaces` (277 `workspace` hits) long after the code moved to Project. The running API serves the live spec at `GET /v1/docs`; regenerating from it fixed the drift in one step and matched path and schema counts exactly. Worth regenerating whenever routes or shared schemas change.
- **When purging a word from docs, separate the product name and third-party terms from the stale entity.** Of 264 `Platform` hits in `docs/**/*.mdx`, most were the product's own name (`FEMA Integration Platform`) and only `Platform Admin` was the renamed entity. Likewise `workspace` survives legitimately for npm/bun workspaces, Slack workspaces and BetterStack — a blind replace would have broken all of them.

- **Project members were fully built and switched off by one hardcoded flag.** `flag.service.ts` served `SHOW_PROJECT_MEMBERS: false`, and the header additionally read `const activeProjectMembers = undefined as …`, so the member count and the settings tab could never appear even though the entity, service, controller, roles, invitation flow and UI panel all worked. Both were EE residue; `.claude/rules/no-editions.md` treats a hardcoded gate like this as a bug, so the flag is gone and the count now comes from `projectMembersHooks.useMembers`.
- **A project invitation silently ignored the role the admin picked.** `getProjectRoleAndAssertIfFound` returned `null` from both branches despite its name, so every invitation stored `projectRoleId: null`, and `toProjectRole(null)` on acceptance fell back to `VIEWER`. Inviting a Developer produced a read-only member with no error anywhere. It now validates against `DefaultProjectRole` and rejects an unknown role with the valid list in the message. Project invitations are also TEAM-only — a PERSONAL project answers 403 `Operation is only allowed on team projects`.
- **`QUOTA_EXCEEDED` is dead billing residue.** Both callers of `createQuotaExceededRun` sit behind `const creditsExhausted = false`, so no run can ever reach that status, yet the UI still carries a user-facing string about the tenant running out of credits. Removing the status touches the shared enum, two services and any legacy rows, so it is worth deciding deliberately rather than deleting in passing.


- **「删掉 `packages/ee` 」不是一个能独立完成的步骤。** CE 的 `app.ts` 在 edition
  switch *之外* 无条件注册了一批 EE 模块——`platformProjectModule`、`userModule`、
  `alertsModule`、`billingUsageReportModule`，以及 `rbacMiddleware` 这个全局
  preHandler。另有 40 个 CE 文件直接 `import` `./ee/*`（`secretManagersService`、
  `projectMemberService`、`workerGroupService`、`emailService`…）。所以删除 EE 目录
  必须同时在核心里**重写**这些能力，而不只是拿掉 import。本仓库执行这一步时，
  project 模块、邮件服务、邀请流程、`verify-email` / `reset-password` 端点都是重写的。
- **EE 迁移创建的是核心表。** `src/app/ee/database/migrations` 里有 `add-platform`
  这类迁移，`platform` 表本身就是它建的。因此 EE 迁移不能单独删掉——本仓库的做法是
  把整条迁移链压缩成一个基线（`docs/adr/0011`）。
