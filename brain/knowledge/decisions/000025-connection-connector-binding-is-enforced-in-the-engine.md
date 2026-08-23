---
title: Connection↔connector binding is enforced in the engine, and the flag rides worker settings
icon: 🔗
status: accepted
---

`FEMA_ENFORCE_CONNECTION_CONNECTOR_BINDING` (default `false`) rejects a step that resolves a
connection created for a different connector — a Slack credential handed to a Google Sheets
step. Two places could hold the check: the server endpoint that hands out the decrypted
value (`connection-worker-controller.ts`), or the engine's `connection-resolver`.

It lives in the **engine**. The resolver already receives the full `Connection`, so the
check is a local `connection.connectorName !== connectorName` comparison — no query param, no new
error code, no change to the worker endpoint at all.

## Why not the server

The server variant looks safer (it rejects before decryption) but it buys nothing here: the
engine is the only caller of that endpoint, and it is the party that would have to declare
which connector is asking. A caller-supplied `?connectorName=` is exactly as trustworthy as a
caller-side comparison, so the extra wire field, the querystring DTO, and the HTTP round
trip of an error code back into an engine error class were pure cost.

## How the flag reaches the engine

`process.env` is **not** inherited by the engine: sandbox env is an explicit allowlist built
in `create-sandbox-for-job.ts` (`buildSandboxEnv`) from `SandboxSettings`, which comes from
`WorkerSettings` served by the app over the socket. So the flag follows the same path
`FEMA_DEV_CONNECTORS` and `FEMA_SSRF_ALLOW_LIST` already take:

`AppSystemProp` → `machine-service.ts` (`WorkerSettingsResponse`) → `SandboxSettings` →
`buildSandboxEnv` → `process.env.FEMA_ENFORCE_CONNECTION_CONNECTOR_BINDING` in the engine.

The var is emitted **only when true**, so the engine can read `=== 'true'` and an absent var
means disabled — never the `String(undefined)` → `'undefined'` trap. It is read at call
time, not at module load, so tests can toggle it. The operator sets it on the **app**
container; workers receive it through settings.

## Consequences

- Every connection-resolution path must pass the step's connector name — props resolver and the
  connector `connections` manager, covering actions, triggers, trigger hooks, and
  dynamic/dropdown props. A missing name is a denial, so a path that forgets it loses all
  connection access.
- **Code, loop and router steps have no connector, so they lose connection access entirely.**
  Deliberate — a code step runs arbitrary JS, so exempting it would leave the widest hole in
  the boundary. Enabling the flag breaks workflows that feed a connection into custom JS.
- A worker on a stale `WorkerSettings` cache runs with the old value until it refetches.
- **The denial is invisible with the flag off (the default), so a dropped `connectorName` thread passes every test and dev run and only breaks where enforcement is on.** This actually happened: a props-resolver perf refactor dropped `connectorName` from `PropsResolverParams` while `getPropsResolver` kept passing it, so `createConnectionResolver` got `undefined` and rejected every valid connection in enforcing environments. When touching the resolve chain, keep `connectorName` threaded end-to-end (`createPropsResolver` → `resolveSingleToken` → `connectionToken.handle` → `createConnectionResolver`) and cover it with a test that sets `FEMA_ENFORCE_CONNECTION_CONNECTOR_BINDING=true`.
