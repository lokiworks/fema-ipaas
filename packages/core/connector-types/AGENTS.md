# @fema/connector-types

The "connectors contract": the type and enum surface that the connectors framework, every
connector, and the engine share to describe a connector — categories, connection types,
trigger strategies, and the connector-facing payload types.

## Principles

- **Must be tree-shakeable.** It is bundled into every connector (and the engine), so
  keep it small, side-effect-free (`"sideEffects": false`), and acyclic.
- **May import `@fema/core-utils` only** — never `server`, `web`, `connectors`,
  or `shared`. Enforced by the `no-restricted-imports` boundary lint in `.eslintrc.json`.
