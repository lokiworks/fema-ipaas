---
icon: 🧩
---

# Connectors & Engine

How the connector catalog, visibility, formulas, workers, and AI agents fit together.

### Connectors

Metadata catalog of integrations (`@fema-ipaas/connector-*`), served from an in-memory `connectorCache` rebuilt from the `connector_metadata` table and refreshed via pub/sub.

- **Entities/services**: `connector_metadata` (unique on name+version+platformId; `null` platformId = official, set = custom); `connectorMetadataService` (list/get/create/delete + cache), `connectorInstallService` (upload/NPM install → `EXECUTE_METADATA` engine job), `connectorSyncService` (bundled registry → DB).
- **Gotchas**: routes under `/v1/connectors`; install/delete are `platformAdminOnly`; `options` runs dynamic prop eval on a worker. Per-connector/action visibility (EE/Cloud) resolved at read time by `resolveVisibility` → returns `null` on CE. Optional per-action `outputSchema` drives the builder's Smart Output Viewer (opt-in, non-breaking).

### Workflow Components

Platform-owned flow logic nodes (Branch, Loop, Delay, Code, Stop, Approval) — **not** connectors, and deliberately a separate concept ([ADR 0004](../../../docs/adr/0004-separate-connector-and-workflow-component.md)). The `WorkflowActionType.COMPONENT` action carries a `componentType` string resolved against a static registry.

- **Where**: `packages/components/sdk` (`@fema-ipaas/component-sdk` — `createComponent`, `buildComponentRegistry`, `FlowComponentCategory`), `packages/components/builtin` (`@fema-ipaas/components` — the registry itself). Engine side is `component-executor.ts`; validation is `validateComponent` in `workflow-version-validator-util.ts`.
- **The whole point is the execution model**: a connector is resolved lazily and runs in a **fresh child process**; a component is first-party, always present, and runs **in-process**. Component `run()` therefore has no IPC boundary — its `run` hooks (`stop`/`respond`/`createWaitpoint`/`waitForWaitpoint`) mutate a local `hooks.hookResponse` that the executor reads straight back.
- `buildRunContext` in `core/run-context.ts` is shared by both paths — the connector context builder and the component executor construct the same `RunContext`. Change it once, both get it.

- **Gotchas**:
  - Components have **no store and no `DynamicProperties`**. `createContextStore` is connector-scoped, and `executeProps` only accepts `connectorName`/`connectorVersion`. `runtime/http-response` is therefore on static props (status/headers always visible) instead of the connector's dynamic ones.
  - An unknown `componentType` must throw `ApplicationError({ code: ENTITY_NOT_FOUND })`, **not** `EngineGenericError`. `tryCatchAndThrowOnEngineError` rethrows ENGINE errors, which fails the worker job and pages oncall; a bad component type is a bad workflow, so it has to fail the *step*.
  - Adding a `WorkflowActionType` means touching more than `getExecutors()`: `test-execution-context.ts` (sample-data seeding for downstream step tests) and `workflow-version-validator-util.ts` (the `valid` flag, twice — ADD_ACTION and UPDATE_ACTION) both switch on it. The `switch-exhaustiveness-check` lint rule catches these; `turbo build` does not, because the engine is esbuild-only.
  - `@fema-ipaas/components` is a **built dist** dependency of the engine and api. After adding a component, `turbo run build --filter=@fema-ipaas/components` before running engine tests, or the registry lookup silently misses it.

### Connector Sets (EE/Cloud only, `manageConnectorsEnabled`)

Named, reusable connector/action/trigger visibility config a platform admin assigns to many projects. Visibility is **derived at read time** — nothing written when a new connector installs.

- **Entities/services**: `connector_set` (jsonb `config` = include/exclude selection); `connectorSetService` (CRUD, per-platform Default set, project assignment via `project.connectorSetId`). Pure resolvers `isConnectorVisible`/`isComponentVisible` shared by server + web.
- **Gotchas**: every platform has one un-deletable Default set; unassigned projects resolve to it. `include_all` auto-shows future connectors, `exclude_all` hides them. Replaces legacy per-project allow/block lists. Embed v4 JWT carries a `connectorSet` key claim (v2/v3 used `connectorsTags`). No install-time sync method. Inert/zero-setup on CE.

### Formulas

User-facing data transforms (81+ functions) inside any builder text input via a `/` slash editor; saved inline as `ap-formula-v1::{<expr>}::ap-formula-v1` so they round-trip through workflow JSON.

- **Where**: shared lib `packages/core/shared/src/lib/formula/` (`FEMA_FUNCTIONS` registry is the single source of truth; `formulaEvaluator.evaluate`, type checker). Editor is the TipTap `text-input-with-mentions`. Runtime hooks in the engine's `props-resolver.ts` pre-pass.
- **Gotchas**: no HTTP endpoints, no DB tables, no worker job — evaluation is synchronous in the engine. Runs on **every** edition, unconditionally (even if the editor flag is off, saved formulas still evaluate). Uses `expr-eval`; preprocess normalizes `;`→`,`, `and/or/not`, and rewrites `if()` to lazy ternary. Changing a function = bump `@fema-ipaas/shared` minor; never hard-remove a function (mark `deprecated`).

### Nothing typechecks the engine — or the web

`@fema-ipaas/engine`'s `build` is esbuild (`esbuild.config.mjs`, types stripped, never checked) and its `lint` is eslint only. **`web`'s `build` is `vite build`, which is also esbuild and also never typechecks.** Neither has `tsc --noEmit` in `turbo.json` or any CI workflow, so type errors ship silently in both.

This is not theoretical. Adding `WorkflowActionType.COMPONENT` broke a `Record<WorkflowActionType, ...>` in `web`'s `step-utils.tsx` and a green `turbo run build` said nothing. Separately, a domain-wide rename turned xyflow's `screenToFlowPosition` into `screenToWorkflowPosition` in two canvas files — a method that does not exist — and that shipped too, breaking note drag and the drag layer at runtime.

- Run `npx tsc --noEmit -p packages/web/tsconfig.app.json` and `-p packages/server/engine/tsconfig.lib.json` yourself after any change to either, and **diff the file list** rather than expecting zero — a green run is not the baseline.
- A new `@fema-ipaas/*` import in `web` must be registered in **three** places that do not share config: `tsconfig.app.json`'s `paths` (not inherited from `tsconfig.base.json`), `vite.config.mts`'s `resolve.alias`, and `vitest.config.ts`'s own `alias`. Miss the vitest one and `turbo build` plus `tsc` both stay green while `web#test` fails to collect every file that transitively imports it.
- Engine tests only run correctly from the package dir (`cd packages/server/engine && npx vitest run`); from the repo root the root config applies and every file fails collection with `describe is not defined`.

### The engine gets only 64 file descriptors

Under `FEMA_EXECUTION_MODE=SANDBOX_PROCESS` / `SANDBOX_CODE_AND_PROCESS` the engine runs inside the `isolate` binary (`create-sandbox-for-job.ts` → `isolateProcess`). **The bundled isolate is 1.8.1, which hardcodes** `RLIMIT_NOFILE` **to 64 — soft *and* hard — with no flag to change it.** Verified: `ulimit -n` inside is `64`, outside `1048576`; upstream added `--open-files` only after 1.8.1, so our binary rejects it.

That 64 is the real budget for everything the engine does at once: every HTTP socket to every connector, S3, plus 4 fds per CODE-step child process. An idle sandbox already sits around 23. Big workflows (100+ steps, loops, several HTTP connectors) blow through it.

- **Do not go looking at the worker's or the host's limits** — they are irrelevant and look healthy. The worker process has 524288 and the host `fs.file-max` is effectively unbounded. The constrained process is the `sandbox-*` one, not the `node .../worker/dist/src/bootstrap.js` one.
- Raising it requires shipping a newer isolate binary (amd64 + arm) in `packages/server/api/src/assets/` and passing `--open-files`.

### Code steps (`noOpCodeSandbox`)

Each CODE step is run in a fresh `node --eval` child process spawned with `stdio: ['pipe','pipe','pipe','ipc']` (`packages/server/engine/src/lib/core/code/no-op-code-sandbox.ts`). Inputs go over IPC via `child.send(...)`, the result comes back as one message.

- **Gotchas**:
  - `TypeError: <x>.send is not a function` **on a random CODE step is fd exhaustion (**`EMFILE`**), not a code bug** — almost always the isolate 64-fd cap above. Node assigns `child.send` per-instance inside `setupChannel()`, and on `EMFILE`/`ENFILE` `ChildProcess.prototype.spawn` returns *before* that setup, so `child.send` is `undefined`. `runInChildProcess` calls it unconditionally; the synchronous `TypeError` rejects the promise first and the real `EMFILE` arriving on the `'error'` event a tick later is discarded. Only EMFILE/ENFILE do this — `EAGAIN` and `ENOENT` still define `send`. Fix shape: guard `typeof child.send !== 'function'` and return, letting the `'error'` handler reject with the true cause.
  - The masking is total: nothing reaches the logs. The worker's own wide event records `"outcome": "success"`, and the only trace anywhere is the customer's failure-alert email quoting a bogus stack. Symptom looks fleet-wide and random (many workers, many platforms, a different CODE step each time) because every sandboxed engine shares the same 64 cap.
  - No timeout or `child.kill()` on the parent side: a code step that never resolves holds its 4 fds for the life of the process.
  - `runWithExponentialBackoff` retries a failed CODE step, so an fd-starved engine re-spawns several times per step.
  - Install/compile failure degrades to a throwing stub (user-attributed FAILED, not INTERNAL_ERROR + retries).

### Workers

Node processes that poll the app over Socket.IO and execute workflows. The worker *is* the sandbox — the full execution model (concurrency 1, replicas, Resolver, box lifecycle) lives on [Execution Runtime](https://craftspace.app/o/fema/pages/pg_xLVaOvA8hs9XVLj7kNZNE). Here, the connector-relevant behavior:

- **Version gate**: app and worker refuse to exchange jobs unless releases match exactly (fail-closed; auto-recovers once fleets converge).
- **Disconnect** returns in-flight jobs to the queue (`releaseConnectionJobs`) to avoid post-deploy "Job stalled" storms.
- **Worker groups** (`FEMA_WORKER_GROUP_ID` + `FEMA_PROJECT_WORKER`) route dedicated pools; per-project routing gated by `workerGroupsEnabled`.
- **Failed code-step** install/compile degrades to a throwing stub (user-attributed FAILED, not INTERNAL_ERROR + retries).
- Prod is deployed with Kamal from the ops box (`~/mrsk/prod`, `config/worker.yml`), not from this repo. To poke one live worker: `kamal app exec --config-file=config/worker.yml --hosts=<ip> --roles=shared05_<n> --reuse '<cmd>'`. `--reuse` is essential — without it Kamal boots a *new* container that starts taking real jobs. Dense hosts run 28 containers (one role each), so `--hosts` alone fans out. Base64 anything with pipes; quoting dies through ssh → bash -ic → kamal → docker exec → sh.

### AI Agents (gated by `agentsEnabled`)

A workflow step type (`@fema-ipaas/connector-agent`) running a ReAct-style LLM loop (up to `maxSteps`) that can call tools before producing a final answer. **No backend entity** — config lives in the workflow version's step settings.

- **Tools** (`AgentTool` union): CONNECTOR action, WORKFLOW (child run), MCP server, KNOWLEDGE_BASE (semantic search on 768-dim embeddings). Config: `agentTools`, `structuredOutput`, `prompt`, `maxSteps`, `aiProviderModel`, optional web search.
- **Gotchas**: external MCP tools validated server-side via `POST /v1/projects/:projectId/agent-tools/mcp/validate` (initialize→initialized→tools/list handshake) through SSRF-filtered `apAxios`; errors collapse to one generic message. Lives under `agents/` (agent connecting *out*), distinct from `mcp/` (exposing AP *as* an MCP server). `AgentTimeline` renders step blocks in the builder.

## Pages

- **Connectors** — the catalog, metadata registry, versions
- **Connector Sets** — per-project include/exclude visibility, the undeletable Default set
- **Building Connectors** — authoring, testing and publishing a connector
