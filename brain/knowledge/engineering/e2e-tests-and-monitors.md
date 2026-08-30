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

## Which suites `npm run test-unit` actually runs

`test-unit` runs the packages named in the root script's `--filter` list, then `turbo run test-unit --filter=api` as a second pass. Anything not in that list runs **nowhere**, which is how a broken safety check can sit red on main indefinitely — `@fema-ipaas/cli` had a failing `__dirname` bundler-guard test that nothing executed.

- `api` splits by folder, not by name: `test/unit` is infra-free and runs in the loop; `test/integration` needs Postgres and Redis and runs only under `npm run test-api`. A BullMQ or system-jobs test belongs in `integration` no matter how unit-like it looks — several lived in `test/unit` and failed on every run.
- After deleting a feature, delete its tests in the same change. Post-EE removal, `test/unit` still held suites for `ee/agent`, `knowledge-base`, `canary`, and agent step migrations, all importing modules that no longer existed.
- Deleting a connector package means removing it from `turbo.json` too. A stale `@fema-ipaas/connector-x#build` in a `dependsOn` array makes turbo fail the whole run with "Could not find package", which reads like a broken checkout rather than a stale reference.

## The API integration suite (`npm run test-api`)

`packages/server/api/test/integration` runs on PGlite (`FEMA_DB_TYPE=PGLITE` in `.env.tests`) and an
in-memory Redis (`FEMA_REDIS_TYPE=MEMORY`), so it needs no containers. `check-migrations` runs first
and is the step that proves the entities and the migrations still agree.

- **An unknown `FEMA_*` name in `.env.tests` is not an error — it is a silent default.** The file
  carried upstream-era names long after the rename (`FEMA_PIECES_SYNC_MODE`, `FEMA_DEV_PIECES`,
  `FEMA_EDITION`), which left `CONNECTORS_SYNC_MODE` on its `OFFICIAL_AUTO` default: the suite was
  reaching for the connector registry over the network on every run. When you rename a system prop,
  grep `.env.*` too.
- **`FEMA_DEV_CONNECTORS` takes the short connector name (`webhook`), not the package name.**
  Everything that reads it runs the value through `getConnectorNameFromAlias`, which strips the scope
  and the `connector-` prefix. `@fema-ipaas/connector-webhook` looks correct and matches nothing.
- **Nothing in the `@fema-ipaas` scope is published to npm.** Any test that wires a connector up as
  `PackageType.REGISTRY` dies on `Failed to fetch connector bundle …: 404 Not Found` once the engine
  actually runs it. Register the connectors the test needs as dev connectors and build their `dist`.
- **A test that needs a real Redis must skip itself, not hang.** `active-invariant` and
  `remove-deprecated-jobs` drive real BullMQ; they probe the host through
  `test/helpers/redis-availability.ts` and `describe.skipIf` out. Without that they burned two
  minutes each on a `beforeAll` hook timeout, which reads like a broken suite rather than a missing
  service.
- **`tsconfig.spec.json` is typechecked by nothing in CI.** Vitest only transpiles, so the test tree
  had accumulated ~100 type errors — stale enum members (`DefaultProjectRole.EDITOR`), removed job
  fields, mocks for entities that no longer exist. `npm run typecheck` in `packages/server/api`
  now covers `tsconfig.app.json` *and* `tsconfig.spec.json`; run it after touching tests.
- **The custom-connector archive is generated, not hand-carried.**
  `packages/server/api/src/assets/e2e-custom-echo-0.0.1.tgz` is built from
  `test/fixtures/e2e-custom-echo` by `npm run build-e2e-connector-archive` (esbuild bundles the SDK
  in, so the archive has no dependencies to install). The committed one was an upstream artifact
  importing `@activepieces/pieces-framework` and could never run here.
