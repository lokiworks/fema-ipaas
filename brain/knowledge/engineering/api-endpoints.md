---
icon: 🔌
---

# API & Endpoints

The FEMA Integration Platform REST API reference. Source: `docs/endpoints/` plus generated `openapi.json`.

## Basics
- **Auth** — API keys, generated in the tenant console. Pass as a Bearer token: `Authorization: Bearer {API_KEY}`.
- **Pagination** — seek pagination via `limit` and `cursor` query params. Responses are `{ data, next, previous }` where `next`/`previous` are cursors.

## Endpoint groups
Each group has a schema page plus CRUD operations:
- **Tenants** — get, update (the update body carries `allowedEmbedOrigins`).
- **Workspaces** — create, update, list, delete; **Workspace Members** — list, delete.
- **Users** — get, update, list, delete; **User Invitations** — upsert, list, delete.
- **Connections** — upsert, list, get, delete; **Global Connections** — upsert, update, list, delete.
- **Workflows** — create, update, get, list, delete; **Workflow Runs** — get, list.
- **Sample Data** — get.
- **Connectors** — schema, install.
- **Folders** — create, update, get, list, delete.
- **Templates** — create, delete, get, list.
- **Worker Machines** — queue metrics.

## Regenerating `docs/openapi.json`
`@fastify/swagger` is registered without `swagger-ui`, so **no HTTP route serves the spec** — it only
exists in-process as `app.swagger()`. Regenerate with `npm run generate-openapi` from
`packages/server/api` (needs Postgres + Redis up; it boots the app with `runMigrations: false`,
dumps the spec, and exits). Do it whenever you add, rename or delete a route — nothing else keeps
the file honest, which is how it drifted far enough to still describe `/v1/projects`, `/v1/platforms`,
agents, tables and knowledge-base long after those were gone.

## Gotchas
- **`hideUntagged: true` means an untagged route is invisible to the whole docs pipeline.** A route with
  no `tags:` in its fastify schema is silently absent from `openapi.json`, so every `docs/endpoints/*.mdx`
  page whose frontmatter names it renders empty — no build error, no warning. Renames are where the tags
  get dropped: `global-connections`, `workspace-members`, `POST /v1/connectors` and `POST /v1/tenants/{id}`
  all lost theirs and had to be put back. After touching a controller, regenerate the spec and diff the
  path list; a route that vanished usually lost a tag rather than a handler.
- **A doc page's `openapi-schema:` only resolves if the zod schema is registered in `registerOpenApiSchemas()`**
  (`app.ts`) via `globalRegistry.add(Schema, { id: '<name>' })`. Declaring the schema in
  `governance/audit-events/index.ts` is not enough — `SignUpEvent` existed for ages while
  `user-signed-up.mdx` rendered nothing, because nobody registered it.
- **`@fema-ipaas/shared` resolves to `dist`, so a script that boots the app sees stale types.** Adding an
  event schema and immediately regenerating the spec fails with `Invalid value used as weak map key` from
  `globalRegistry.add` — the new export is `undefined` in the built copy. Run
  `npx turbo run build --filter=@fema-ipaas/shared` first.
