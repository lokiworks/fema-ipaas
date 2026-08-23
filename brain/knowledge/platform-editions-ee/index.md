---
icon: 🏢
---

# Platform & Editions (EE)

> **历史资料。** 本仓库已删除整个 Edition 体系（见
> [decisions/000030](../decisions/000030-this-fork-has-no-editions-the-ee-pages-are-history.md)）。
> 本区所有页面描述的是上游 Activepieces 的设计，不是本仓库的现状。

How Activepieces' tenancy (Platform → Project) and Community/Enterprise split work. Rule of thumb: CE never imports `src/app/ee/`; CE declares hook interfaces via `hooksFactory.create<T>(ceDefault)`, EE injects the real impl via `.set(eeImpl)` in the `app.ts` edition switch. Plan flags and numeric limits on `PlatformPlan` — projected from the platform's Autumn billing customer — gate features per-endpoint with `platformMustHaveFeatureEnabled()` (HTTP 402).

### Platform (CE)
Top-level tenant namespace; every install has ≥1. Owns branding (logos, theme colors, favicon), auth config (email toggle, allowed domains, SSO providers), pinned pieces, and piece-selector tab layout. Entity `platform`; `platformService` (create/update, `getOneWithPlanAndUsageOrThrow`). Endpoints under `/v1/platforms/:id`. Gotcha: sensitive SSO/SAML secrets stripped → `PlatformWithoutSensitiveData`; SAML config change invalidates the SAML client cache; DELETE is Cloud-only (async hard-delete job). All editions.

### Project (CE)
Workspace inside a platform holding flows, connections, tables. `PERSONAL` (auto-created per user) or `TEAM` (EE). Always scoped by `platformId`; soft-delete via `deleted`. `projectService`; entity `project`. Gotcha: `projectHooks.postCreate` is the CE→EE seam — EE creates the `ProjectPlan`, sets piece filters, subscribes alert receiver. `externalId` maps projects to an embedder's own IDs.

### EE Overview
All commercial modules live under `src/app/ee/`, registered only for EE/Cloud in the `app.ts` edition switch (~lines 247-317). 30+ modules (audit-logs, api-keys, SSO/SCIM, secret-managers, global-connections, signing-key, managed-authn, project-members/roles/releases, billing…). Gate a new feature: add flag to `PlatformPlan`, guard with `platformMustHaveFeatureEnabled()`, register in `app.ts`, and if extending CE use the hooksFactory `.set()` pattern.

### EE Platform (billing / plan)
`PlatformPlan` = one-per-platform record: all feature flags + numeric limits (`activeFlowsLimit`, `projectsLimit`, numeric `billedTeamProjectsLimit`, `usersLimit`, `scheduledUsersLimit`, `includedCredits`) projected from the platform's **Autumn** billing customer, plus the Autumn credentials (`autumnCustomerId` + scoped `autumnApiKey`, entity-only). CE = `OPEN_SOURCE_PLAN` (unbilled, no Autumn customer); EE + Cloud enroll as Autumn customers (Cloud free tier = `AUTUMN_FREE_PLAN`). apCredits (flow runs + AI steps + chat) are metered to Autumn via `track`; `checkActiveFlowsExceededLimit()` throws `QUOTA_EXCEEDED` (402), skipped in CE. Cloud-only admin endpoints under `/v1/admin/*` (API_KEY auth). Deep detail in EE Platform (Plans & Billing).

### EE Projects (team / RBAC / releases)
Adds members, roles, git-sync releases, per-project piece sets on top of CE projects. RBAC: `rbacService.assertPrincipalAccessToProject()` branches by principal (USER→member role, ENGINE→projectId match, SERVICE→platform match). 3 default roles (ADMIN/EDITOR/VIEWER) + custom roles (`customRolesEnabled`) over 26 permissions. `ProjectRelease` (GIT_BRANCH/MANUAL/ROLLBACK) diffs then applies state atomically under a memory lock; gated by `environmentsEnabled`. Optional `workerGroupId` routes a project's flow jobs to a dedicated worker pool (`workerGroupsEnabled`).

### Embed / Signing Keys
Platform admin configures embedded workflows at `/platform/security/embed` (Cloud: 4 steps incl. Cloudflare hostname + DNS; CE/EE: 2 steps). Core is RSA-4096 signing keys (`/v1/signing-keys`, platform-admin only): private key returned exactly once, only public key stored. Vendor signs JWTs (RS256, `kid` = key id); AP verifies on `POST /v1/managed-authn/external-token`. `platform.allowedEmbedOrigins`, merged with the `FEMA_ALLOWED_EMBED_ORIGINS` env list, drives the CSP `frame-ancestors` header. Gated by `plan.embeddingEnabled`.
- *Avoid:* `allowedEmbedDomains` — the old field name, gone.

### License Keys
Activation/recovery handle for a self-hosted platform's Autumn billing identity — an opaque string, not a bundle of feature flags. `POST /v1/platform-billing/activate` delegates to the Activepieces console, which resolves the key to an Autumn customer (creating one if needed), attaches the plan, and returns scoped credentials; entitlements then project from Autumn, never from the key itself. The legacy path (public `/v1/license-keys/*` endpoints, `secrets.activepieces.com` verification, `applyLimits()`, the daily `TRIAL_TRACKER` job) was deleted when billing moved to Autumn.

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
