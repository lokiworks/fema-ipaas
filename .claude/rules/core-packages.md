`packages/core/<name>` packages are named `@fema-ipaas/core-<name>` (e.g. `packages/core/utils` → `@fema-ipaas/core-utils`).

**One exception: `packages/core/shared` keeps the name `@fema-ipaas/shared`** (NOT `core-shared`). It is the one *thick, app-level* member of the folder — it carries heavy deps (`dayjs`, `expr-eval`, `socket.io-client`) and DB/EE/management schemas, and it *depends on* the thin members. The folder holds all cross-cutting library code ordered thin → thick: `utils`, `connector-types`, `formula`, `execution` (thin, bundleable) then `shared` (thick).

The thin members (`core-utils`, `core-connector-types`, `core-formula`, `core-execution`) are framework-agnostic foundation libraries: they MUST NOT import from `@fema-ipaas/shared`, `@fema-ipaas/server-*`, any connector package, or any web/React package. The dependency graph must stay acyclic, and these thin members ship dual-format (CJS + ESM) with `"sideEffects": false`.

**Import boundary (enforced per-package, not by folder name):** connectors and the engine may import `@fema-ipaas/core-utils | core-connector-types | core-formula | core-execution`, but **never** `@fema-ipaas/shared` (`packages/core/shared`). Connectors get the symbols they need re-exported through `@fema-ipaas/connector-sdk`.
