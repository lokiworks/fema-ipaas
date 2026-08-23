---
icon: 🎭
---

# E2E Tests & Monitors

One Playwright suite in `packages/tests-e2e` feeds three consumers that fail independently: CI on a fresh throwaway instance, Checkly monitors against **production Cloud**, and a single BetterStack monitor. A change that only breaks one of them looks green everywhere else, so it is worth knowing which reads what.

**Local / CI suite** — `playwright.config.ts`, `testMatch: **/*.spec.ts`, split by `FEMA_EDITION` into `scenarios/ce` and `scenarios/ee`. Boots the whole stack itself via the `webServer` block.
**Checkly monitors** — `checkly.config.ts` picks up the *same* `**/scenarios/**/*.spec.ts` files and runs them every 10 minutes with `baseURL: https://github.com/lokiworks/fema-ipaas`, signing in with `E2E_EMAIL` / `E2E_PASSWORD`.
**BetterStack monitor** — one standalone file, `scenarios/betterstack/*.flat.spec.js`.

## Gotchas

- **单元测试里出现公网 URL，先怀疑它其实是集成测试。** engine 有四个 `.test.ts` 长得像
  单测，实际在断言上游厂商生产 API 的具体行为：404 的 JSON 报文
  (`{statusCode,error,message:'Route not found'}`)、CDN 上某个 SVG 的文件名。
  这类测试在 fork 之后无法靠"换个 URL"救活，只能换成本地夹具
  (`packages/server/engine/test/fixture-server.ts` + vitest `globalSetup`)。
  同一批里还有一个用 `https://google.com` 断言下载到 HTML 的用例——它在上游就已经挂了，
  因为 google.com 改成返回 301 了。**打公网的测试早晚会因为别人改动而红。**


- **Checkly runs the shared specs against production Cloud**, so anything the page objects assume about the login screen has to hold on Cloud too — not just on the SMTP-less instance CI boots. This is the usual reason a UI change breaks the monitors but not CI. See the auth-card gotchas on [CE Authentication](../connections-auth/ce-authentication.md).
- **BetterStack does not read the repo — the repo pushes to it.** `.github/workflows/sync-betterstack-playwright.yml` fires on push to `main` and `PATCH`es the file's contents into the hardcoded monitor `4211060` as `playwright_script`. One-way and `main`-only: the monitor updates at *merge*, never on the PR, and any edit made in the BetterStack UI is silently overwritten by the next push.
- **The BetterStack file is deliberately flat and duplicated.** BetterStack executes one self-contained script, so it cannot `require` the `pages/` objects — its sign-in is a copy. Fix the page object and you have *not* fixed the monitor; both files need the change.
- **The `.flat.spec.js` runs nowhere else.** Playwright matches `*.spec.ts`, so a broken flat file is invisible locally and in CI until it fails in BetterStack.
- **CI only runs on the `ready-for-e2e` label** (`e2e.yml` gates the suite on it), which is why the suite can rot for weeks without anyone noticing.
- **Turbo strict env mode silently strips most of `.env.e2e`.** `globalPassThroughEnv` in `turbo.json` is an allow-list, so vars not named there never reach the `serve` tasks — verify with `tr '\0' '\n' < /proc/<api-pid>/environ`. `FEMA_ENVIRONMENT` is among the casualties, so CI falls back to the `prod` default. Widening it to `AP_*` does forward them, but that alone broke worker→API Socket.IO auth (jobs queue up unconsumed), so the passthrough and the worker's `FEMA_WORKER_TOKEN` have to be sorted out together.
- **`FEMA_DEV_CONNECTORS` loads from `packages/connectors/**/dist`, which `npm run dev` does not build.** Only connectors that happen to be build dependencies of api/worker have a `dist`, so a default dev instance serves **0 connectors** and every spec that picks a trigger times out on the connector search. Build them explicitly: `npx turbo run build --filter=@fema-ipaas/connector-webhook --filter=@fema-ipaas/connector-store`.
- **Sign-up is invitation-only once a platform exists** (`INVITATION_ONLY_SIGN_UP`), so the suite's sign-up path only works on a genuinely fresh instance. Against a dev-seeded database, set `E2E_EMAIL` / `E2E_PASSWORD` instead — `global-setup.ts` prefers them and signs in rather than signing up.
- **Every workspace declares its own deps.** `@faker-js/faker` was imported by the page objects for months while only `server/api` declared it; under Bun's isolated linker that means the suite cannot import its own page objects at all.

## Key files
- `packages/tests-e2e` — `playwright.config.ts` (local/CI), `global-setup.ts` (provisions or signs in the seed account), `pages/` (shared page objects), `scenarios/betterstack/` (the standalone monitor script)
- `.github/workflows/e2e.yml` — the `ready-for-e2e` gate that calls the suite
- `.github/workflows/sync-betterstack-playwright.yml` — the push-to-`main` upload
