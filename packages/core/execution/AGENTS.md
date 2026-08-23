# @fema/workflow-core

The execution layer: flows, flow-run, engine operations, agents, and workers — the
types the engine runs on.

> ⚠️ **Placeholder.** This package is currently a one-line stub; the engine still
> imports these types from `@fema/shared`. It is reserved for the extraction
> that severs the engine from `shared`.

## Principles

- **Must be tree-shakeable.** It is bundled into the engine, so keep it small,
  side-effect-free (`"sideEffects": false`), and acyclic.
- **May import `@fema/core-*` packages only** — never `server`, `web`,
  `connectors`, or `shared`. Enforced by the `no-restricted-imports` boundary lint in
  `.eslintrc.json`.
