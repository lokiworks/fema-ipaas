---
icon: 📋
---

# Templates

Templates are a library of reusable workflow (and table) blueprints users can browse, import, and build on. Before saving, workflows inside a template are validated and their connector names extracted into a searchable `connectors` array.

### Entities & services
- **Template** entity: name, summary, description, type, status, platformId (nullable), workflows (jsonb `WorkflowVersionTemplate[]`), tables, tags, categories (indexed text[]), connectors (indexed text[]).
- **TemplateType**: `OFFICIAL` (FEMA-curated, platformId=null), `CUSTOM` (platform-owned, needs `manageTemplatesEnabled`), `SHARED` (ad-hoc share URL, not listable).
- **TemplateStatus**: `PUBLISHED` (visible) or `ARCHIVED` (hidden).
- Services: `template.service.ts` (CRUD + list), `template-validator.ts`, `community-templates.service.ts`, EE `platform-template.service.ts`.

### How it works
- Routes under `/v1/templates`: `GET /categories`, `GET /:id`, `GET /` (public list, official + custom merged), `POST /`, `POST /:id`, `DELETE /:id` (platform-owner only).
- **Official template storage differs by edition**: on Cloud they live in the DB with null platformId; on self-hosted (CE/EE) they're proxied at request time from `https://github.com/lokiworks/fema-ipaas/api/v1/templates` via `communityTemplates`.
- List filtering: ArrayOverlap for `connectors`, ArrayContains for `categories`, ILIKE for `search`. Only PUBLISHED templates returned.
- `WorkflowVersionTemplate` is a workflow version stripped of runtime-only fields (id, workflowId, state) for embedding.

### Gotchas
- **Custom templates require the `manageTemplatesEnabled` plan flag** (off by default in CE). When disabled, custom listing is skipped silently — returns empty array, no error.
- OFFICIAL and SHARED templates cannot be updated or deleted via API; ownership is double-checked (`template.platformId === principal.platform.id`).
- Workflow version migration (`migrateWorkflowVersionTemplateList`) runs as a `preValidation` hook on create/update to handle schema evolution in stored workflows.
- `connectors` and `categories` are denormalized + indexed for fast filtering.

### Editions
CE/EE proxy official templates from cloud; custom needs `manageTemplatesEnabled`. Cloud stores official in DB directly; custom needs `manageTemplatesEnabled`.

### Key files
Entry point: `templateController`, registered in `template.module.ts` under the `/v1/templates` prefix.

- `packages/server/api/src/app/template/` — controller, module, service, entity, validator, and the community-templates cloud proxy
- `packages/server/api/src/app/ee/template/platform-template.service.ts` — EE only, creates and updates CUSTOM templates for a platform
- `packages/core/shared/src/lib/management/template/` — shared types and request schemas (`Template`, `TemplateType`, `TemplateStatus`, `WorkflowVersionTemplate`, `TableTemplate`, `TemplateTag`, the Create/Update/List request bodies)
- `packages/web/src/features/templates/api/` — frontend API client
- `packages/web/src/features/templates/components/` — browse dialog, use-template import dialog, share dialog, explore card
- `packages/web/src/features/templates/hooks/` — templates data hooks
- `packages/web/src/app/routes/templates/` — public-facing template gallery page

Paths verified 2026-07-17.
