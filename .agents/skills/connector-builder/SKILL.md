---
name: connector-builder
description: Build and edit FEMA Integration Platform connectors (integrations) — creating new connectors, adding actions or triggers, or fixing bugs in existing ones. Use when the user asks to work on a FEMA Integration Platform connector, connector, or integration.
---

# FEMA Integration Platform Connector Builder

## Pick your task mode first

| Mode | What you're doing | Where to go |
|---|---|---|
| **New connector** | Building an integration for an app that has no connector yet | Full 5-step workflow below |
| **Add action / trigger** | An existing connector needs another operation or event | Skip Steps 1–3. Open the existing connector, **match its conventions** (its `common/` helpers, auth access, file naming, error handling), then jump to Step 4 IMPLEMENT and Step 5 WIRE & VERIFY. Bump the connector version. |
| **Fix a bug** | An existing action/trigger misbehaves | Reproduce → read the offending file *and its `common/` helpers* → smallest fix that matches surrounding style → Step 5 VERIFY. Bump the connector version. |

**Golden rule for existing-connector modes:** the connector you're editing is the source of truth, not these templates. If the connector already has a helper, a particular auth access pattern, or a way of shaping output, follow *that*. Reach into the reference files only for a pattern the connector doesn't already demonstrate.

**The one carve-out — framework calls that drop data.** Matching the connector is right for style, wrong for a call that silently loses information. If the connector calls `pollingHelper` with a hand-picked subset (`{ store, auth, propsValue }`) instead of the whole `context`, fix every trigger in that connector to pass `context` while you're in there — see `trigger-patterns.md`. The version bump and rebuild are already happening; fix-on-touch reaches the connectors people actually use without a ~300-connector codemod PR that touches dead ones too.

## Workflow (new connector)

### Step 1: RESEARCH

- Search the web for the target app's REST API documentation
- Identify the auth method (API key, OAuth2, Basic Auth, custom)
- List available endpoints; check if webhooks are supported
- Note base URL, pagination, and rate limits

### Step 2: PLAN

- **Location:** `packages/connectors/community/` by default; `packages/connectors/custom/` only if the user says "custom connector". See Connector Types below.
- Choose the correct auth type — see Quick Auth Reference below
- Select the most useful actions (CRUD, search, list) and triggers (webhook if supported, polling otherwise)
- **Ask the user** before starting when: OAuth2 authUrl/tokenUrl/scopes are missing from the docs; auth method is unclear or undocumented; more than 10 possible actions exist (which to prioritize); API uses webhook signature verification; test credentials or sandbox access are needed.

### Step 3: SCAFFOLD

Create this structure under `packages/connectors/community/<name>/`:

```
src/
  index.ts
  lib/
    auth.ts             # Auth always lives here — never inline in index.ts
    actions/            # One file per action
    triggers/           # One file per trigger
    common/             # Shared helpers (optional)
package.json
.eslintrc.json
tsconfig.json
tsconfig.lib.json
```

Copy the four config files (`package.json`, `.eslintrc.json`, `tsconfig.json`, `tsconfig.lib.json`) from [`new-connector-scaffold.md`](./new-connector-scaffold.md).

### Step 4: IMPLEMENT

The condensed rules in this file (Quick Auth Reference, Quick Connector Definition Template, UX Quality, Output Quality) cover the common case. Open a reference file when you need a concrete copy-ready example for the specific pattern you're building.

**Reach for the reference file, not the codebase.** The reference files carry vetted patterns for every common case; older connectors in `packages/connectors/community/` are inconsistent and eat context.

| When you reach for it | Open this file |
|---|---|
| Wiring auth beyond the Quick Auth Reference table | `auth-patterns.md` |
| A connection needs a human-readable label in the UI (account email, workspace name) | `auth-patterns.md` (Connection Identifier) |
| Your first action in this connector (full file shape) | `action-patterns.md` |
| A trigger — polling, webhook, handshake, or renewal | `trigger-patterns.md` |
| **Choosing which prop component, display mode, or layout/grouping fits a use case** | `property-ui-selection.md` |
| The exact syntax of a prop type (dropdowns, dynamic, arrays, files) | `props-patterns.md` |
| Shared API helper, pagination, or `createCustomApiCallAction` | `common-patterns.md` |
| An advanced UX pattern (source selectors, AWS-style auth) | `ux-guidelines.md` |
| Flattening a deeply nested API response | `output-quality.md` |
| Tagging an action/trigger (`audience`, `aiMetadata`, `classification`) | `ai-metadata.md` |

### Step 5: WIRE & VERIFY

**Wiring checklist:**

- [ ] Import every action in `src/index.ts` → add to `actions: [...]`
- [ ] Import every trigger in `src/index.ts` → add to `triggers: [...]`
- [ ] Add `createCustomApiCallAction` to `actions: [...]`
- [ ] Every hand-written action carries `audience`, `aiMetadata`, and `classification`; every trigger carries `aiMetadata` and `classification: 'READ'` (see `ai-metadata.md`)
- [ ] Register in `tsconfig.base.json` at repo root (insert **alphabetically** — build fails without this):
    ```json
    "@fema-ipaas/connector-<name>": ["packages/connectors/community/<name>/src/index.ts"]
    ```

**Build and lint:**

```bash
bun install   # new connectors only — creates workspace symlinks
npx turbo run build --filter=@fema-ipaas/connector-<name>
npx turbo run lint --filter=@fema-ipaas/connector-<name>
```

Both must pass. Lint failures (unused imports, `any` types, unused vars) block CI even when the build is green.

Common TS errors: missing import in `src/index.ts`, missing `tsconfig.base.json` entry, missing `sampleData` on a trigger. Auth-shape errors are covered in the Quick Auth Reference below.

**Test locally:** Add `FEMA_DEV_CONNECTORS=<name>` to `packages/server/api/.env`, start with `npm start`, open `localhost:4200`.

---

## Versioning an existing connector

Every change to an existing connector needs a version bump in its `package.json`. Without it, live workflows never pick up your change.

| Bump | When |
|---|---|
| **MAJOR** | Remove an action/trigger/prop; add a **required** prop to an existing action/trigger; change existing behavior |
| **PATCH** | Add a new action or trigger; add an **optional** prop; add an output attribute; fix a bug |

Rule of thumb: **any removal is breaking, any new required prop is breaking, everything else is PATCH.** When in doubt, prefer MAJOR.

---

## Connector Types

| Location | Purpose |
|---|---|
| `packages/connectors/community/` | Third-party integrations (Slack, Stripe, etc.) — use this for almost all work |
| `packages/connectors/core/` | Built-in platform utilities (HTTP, Store, Math, etc.) — do NOT recreate these |
| `packages/connectors/custom/` | Private customer-specific connectors |

Full reference: [connector-types.md](connector-types.md) — includes all `ConnectorCategory` values and the list of existing core connectors.

---

## Quick Auth Reference

In actions and triggers, `context.auth` is the resolved connection object — not a flat string:

| API Auth Method | FEMA Integration Platform Type | Access Pattern |
|---|---|---|
| API key / Bearer token | `ConnectorAuth.SecretText()` | `context.auth.secret_text` |
| OAuth2 | `ConnectorAuth.OAuth2()` | `context.auth.access_token`; extra props via `context.auth.props?.['<key>']` |
| Username + password | `ConnectorAuth.BasicAuth()` | `context.auth.username`, `context.auth.password` |
| Multiple fields | `ConnectorAuth.CustomAuth()` | `context.auth.props.<field_name>` |
| No auth needed | `ConnectorAuth.None()` | No `context.auth` available |

Inside the auth's own `validate` callback the shape is different — it receives the raw entered values (plain string for SecretText, flat object for CustomAuth). The table above applies to action/trigger `run()` only.

Full code examples: read `auth-patterns.md`

---

## Quick Connector Definition Template

**`src/lib/auth.ts`**
```typescript
import { ConnectorAuth } from '@fema-ipaas/connector-sdk';

export const myAppAuth = ConnectorAuth.SecretText({
    displayName: 'API Key',
    description: 'Go to Settings > API Keys in your dashboard to generate a key.',
    required: true,
});
```

**`src/index.ts`**
```typescript
import { createConnector } from '@fema-ipaas/connector-sdk';
import { createCustomApiCallAction } from '@fema-ipaas/connector-common';
import { ConnectorCategory } from '@fema-ipaas/shared';
import { myAppAuth } from './lib/auth';
import { myAction } from './lib/actions/my-action';
import { myTrigger } from './lib/triggers/my-trigger';

export const myApp = createConnector({
    displayName: 'My App',
    description: 'What the app does in one sentence.',
    minimumSupportedRelease: '0.36.1',
    logoUrl: 'https://cdn.fema.local/connectors/my-app.png',
    categories: [ConnectorCategory.PRODUCTIVITY],
    auth: myAppAuth,
    authors: ['your-github-username'],
    actions: [
        myAction,
        createCustomApiCallAction({
            baseUrl: () => 'https://api.example.com/v1',
            auth: myAppAuth,
            authMapping: async (auth) => ({
                Authorization: `Bearer ${auth.secret_text}`,
            }),
        }),
    ],
    triggers: [myTrigger],
});
```

---

## UX Quality: Easy for Non-Technical Users

Connectors are used by people who have never seen an API — props, dropdowns, and descriptions must be self-explanatory.

**Before defining any `props`, read `property-ui-selection.md`** to pick the right component, display mode (`cards` / `stepper` / rich-text / date-range), and layout/grouping (`tabs` / `section` / filter `builder`) for each field.

1. **Never ask users to type IDs** — Use dynamic dropdowns so they pick items by name (`"Jane Doe (jane@x.com)"` not `"cus_abc123"`).
2. **Descriptions must teach** — Don't say "Enter the thread timestamp." Say "Click the three dots next to the message, select Copy Link, and paste the number at the end."
3. **Use Markdown instructions** for complex setup — Add `Property.MarkDown()` with numbered steps when a prop requires configuration in the third-party app.
4. **Set sensible defaults** — If 90% of users want the same value, make it the default.
5. **Plain language display names** — `"Create Contact"` not `"POST /contacts"`. Triggers: `"New Order"` not `"order.created webhook"`.
6. **Auth descriptions** must include step-by-step instructions to get the API key or set up OAuth.
7. **Helpful dropdown placeholders** — `"Please select a project first"` not empty.

Full patterns and examples: read `ux-guidelines.md`

---

## Output Quality: Table-Ready Data

Users pipe connector outputs into Google Sheets and FEMA Integration Platform Tables constantly — nested or inconsistent output breaks their workflows.

1. **Flatten nested objects** — `{ user: { name: "Jo" } }` → `{ user_name: "Jo" }`.
2. **Arrays of records must have consistent flat keys** — same keys on every object so each maps to a column.
3. **Single-record actions** return a flat object. **List/search actions** return a flat array.
4. **Human-readable key names** — `company_name` not `cName`. These become column headers.

Full patterns and examples: read `output-quality.md`

---

## AI-Ready Metadata (Required on New Actions & Triggers)

- **`audience`** (actions only): `'human' | 'ai' | 'both'` — written explicitly on every action (`'both'` for normal integration actions; `'human'` for LLM-wrappers/utilities). Downstream filters only see it when physically present.
- **`aiMetadata`**: `{ description, idempotent }` on every action, `{ description }` on every trigger — agent-facing description (what + when-to-pick + key constraint) and safe-retry hint derived from `run()`.
- **`classification`** (actions **and** triggers): `'READ' | 'SEARCH' | 'WRITE' | 'DESTRUCTIVE'` — what the step does to external state, judged from the `run()` body (never from the name). Renders as a badge in the builder's connector selector. **Every trigger is `'READ'`.**

A new action or trigger without these is a regression. Writing rules, `idempotent` derivation, the classification rubric, factory gotchas: read `ai-metadata.md`

---

## Gotchas that survive the workflow

Two things the step-by-step won't catch:

1. **Action/trigger `name` fields are permanent** — never change them after publishing; workflows store them by name.
2. **Auth stays imported, never re-exported** — actions/triggers do `import { myAppAuth } from '../auth'`; the auth object itself never appears in `index.ts` exports.
