---
icon: 📝
---

# Human Input

Human Input exposes public endpoints that let external users interact with workflows via two modes: **Forms** (structured input fields) and **Chat** (conversational UI). Both are backed by workflows whose trigger is the `@fema/connector-forms` connector. The backend endpoints are read-only and public — they return UI metadata (title, input schema, branding); the actual submission goes through the webhook endpoint.

### Entities & services
- `human-input.service.ts` — resolves workflow, validates trigger type, builds response.
- Two controllers: `GET /v1/human-input/form/:workflowId` and `GET /v1/human-input/chat/:workflowId` (both `securityAccess.public()`).
- **Forms connector** provides three triggers: `form_submission`, `file_submission`, `chat_submission`.
- Frontend renders forms at `/forms/<workflowId>` and chat at `/chat/<workflowId>`.

### How it works
- **`getFormByWorkflowIdOrThrow`**: loads workflow → if no published version and `useDraft` false, returns null (404) → asserts trigger is forms-connector `form_submission`/`file_submission` → resolves exact connector version. `file_submission` returns a hardcoded single-file schema (`SIMPLE_FILE_PROPS`); `form_submission` returns `trigger.settings.input`.
- **`getChatUIByWorkflowIdOrThrow`**: asserts `chat_submission` trigger → fetches platform logo + name → returns `ChatUIResponse` with branding embedded (supports white-labeled chat).
- Form input types: `text`, `text_area`, `toggle`, `file`.
- **`waitForResponse`**: when true, the workflow run pauses after triggering and the frontend waits for a value to display back to the submitter.

### Gotchas
- Endpoints are fully public — anyone with the workflow ID can read form/chat metadata (but only the UI definition, not execute).
- A workflow without a published version returns 404 unless `useDraft=true` is passed — protects unpublished forms from accidental exposure.
- These endpoints only return the UI definition; triggering the workflow itself goes through the webhook endpoint.

### Editions
Fully available in CE/EE/Cloud — no plan flag required.

### Key files
Entry point: `humanInputService`, defined in the human-input service and called by both the form and chat controllers.

- `packages/server/api/src/app/workflows/workflow/human-input/` — the whole backend slice: both controllers, the service, and the module that registers them
- `packages/core/execution/src/lib/workflows/form.ts` — shared zod contracts: `FormInputType`, `FormProps`, `FormResponse`, `ChatUIProps`, `ChatUIResponse`, `USE_DRAFT_QUERY_PARAM_NAME`
- `packages/web/src/features/forms/` — form rendering component, API client, and query hooks
- `packages/web/src/features/chat/` — chat UI components (bubble, input, message list, intro)
- `packages/web/src/app/routes/forms/` — public form page
- `packages/web/src/app/routes/chat/` — public chat page, the reusable chat shell, and the in-builder Drawer wrapper for testing `chat_submission` workflows
- `packages/web/src/app/builder/state/chat-state.ts` — builder-side chat state paired with the Drawer

Paths verified 2026-07-17. An earlier version pointed at `packages/core/shared/src/lib/automation/workflows/form.ts`; it moved to `packages/core/execution/src/lib/workflows/form.ts`.
