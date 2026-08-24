# Connector SDK

## Quick Start

```bash
npm run create-connector     # Create connector
npm run create-action    # Add action
npm run create-trigger   # Add trigger
```

After creating: add path to `tsconfig.base.json`: `"@fema-ipaas/connector-{name}": ["packages/connectors/community/{name}/src/index.ts"]`

## Structure

```
packages/connectors/community/{name}/
├── src/index.ts           # createConnector() definition
├── src/lib/auth.ts        # Authentication
├── src/lib/actions/       # One file per action
├── src/lib/trigger/       # One file per trigger
├── src/lib/common/        # API helpers
└── src/i18n/translation.json
```

For a complete example: see `packages/connectors/community/airtable/`.

## Auth Patterns

Three types: `ConnectorAuth.SecretText()` with validate callback, `ConnectorAuth.OAuth2()`, `ConnectorAuth.CustomAuth({ props })`. All support `validate` for credential checking.

## Connector Context (available in `run()`)

- `context.auth` — resolved credentials
- `context.propsValue` — resolved input properties
- `context.store` — key-value persistence (put/get/delete, persists across executions)
- `context.files` — file upload/download. `files.write({ fileName, data })` accepts a `Readable` as well as a `Buffer`; pass a source stream (e.g. an S3 `getObject().Body`) to stream large files to storage without buffering them in the sandbox.
  - Input side: `Property.File({ streaming: true })` resolves to `StreamingFile = { filename, extension?, size?, body: Readable }` instead of the buffered `ConnectorFile`. Prefer a destination client that takes a stream of unknown length (S3 `lib-storage` `Upload`, Azure `uploadStream`, Google Drive `media.body`, SFTP `client.put`); `size` is best-effort (absent on chunked or `Content-Encoding`-compressed sources), so only reach for it when the API demands a `Content-Length`, and keep a `readableToBuffer` fallback on that path.
  - `httpClient` **does not retry stream bodies** — `retries` is forced to `0` when the body is a `Readable` or `form-data`, because the retry loop would replay an already-drained stream and send a truncated body. Buffer the body if you need retries. See [Large File Streaming](../../docs/build-connectors/connector-reference/large-file-streaming.mdx).
- `context.connections` — manage OAuth connections
- `context.server` — API access (token, apiUrl, publicUrl)
- `context.run.stop({ response })` — stop workflow, return HTTP response
- `context.run.pause({ pauseMetadata })` — pause for delay or webhook callback
- `context.run.respond({ response })` — send response, continue workflow
- `context.agent.tools()` — AI agent tool construction
- `context.generateResumeUrl()` — webhook resume URL for paused workflows
- `context.executionType` — `BEGIN` or `RESUME`

## Key Rules

- Trigger `run()` must return an **array**
- Use `httpClient` from `@fema-ipaas/connector-common` for HTTP requests
- Always provide `sampleData` for triggers
- i18n: `src/i18n/translation.json` with identity-mapped English keys
