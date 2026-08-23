---
icon: 💾
---

# Data, Storage & Observability

How FEMA Integration Platform stores data, secrets, files, and how it surfaces platform activity. One section per subsystem.

### Tables

Built-in relational store (no external DB needed) — typed fields, cell-level values, spreadsheet UI. Entities: `Table`, `Field` (TEXT/NUMBER/DATE/DATETIME/STATIC_DROPDOWN), `Record`, `Cell`, `TableWebhook`. `table.service.ts` + `record-side-effects.ts`. All CE/EE/Cloud. Gotchas: record filtering is in-memory, missing cell = `''` (so NEQ/NOT_EXISTS match unset columns); only GT/GTE/LT/LTE are date-aware, EQ compares raw strings; DATE and DATETIME store the identical ISO instant and differ only in editor and display; routes need `securityAccess.project(..., permission)` — passing `undefined` skips RBAC. Integrates with workflows via the Tables connector (triggers register/delete a TableWebhook).

### Store Entry (key-value)

Backend-only persistent KV cache for connector steps during execution — no UI. Project-scoped, `jsonb` value, upsert on `(projectId, key)`. Key ≤128 chars, value ≤512KB (413 if over). All 3 endpoints are `securityAccess.engine()` only; projectId comes from the engine principal. Connectors use `storage.get/put/delete`. No list endpoint — opaque cache, not queryable.

### Variables

Project-scoped encrypted secrets referenced in workflows as `{{variables['NAME']}}`. Separate `variable` table (not connection). AES-256-CBC at rest; plaintext only via reveal endpoint (USER-only, audit-logged `VARIABLE_VALUE_REVEALED`) or the engine-only `/v1/worker/variables/:name`. Perms: READ/WRITE_VARIABLE. Gotcha: the create dialog value field is deliberately `type="text"` + CSS masking, not `type="password"` — avoids Chrome's breach-check popup and password-manager save (GIT-1619).

### File Storage

Central binary persistence with two backends: DB (`bytea`) or S3-compatible (AWS/R2/MinIO/OCI). `FileType` decides location + retention — expiring execution files (logs, step files, payloads) follow `FILE_STORAGE_LOCATION`; non-expiring files (assets, avatars, releases) always DB. Optional Zstd compression, transparent on read. Hourly cleanup job deletes stale execution files past `EXECUTION_DATA_RETENTION_DAYS`. `WORKFLOW_BUNDLE` is the one non-expiring type that's configurable (S3 signed URLs let workers fetch directly). Step files download via short-lived JWT. Files reach connectors in two shapes: **ApFile** (buffered `Buffer` + `base64`, from a plain `Property.File()`) and **ApStreamingFile** (`{ filename, extension?, size?, body: Readable }`, from `Property.File({ streaming: true })`) — a one-shot lazy file the engine never buffers, for uploading large files out to an external service.

### Secret Managers (EE)

Resolve workflow/connection secrets from external vaults (HashiCorp, AWS Secrets Manager, CyberArk Conjur, 1Password) instead of the DB. Reference syntax `{{connectionId|path}}`. Config encrypted at rest, secrets + connection status cached in Redis. Scope PLATFORM or PROJECT (projectIds `@>` containment). Gated by `platform.plan.secretManagersEnabled`. EE/Cloud only.

### OpenTelemetry Metrics

Two OTLP exporters, both pushed from the `system-snapshot` tick and both gated on `FEMA_OTEL_QUEUE_METRICS_ENABLED` plus `OTEL_EXPORTER_OTLP_ENDPOINT`:

- `otel-queue-metrics.ts` — `bullmq.job.count` gauge, jobs by queue and state.
- `otel-execution-metrics.ts` — design doc section 40's execution metrics: `workflow_execution_total`, `workflow_execution_failed_total`, `connector_action_total`, `connector_action_failed_total` (cumulative monotonic sums) and a `workflow_execution_duration` histogram.

- **Gotchas**:
  - Counters are accumulated **in process memory** and exported as cumulative sums with `aggregationTemporality: 2`. A restart resets them to zero, which is correct cumulative-OTLP behaviour — the collector handles the reset — but it means these are not durable and must not be used for billing or any figure that has to survive a deploy.
  - `PAUSED` and `RUNNING` are not failures. `isFailure` treats everything except `SUCCEEDED`, `RUNNING` and `PAUSED` as failed, so a new non-terminal status must be added there or it will be counted as a failure.
  - `connector_action_*` is aggregated in `executionHooks.onFinish`, not in the engine — the engine runs in a separate process and cannot reach the accumulator. That hook already loads the workflow version for other reasons, so mapping step name → connector name costs no extra query. The consequence is **run-level granularity**: counts land when a run finishes, so a run that never terminates contributes nothing.
  - Both exporters share `FEMA_OTEL_QUEUE_METRICS_ENABLED`. The name is now narrower than what it gates.

### Audit Log

"Who changed what", deliberately separate from Execution's "what the system ran" (design doc section 41). Rows land in `audit_event`, listed by tenant admins at `/tenant/audit` via `GET /v1/audit-events`.

- **Where**: `packages/server/api/src/app/audit` (entity, service, listener, controller), `packages/core/shared/src/lib/governance/audit-events` (`ApplicationEvent` union, `ApplicationEventName`, `summarizeApplicationEvent`).
- **Nothing calls the audit service directly.** `registerAuditEventListener` subscribes to the existing `applicationEvents` bus at boot, so every existing `sendUserEvent` / `sendWorkerEvent` call site persists automatically. To audit a new action, emit on that bus — do not add an `auditEventService.record` call.
- `enrichAuditEventParam` fills actor, email, IP, workspace name from the request, so emitters pass only `action` and `data`.

- **Gotchas**:
  - The bus and the event model long outlived the persistence. The EE listener was deleted with the rest of EE, which left every `sendUserEvent` call firing into an empty listener list — events were emitted and silently dropped, with no error anywhere. If audit rows are missing, check that the listener is registered before suspecting the emitters.
  - The entity is typed as `AuditEventRow` (`action: string`, `data: object`), not the `ApplicationEvent` discriminated union. TypeORM's `DeepPartial` cannot map a union whose members have differently-shaped `data`, and forcing it needs a cast. The union stays the API contract; the row is the storage shape.
  - `summarizeApplicationEvent` switches exhaustively on `action`. A new `ApplicationEventName` without a case there fails the build — that is deliberate, so new audited actions get a human-readable line.

### Analytics / Impact (EE)

Platform reporting: daily runs, active workflows/users, time-saved estimates. `PlatformAnalyticsReport` cached (5-min TTL) refreshed under a distributed lock; separate daily cron (12:00 UTC) tallies per-connector usage into `connectorMetadata.usage`. minutesSaved = runs × workflow.timeSavedPerRun. Powers `/impact` (Summary/Trends/Details). Gated by `analyticsEnabled` — NOT in CE. Frontend queries carry `enabled: platform.plan.analyticsEnabled`.

### Workflow Failure Alerts (EE)

Email on execution failure. First failure per workflowVersion per 24h window sends; rest suppressed via Redis counter `workflow_fail_count:<workflowVersionId>` (1-day TTL). Personal projects: single owner-only receiver toggle; team projects: any number of receivers. Platform admins can bulk sub/unsub across projects (max 5 concurrent). Receivers stored/compared lowercase. Edition check (`paidEditions`) in service, no plan flag. No Issues feature — email links straight to the run page. EE/Cloud only.

### Event Destinations (EE)

Streams platform/project events to webhook URLs in real time — internal AP workflow webhooks are valid targets (route into a workflow, fan out to Slack/Gmail/Teams). Subscribes to a subset of the 27 `ApplicationEventName` events. Delivery via BullMQ (`EVENT_DESTINATION` job) over `safeHttp` for external URLs; same-origin handler-workflow URLs skip BullMQ and dispatch through `webhookService.handleWebhook` (no outbound HTTP, dodges SSRF self-call, GIT-1539). Server-side cycle guard prevents recursion. Gated by `auditLogEnabled` (shares audit gating); lives under the Observability sidebar group. Frontend uses a TanStack DB live collection, not React Query.

### Benchmark CLI

`fema benchmark` load-tests the sync-webhook path and attributes latency to queue-wait vs service-time. Auto-discovers deployment shape (`GET /v1/worker-machines`) and drives load = execution slots (so a healthy deploy shows \~zero queue-wait; any reported queue-wait is a real finding). Authoritative latency is server/worker-measured (`Execution.timeline` QUEUE/PROVISION/BOOT/RUN + `/v1/health/diagnostics` in-region DB/Redis/S3 RTT); client-side numbers are observational only (cross-region). Auth via platform API key. Infra-diagnostics block is self-hosted only (`FEATURE_DISABLED` on Cloud). New App Instance Registry: apps self-register into Redis `appMachines` on their snapshot tick (no inbound healthcheck), kept separate from worker slots.

## Pages

- **Tables** — Field / Record / Cell and TableWebhooks
- **File Storage** — blobs in S3 or DB, compression, expiry
- **Key-Value Store** — project-scoped state connectors persist across runs
- **Knowledge Base** — documents chunked into vector embeddings for AI search
- **Analytics** — usage reporting
- **Audit Logs** — the persisted security-action record
