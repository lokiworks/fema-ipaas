export * from './lib/core/common/telemetry'
export * from './lib/core/authentication/dto/authentication-response'
export * from './lib/core/authentication/dto/sign-up-request'
export * from './lib/core/authentication/dto/sign-in-request'
export * from './lib/core/authentication/dto/passwordless-request'
export * from './lib/core/authentication/model/principal-type'
export * from './lib/core/authentication/model/principal'
export * from './lib/core/authentication/user-identity'
export * from './lib/core/user'
export * from './lib/core/federated-authn'
export * from './lib/core/file'
export * from './lib/core/flag'
export * from './lib/core/property/markdown'
export * from './lib/core/store-entry/dto/store-entry-request'
export * from './lib/core/store-entry/store-entry'
export * from './lib/core/support-url'
export * from './lib/core/feedback-url'
export * from './lib/core/health'
// Foundation utilities/types live in @fema-ipaas/core-utils; shared re-exports the whole
// surface here once (instead of via per-file `export *` shim files under lib/core/common).
// The local ./lib/form-errors file remains for internal relative imports only.
export * from '@fema-ipaas/core-utils'

// management
export * from './lib/management/tenant'
export * from './lib/management/workspace'
export * from './lib/management/workspace-role/workspace-role.request'
export * from './lib/management/invitations'
export * from './lib/management/analytics'
export * from './lib/management/ai-tools'
export * from './lib/management/template'

// automation — workflows / execution / engine / agents / workers were extracted to
// @fema-ipaas/workflow-core (SRE-163); shared re-exports them for backward compat.
export * from '@fema-ipaas/workflow-core'
export * from './lib/automation/connection/connection'
export * from './lib/automation/connection/dto/read-connection-request'
export * from './lib/automation/connection/dto/upsert-connection-request'
export * from './lib/automation/variable'
export * from './lib/automation/connectors'
export * from './lib/automation/webhook'
export * from './lib/automation/trigger'
export * from './lib/automation/forms'
export * from './lib/automation/knowledge-base'
export * from './lib/automation/websocket'

// ee
export * from './lib/governance/audit-events'
export * from './lib/governance/system-limits'
export * from './lib/authentication/local-authn'
export * from './lib/authentication/otp'
export * from './lib/authentication/authn'
export * from './lib/management/workspace/workspace-requests'
