---
status: accepted
---

# Connector-set visibility is derived at read time

## Decision
A Connector Set stores an include/exclude selection (a visible allow-list), and visibility is computed when connectors are listed — never written when a connector installs. Two pure resolvers (`isConnectorVisible` / `isComponentVisible`) are shared by the server filter layer and the web UI.

## Context
The old model was a deny-list (`disabledConnectors` + policy flags). A deny-list can't declaratively express "hide things that don't exist yet", so an `onConnectorCreated` hook fired on every metadata create — including the hourly cross-platform `CONNECTORS_SYNC` cron — and walked every connector set to materialize new connectors into its deny-list, which grew unbounded.

## Why
Storing the visible allow-list makes "new = not in the list = hidden" automatic, deleting the whole write-on-install fan-out. Rejected: refactoring the deny-list (keeps the install-time fan-out and unbounded growth), and a uniform `{mode, exceptions}` at every scope (components are strictly binary "all vs selected", so a mode field is dead weight).

## Consequences
Two representations on purpose — connectors carry a `mode` (a real set-level auto-include policy); components are a bare allow-list where key-presence = curated. The update API is declarative (full replace + per-connector intent). Renames are treated as new (hidden until re-selected). Concurrent admin edits are last-writer-wins — with the background writer gone, the only writers left are two admins editing one set at once.
