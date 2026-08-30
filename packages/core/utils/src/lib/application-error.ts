import type { WorkflowId, ExecutionId, WorkflowVersionId, ProjectId, UserId } from './id-generator'
import type { Permission, TenantUsageMetric } from './permission'
import type { ProjectRole } from './project-role'

export class ApplicationError extends Error {
    constructor(public error: ApplicationErrorParams, message?: string) {
        super(error.code + (message ? `: ${message}` : ''))
    }

    override toString(): string {
        return JSON.stringify({
            code: this.error.code,
            message: this.message,
            params: this.error.params,
        })
    }
}

export type ApplicationErrorParams =
    | AuthenticationParams
    | AuthorizationErrorParams
    | EmailIsNotVerifiedErrorParams
    | EngineOperationFailureParams
    | EntityNotFoundErrorParams
    | ExistingUserErrorParams
    | WorkflowOperationErrorParams
    | WorkflowOperationInProgressErrorParams
    | ExecutionRetryOutsideRetentionErrorParams
    | InvalidConnectionParams
    | InvalidBearerTokenParams
    | InvalidClaimParams
    | InvalidCloudClaimParams
    | InvalidCredentialsErrorParams
    | InvalidOtpParams
    | InvitationOnlySignUpParams
    | PermissionDeniedErrorParams
    | QuotaExceededParams
    | FeatureDisabledErrorParams
    | SystemInvalidErrorParams
    | SystemPropNotDefinedErrorParams
    | TestTriggerFailedErrorParams
    | TriggerUpdateStatusErrorParams
    | ValidationErrorParams
    | InvitationOnlySignUpParams
    | UserIsInActiveErrorParams
    | DomainIsNotAllowedErrorParams
    | EmailAuthIsDisabledParams
    | SessionExpiredParams
    | ProjectExternalIdAlreadyExistsParams
    | SandboxMemoryIssueParams
    | SandboxExecutionTimeoutParams
    | SandboxInternalErrorParams
    | ConnectorSyncNotSupportedErrorParams
    | SandboxLogSizeExceededParams
    | SecretManagerConnectionFailedParams
    | SecretManagerGetSecretFailedParams
    | WorkflowMigrationFailedParams
    | ResumeLogsFileMissingParams
    | GenericErrorParams

export type BaseErrorParams<T, V> = {
    code: T
    params: V
}

export type SandboxMemoryIssueParams = BaseErrorParams<ErrorCode.SANDBOX_MEMORY_ISSUE, {
    standardOutput: string
    standardError: string
}>

export type SandboxExecutionTimeoutParams = BaseErrorParams<ErrorCode.SANDBOX_EXECUTION_TIMEOUT, {
    standardOutput: string
    standardError: string
    neverStarted?: boolean
}>

export type SandboxInternalErrorParams = BaseErrorParams<ErrorCode.SANDBOX_INTERNAL_ERROR, {
    standardOutput: string
    standardError: string
    reason: string
}>

export type InvitationOnlySignUpParams = BaseErrorParams<
ErrorCode.INVITATION_ONLY_SIGN_UP,
{
    message?: string
}
>

export type InvalidClaimParams = BaseErrorParams<ErrorCode.INVALID_CLAIM, { redirectUrl: string, tokenUrl: string, clientId: string, message: string }>
export type InvalidCloudClaimParams = BaseErrorParams<ErrorCode.INVALID_CLOUD_CLAIM, { connectorName: string }>

export type InvalidBearerTokenParams = BaseErrorParams<ErrorCode.INVALID_BEARER_TOKEN, {
    message?: string
}>

export type SessionExpiredParams = BaseErrorParams<ErrorCode.SESSION_EXPIRED, {
    message?: string
}>

export type EmailAuthIsDisabledParams = BaseErrorParams<ErrorCode.EMAIL_AUTH_DISABLED, Record<string, never>>

export type AuthorizationErrorParams = BaseErrorParams<
ErrorCode.AUTHORIZATION,
Record<string, string> &
{
    message?: string
}
>

export type PermissionDeniedErrorParams = BaseErrorParams<
ErrorCode.PERMISSION_DENIED,
{
    userId: UserId
    projectId: ProjectId
    projectRole: ProjectRole | null
    permission: Permission | undefined
}
>

export type SystemInvalidErrorParams = BaseErrorParams<
ErrorCode.SYSTEM_PROP_INVALID,
{
    prop: string
}
>

export type ExecutionRetryOutsideRetentionErrorParams = BaseErrorParams<
ErrorCode.EXECUTION_RETRY_OUTSIDE_RETENTION,
{
    executionId: ExecutionId
    failedJobRetentionDays: number
}
>

export type InvalidCredentialsErrorParams = BaseErrorParams<
ErrorCode.INVALID_CREDENTIALS,
null
>

export type DomainIsNotAllowedErrorParams = BaseErrorParams<
ErrorCode.DOMAIN_NOT_ALLOWED,
{
    domain: string
}
>

export type EmailIsNotVerifiedErrorParams = BaseErrorParams<
ErrorCode.EMAIL_IS_NOT_VERIFIED,
{
    email: string
}
>

export type UserIsInActiveErrorParams = BaseErrorParams<
ErrorCode.USER_IS_INACTIVE,
{
    email: string
}
>

export type ExistingUserErrorParams = BaseErrorParams<
ErrorCode.EXISTING_USER,
{
    email: string
    tenantId: string | null
}
>

export type SystemPropNotDefinedErrorParams = BaseErrorParams<
ErrorCode.SYSTEM_PROP_NOT_DEFINED,
{
    prop: string
}
>

export type WorkflowOperationErrorParams = BaseErrorParams<
ErrorCode.WORKFLOW_OPERATION_INVALID,
{
    message: string
}
>

export type WorkflowOperationInProgressErrorParams = BaseErrorParams<
ErrorCode.WORKFLOW_OPERATION_IN_PROGRESS, {
    message: string
}>

export type TestTriggerFailedErrorParams = BaseErrorParams<
ErrorCode.TEST_TRIGGER_FAILED,
{
    message: string
}
>

export type EntityNotFoundErrorParams = BaseErrorParams<
ErrorCode.ENTITY_NOT_FOUND,
{
    message?: string
    entityType?: string
    entityId?: string
    extra?: Record<string, unknown>
}
>

export type ConnectorSyncNotSupportedErrorParams = BaseErrorParams<ErrorCode.CONNECTOR_SYNC_NOT_SUPPORTED, {
    release: string
    message: string
}>

export type ValidationErrorParams = BaseErrorParams<
ErrorCode.VALIDATION,
{
    message: string
}
>

export type TriggerUpdateStatusErrorParams = BaseErrorParams<
ErrorCode.TRIGGER_UPDATE_STATUS,
{
    workflowId?: WorkflowId
    workflowVersionId?: WorkflowVersionId
    message?: string
    standardOutput?: string
    standardError?: string
}
>

export type EngineOperationFailureParams = BaseErrorParams<
ErrorCode.ENGINE_OPERATION_FAILURE,
{
    message: string
    context?: unknown
}
>

export type InvalidConnectionParams = BaseErrorParams<
ErrorCode.INVALID_CONNECTION,
{
    error: string
}
>

export type QuotaExceededParams = BaseErrorParams<
ErrorCode.QUOTA_EXCEEDED,
{
    metric: TenantUsageMetric
    usage?: number
    limit?: number
}
>

export type FeatureDisabledErrorParams = BaseErrorParams<
ErrorCode.FEATURE_DISABLED,
{
    message: string
}>

export type AuthenticationParams = BaseErrorParams<
ErrorCode.AUTHENTICATION,
{
    message: string
}>

export type InvalidOtpParams = BaseErrorParams<ErrorCode.INVALID_OTP, Record<string, never>>

export type ProjectExternalIdAlreadyExistsParams = BaseErrorParams<ErrorCode.PROJECT_EXTERNAL_ID_ALREADY_EXISTS, {
    externalId: string
}>

export type SandboxLogSizeExceededParams = BaseErrorParams<ErrorCode.SANDBOX_LOG_SIZE_EXCEEDED, {
    standardOutput: string
    standardError: string
}>

export type SecretManagerConnectionFailedParams = BaseErrorParams<ErrorCode.SECRET_MANAGER_CONNECTION_FAILED, {
    message: string
    provider: string
}>

export type SecretManagerGetSecretFailedParams = BaseErrorParams<ErrorCode.SECRET_MANAGER_GET_SECRET_FAILED, {
    message: string
    provider: string
    request: Record<string, unknown>
}>

export type WorkflowMigrationFailedParams = BaseErrorParams<ErrorCode.WORKFLOW_MIGRATION_FAILED, {
    workflowVersionId: string
    message: string
}>

export type ResumeLogsFileMissingParams = BaseErrorParams<ErrorCode.RESUME_LOGS_FILE_MISSING, {
    runId: string
}>

export type GenericErrorParams = BaseErrorParams<ErrorCode.GENERIC_ERROR, {
    message: string
}>

export enum ErrorCode {
    INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
    AUTHENTICATION = 'AUTHENTICATION',
    AUTHORIZATION = 'AUTHORIZATION',
    DOMAIN_NOT_ALLOWED = 'DOMAIN_NOT_ALLOWED',
    EMAIL_IS_NOT_VERIFIED = 'EMAIL_IS_NOT_VERIFIED',
    ENGINE_OPERATION_FAILURE = 'ENGINE_OPERATION_FAILURE',
    ENTITY_NOT_FOUND = 'ENTITY_NOT_FOUND',
    SANDBOX_EXECUTION_TIMEOUT = 'SANDBOX_EXECUTION_TIMEOUT',
    SANDBOX_MEMORY_ISSUE = 'SANDBOX_MEMORY_ISSUE',
    SANDBOX_INTERNAL_ERROR = 'SANDBOX_INTERNAL_ERROR',
    EMAIL_AUTH_DISABLED = 'EMAIL_AUTH_DISABLED',
    EXISTING_USER = 'EXISTING_USER',
    PROJECT_EXTERNAL_ID_ALREADY_EXISTS = 'PROJECT_EXTERNAL_ID_ALREADY_EXISTS',
    WORKFLOW_OPERATION_INVALID = 'WORKFLOW_OPERATION_INVALID',
    WORKFLOW_OPERATION_IN_PROGRESS = 'WORKFLOW_OPERATION_IN_PROGRESS',
    EXECUTION_RETRY_OUTSIDE_RETENTION = 'EXECUTION_RETRY_OUTSIDE_RETENTION',
    INVALID_CONNECTION = 'INVALID_CONNECTION',
    INVALID_BEARER_TOKEN = 'INVALID_BEARER_TOKEN',
    SESSION_EXPIRED = 'SESSION_EXPIRED',
    INVALID_CLAIM = 'INVALID_CLAIM',
    INVALID_CLOUD_CLAIM = 'INVALID_CLOUD_CLAIM',
    INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
    INVALID_OTP = 'INVALID_OTP',
    INVITATION_ONLY_SIGN_UP = 'INVITATION_ONLY_SIGN_UP',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
    FEATURE_DISABLED = 'FEATURE_DISABLED',
    SYSTEM_PROP_INVALID = 'SYSTEM_PROP_INVALID',
    SYSTEM_PROP_NOT_DEFINED = 'SYSTEM_PROP_NOT_DEFINED',
    TEST_TRIGGER_FAILED = 'TEST_TRIGGER_FAILED',
    TRIGGER_UPDATE_STATUS = 'TRIGGER_UPDATE_STATUS',
    USER_IS_INACTIVE = 'USER_IS_INACTIVE',
    VALIDATION = 'VALIDATION',
    CONNECTOR_SYNC_NOT_SUPPORTED = 'CONNECTOR_SYNC_NOT_SUPPORTED',
    SANDBOX_LOG_SIZE_EXCEEDED = 'SANDBOX_LOG_SIZE_EXCEEDED',
    SECRET_MANAGER_CONNECTION_FAILED = 'SECRET_MANAGER_CONNECTION_FAILED',
    SECRET_MANAGER_GET_SECRET_FAILED = 'SECRET_MANAGER_GET_SECRET_FAILED',
    WORKFLOW_MIGRATION_FAILED = 'WORKFLOW_MIGRATION_FAILED',
    RESUME_LOGS_FILE_MISSING = 'RESUME_LOGS_FILE_MISSING',
    GENERIC_ERROR = 'GENERIC_ERROR',
}
