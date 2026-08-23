There is no edition system. `FEMA_EDITION`, `ApEdition`, `getEdition()`, `packages/ee` and `src/app/ee/` do not exist and must not come back (`docs/adr/0002`).
Never gate a feature on a commercial plan. Instance-wide caps are `SYSTEM_LIMITS`; per-workspace caps live on the workspace row.
Never add an upgrade prompt, pricing link, or "locked feature" surface.
