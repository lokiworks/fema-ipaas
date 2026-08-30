---
icon: 🎛️
---

# Web Feature Anatomy

What a frontend feature looks like in `packages/web/src/`. The canonical reference is `features/tables/` — when this page and that folder disagree, the folder wins.

## Feature folder

```
features/{feature}/
  api/          # api clients — tables-api.ts, fields-api.ts
  components/   # React components
  hooks/        # react-query hooks — table-hooks.ts
  stores/       # zustand stores, when the feature has client state
  types/
  utils/
  index.ts      # barrel — the feature's public surface
```

Everything crossing the feature boundary goes through `index.ts`. See `features/executions/index.ts`: React components are exported **by name** (`RunsTable`, `StepStatusIcon`), while plain function/constant utils are grouped into one object first (`executionsApi`, `executionUtils`) and re-exported as that object.

## API client and hooks

API client: `features/executions/api/executions-api.ts`. Hooks: `features/executions/hooks/execution-hooks.ts`.

On any query that fetches a page's **primary** data — the table rows, the list, the thing the page exists to show — set `meta: { showErrorDialog: true }`. `QueryCache.onError` in `app/query-client.ts` turns that into the global error dialog. Leave it off for auxiliary queries (feature flags, connector metadata, single-item fetches, filter options, user details) — those should fail silently rather than throw a modal over the page.

## Route

Routes are registered in `app/routes/project-routes.tsx`, composed from `ProjectRouterWrapper` plus guards:

```tsx
...ProjectRouterWrapper({
    path: routesThatRequireProjectId.myFeature,
    element: (
        <RoutePermissionGuard requiredPermissions={Permission.READ_MY_FEATURE}>
            <PageTitle title="My Feature">
                <SuspenseWrapper>
                    <MyFeaturePage />
                </SuspenseWrapper>
            </PageTitle>
        </RoutePermissionGuard>
    ),
}),
```

The page component itself is `React.lazy()`-imported. `requiredPermissions` takes a single `Permission` or an array. Guards live in `app/guards/` — `permission-guard.tsx`, `flag-route-guard.tsx`, `project-route-wrapper.tsx`.

## Flags, gating, translations

- Feature flags: `flagsHooks.useFlag()`, or `<FlagGuard>` / `flag-route-guard.tsx` for whole routes.
- Paid features: `LockedFeatureGuard` on the frontend, `enabled: platform.plan.<flag>` on the query. The backend counterpart is `platformMustHaveFeatureEnabled()`, which returns 402.
- Translations go in `packages/web/public/locales/en/translation.json` **only** — the other locales are generated. Zod validation messages must be keys in that file, not raw English; reuse the `formErrors` constant from `@fema-ipaas/shared` for common ones.

## Editions

Every customer-facing surface must be checked on all five edition paths — CE, EE self-hosted, Cloud freemium, Cloud self-serve paid, Cloud enterprise. Nothing user-visible hardcodes "FEMA Integration Platform": name, colours, and logos come from platform appearance. Community always gets the default theme, Cloud always applies platform branding, EE requires `platform.plan.customAppearanceEnabled`. See `ee/helper/appearance-helper.ts`.

Verify with `npx turbo run lint --filter=web`, or `npm run lint-dev` for the whole repo.

## Gotchas

- **A `packages/web` test runs in the `node` environment by default, so importing anything that touches `window` at module load fails at collection.** `vitest.config.ts` sets `environment: 'node'`; ~26 suites opt into a DOM with a `// @vitest-environment jsdom` docblock on line 1. The failure is a bare `ReferenceError: window is not defined` pointing at a *transitive* import (`embed-provider.tsx` reading `window.opener`, reached via `@/features/projects`), not at the test — so read the stack, don't hunt in your own file. Missing the docblock is why `chunk-reducer.test.ts` was red for as long as it was: CI did not run the web suite at all, so nothing surfaced it.
- **Exported types and constants belong at the *end* of the file**, after the components and logic. Reading a file should start with what it does, not its type declarations.
- **`showErrorDialog` on the wrong query is worse than missing it.** On an auxiliary query it throws a modal over a page that was working fine; on the primary query, omitting it leaves the user staring at an empty table with no explanation.
- **A ref assigned during render (`const ref = useRef(x); ref.current = x`) is stale inside socket/event callbacks.** The value only advances when React commits a render, so two events handled before that commit both read the same base — a read-modify-write (merging a step into `run.steps`) silently drops the earlier event. Read the zustand store directly instead: `useBuilderStore().getState()` (`app/builder/builder-hooks.ts`) always returns current state. Bit the test-workflow widget's progress merge, PR #14453.
- **Builder overlays share one stacking context, so a big `z-` wins over everything — including portalled popovers.** Nothing between an overlay in the canvas panel and `<body>` creates a stacking context (the middle panel is `relative` + `z-auto`; `ResizablePanel` sets only flex/overflow), so a canvas child's `z-index` competes directly with Radix portals. The working ladder: canvas `z-30` (opaque `bg-builder-background` — anything below it is invisible), header and floating corner chrome `z-40`, data selector / canvas controls / popovers `z-50`. That is why the powered-by note at `z-10000` painted over the connector selector.
- **The workflow "download as image" only captures `.react-workflow__viewport`.** `workflowScreenshotUtils` (`workflow-canvas/utils/workflow-screenshot-utils.ts`) clones that one element into an SVG, so anything outside it — the dot-grid background, the powered-by note, canvas controls — is absent unless handled explicitly. Two seams: mark in-viewport chrome you want *omitted* (step chevron, badges) with `data-workflow-screenshot-exclude`; anything *outside* the viewport you want *included* has to be redrawn onto the composited 2D canvas in `composeImageWithCanvasBackground` (that's how the background dots and the powered-by mark get there).
- **The editor is three columns: tools left, canvas centre, config right.** Picking a trigger or action opens `LeftSideBarType.CONNECTOR_PICKER` in the left panel (`builder/left-panel/`, which also hosts the run list and the version list); the right panel is `RightSideBarType.CONNECTOR_SETTINGS` only, split into Action / Input / Output / Error Handling tabs. `builder/connectors-selector/index.tsx` is only the click target that writes `openedConnectorSelectorStepNameOrAddButtonId` + the operation into the builder store. Connectors render as a three-column icon grid (`ConnectorGridItem`), not list rows. The old popover sizing helper (`useAdjustConnectorListHeightToAvailableSpace`, `CONNECTOR_SELECTOR_CLIPPING_THRESHOLD`) is dead for this path — a panel fills its own height. The `Permission.READ_WORKFLOW` guard on the run-history entry lives on the left icon rail; it used to sit on a top-bar button that no longer exists.
- **`Alert`'s `warning` and `destructive` variants ship without a background tint, so a tinted banner has to add one at the call site.** `components/ui/alert.tsx` gives `primary` and `success` a `bg-*-100/10` wash but leaves `warning` and `destructive` transparent (`destructive` sets `bg-card`, which reads as a plain panel on a page background, and unlike `warning` it sets no border colour either). A banner that needs to look like a banner rather than a bordered paragraph passes `bg-warning-100/10` / `bg-destructive-100/10 border-destructive/50` itself — that is what the credits usage alert does. Don't "fix" it in the variant without looking: eight-plus existing warning alerts sit inside dialogs on card backgrounds and were designed against the untinted look. Note also that `--warning-100` and `--destructive-100` are *not* redefined in the `.dark` block of `styles.css` (unlike `--primary-100`), so in dark mode both tints are a very pale hue at 10% over near-black — subtle by accident, not by design.
- **`npx turbo run serve --filter=web -- --mode=cloud` cannot do OAuth2 connections.** The provider redirects to `fema.local` after sign-in instead of your local frontend. Use API-key or basic-auth connections, or run a fully local backend.
- **`--mode=cloud` also floods the terminal with `[vite] http proxy error: /ingest/... ETIMEDOUT 127.0.0.1:3000`.** The mode only redirects the API (`API_BASE_URL` → `https://github.com/lokiworks/fema-ipaas` in `lib/api.ts`); PostHog still posts to the *relative* `api_host: '/ingest'` (a same-origin reverse proxy so ad blockers don't drop ingestion — `providers/telemetry-provider.tsx`, mirrored in prod by the `fastifyHttpProxy` in `server.ts`). Vite proxies `/ingest` to `127.0.0.1:3000`, which isn't running. Cloud flags also turn telemetry *on* (`TELEMETRY_ENABLED` + `EDITION=cloud`), unlike a local CE backend — so posthog-js keeps polling `/ingest/flags` and flushing `/ingest/e` every few seconds. Harmless, but note the same setup sends real dev clicks to production PostHog whenever `/ingest` does resolve; the clean fix is skipping `posthog.init` under `import.meta.env.DEV`.
- **`packages/web`'s lint script only globs `src/**`, so nothing under `packages/web/test/` is ever linted** — not by CI's `lint` job, not by `npm run lint-dev`. Running `npx eslint 'test/**/*.{ts,tsx}'` from `packages/web` today reports 21 errors nobody has seen, so a new web test needs a manual eslint pass or it ships with errors. Most common trap: `testing-library/render-result-naming-convention` fires on any local helper whose name merely *starts with* `render` even when testing-library is not involved — renaming `render` to `renderTabText` does not silence it, only a name that doesn't begin with `render` does.
- **`RoutePermissionGuard` used to redirect to /404 while permissions were still loading, so every hard refresh of a workspace route 404'd.** `useAuthorization().checkAccess` is `!isLoading && granted.has(p)` — indistinguishable from "denied" during the `/v1/workspace-members/me` request. Clicking a tab worked (react-query had the role cached, `staleTime` 5min); pasting a URL or pressing F5 did not. The guard now renders `<RouteLoadingBar />` while `isFetchingWorkspaceRole`. Any new guard reading `checkAccess` needs the same three-state handling — loading is not denied.
- **A type error in a `packages/web` *test* file blocks the whole app behind a full-screen Vite overlay.** `vite-plugin-checker` runs in `buildMode` against `packages/web/tsconfig.json`, which pulls in `tsconfig.spec.json`, so a stale fixture in `*.test.ts` paints `vite-error-overlay` over the running app — the sign-in form sits underneath it, unclickable. `tsc --noEmit -p tsconfig.app.json` will *not* reproduce it (app config excludes tests); use `npx tsc -b tsconfig.json` from `packages/web`.
- **`packages/web/public/locales/zh/translation.json` was largely Traditional Chinese with Activepieces-era vocabulary** — `Workflow` rendered as 流, `Connector` as 块 (a literal carry-over of "Pieces"), `Publish` as 重新上架, plus ~600 entries in Traditional characters. Converted with `opencc` `tw2sp` and a term table. When adding zh strings, check the terminology against the nav: 工作流 / 连接器 / 连接 / 触发器 / 动作 / 步骤 / 发布, and keep it Simplified.
- **Module-level `t()` calls resolve before i18next finishes loading, so they render the English key.** A `const NAV_ITEMS = [{ label: t('Home') }]` at module scope evaluates at import time. Wrap it in a function called during render (`buildNavItems()`) — that is why `auth-landing/auth-backdrop.tsx` builds its nav, recent list and conversation from functions rather than constants.
- **The connector selector's Approvals tab was hardcoded to five connectors this fork does not ship** (`discord`, `microsoft-teams`, `microsoft-outlook`, `gmail`, `telegram-bot`), so every open of the picker fired five 404s at `/v1/connectors/{name}` and the tab rendered empty. Removed along with `approvals-tab-content.tsx`. Nothing in `packages/connectors` exposes a `request_approval*` action today — if approvals come back, derive the list from the installed connectors rather than hardcoding package names.
- **Roughly 45% of `en/translation.json` was dead, and a `t('...')` scan will not find it.** 1156 of 2540 keys had no occurrence anywhere under `packages/` or `tools/` — the residue of this fork removing billing/plans, agents + MCP, git sync and environments, audit logs and event streaming, and the old project-settings surfaces. Auditing them needs a **string-literal** scan, not a call-site scan, because 27 sites call `t(variable)`: `t(role)`, `t(label)`, `t(fnDef.description)` and friends. Every one of those variables resolves from a source-level constant table or enum (`DefaultWorkspaceRole`, `ROLE_DESCRIPTIONS`, `DATE_RANGE_PRESET_LABELS`, `packages/core/formula/src/lib/function-registry.ts`), so the safe rule is: a key is live iff its exact text appears as a string literal somewhere under `packages/`. Keep the corpus to `packages/` + `tools/` — widen it to the repo root and `docs/`/`brain/` prose, which still documents the removed features, 'rescues' ~100 genuinely dead keys. One blind spot the scan cannot see through: a key whose only literal is its own dead definition still reads as live — 7 of the 8 entries in `packages/core/shared/src/lib/form-errors.ts` have zero `formErrors.<x>` call sites but survive.
