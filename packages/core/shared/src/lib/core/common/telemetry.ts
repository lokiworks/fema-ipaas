import type { UserId, WorkflowId, WorkspaceId } from '@fema/core-utils'
import type { RunEnvironment } from '@fema/workflow-core'

type WorkflowCreated = {
    workflowId: WorkflowId
}
type ConnectorsSearch = {
    target: 'steps' | 'triggers'
    search: string
}

type TemplateSearch = {
    search: string
    tags: string[]
    connectors: string[]
}

type RunCreated = {
    workspaceId: WorkspaceId
    workflowId: WorkflowId
    environment: RunEnvironment
    count: number
}

type WorkflowPublished = {
    workflowId: WorkflowId
}

type SignedUp = {
    userId: UserId
    email?: string
    firstName?: string
    lastName?: string
    workspaceId: WorkspaceId
}

type EmailCodeRequested = {
    isNewIdentity: boolean
}

type EmailCodeVerified = {
    needsNameStep: boolean
}

type EmailCodeRejected = {
    errorCode: string
}

type EmailCodeResendRequested = Record<string, never>

type CaptchaUnavailable = {
    surface: string
}

type QuotaAlert = {
    percentageUsed: number
}
type WorkflowImported = {
    id: string
    name: string
    location:
    | 'import workflow view'
    | 'inside the builder'
    | 'import workflow by uri encoded query param'
    tab?: string
}
type WorkflowImportedUsingFile = {
    location: 'inside dashboard' | 'inside the builder'
    multiple: boolean
}

type WorkflowIssueClicked = {
    workflowId: string
}

type WorkflowIssueResolved = {
    workflowId: string
}

type RequestTrialSubmitted = {
    fullName: string
    email: string
    numberOfEmployees: string
    companyName: string
    goal: string
}

type RequestTrialClicked = {
    location: string
}

type KeyActivated = {
    date: string
    key: string
}

type UpgradeClicked = {
    limitType?: 'team'
}

type UpgradePopup = {
    limitType?: 'team'
}

type ReferralLinkCopied = {
    userId: UserId
}

type RewardButtonClicked = {
    source: 'note' | 'rewards-button'
}

type RewardInstructionsClicked = {
    type: 'share-template' | 'linkedin' | 'referral' | 'contribute-connector'
}

type Referral = {
    referredUserId: UserId
}

type WorkflowShared = {
    workflowId: WorkflowId
    workspaceId: WorkspaceId
}

type OpenedFromDashboard = {
    location: 'sidenav' | 'tasks-progress'
}

type FormsViewed = {
    workflowId: string
    workspaceId: string
    formProps: Record<string, unknown>
}

type UserInvited = {
    tenantId: string
    workspaceId?: string
    email: string
}

type TriggerFailuresExceeded = {
    workspaceId: string
    workflowId: string
    connectorName: string
    connectorVersion: string
}
type AiProviderConfiguredOrUsed = {
    provider: string
    workspaceId: string
    tenantId: string
}

type McpToolCalled = {
    mcpId: string
    toolName: string
}

type McpServerConnected = {
    userId: string
    workspaceId?: string
    tenantId?: string
}

type ConnectorSelectorSearch = {
    search: string
    isTrigger: boolean
    selectedActionOrTriggerName: string | null
}

type SignUpSubmitted = {
    method: 'email'
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_term?: string
    utm_content?: string
    gclid?: string
    fbclid?: string
    ref?: string
    ap_cta?: string
}

type SignUpFailed = {
    errorCode: string
}

type EmailVerificationCompleted = Record<string, never>

type SignInSubmitted = {
    method: 'email'
}

type SignInFailed = {
    errorCode: string
}

type FederatedLoginStarted = {
    provider: 'google' | 'saml'
}

type SignedIn = {
    userId: UserId
    tenantId: string
}
export enum TelemetryEventName {
    SIGNED_UP = 'signed.up',
    EMAIL_CODE_REQUESTED = 'email.code.requested',
    EMAIL_CODE_VERIFIED = 'email.code.verified',
    EMAIL_CODE_REJECTED = 'email.code.rejected',
    EMAIL_CODE_RESEND_REQUESTED = 'email.code.resend.requested',
    CAPTCHA_UNAVAILABLE = 'captcha.unavailable',
    QUOTA_ALERT = 'quota.alert',
    REQUEST_TRIAL_CLICKED = 'request.trial.clicked',
    REQUEST_TRIAL_SUBMITTED = 'request.trial.submitted',
    KEY_ACTIVATED = 'key.activated',
    WORKFLOW_ISSUE_CLICKED = 'workflow.issue.clicked',
    WORKFLOW_ISSUE_RESOLVED = 'workflow.issue.resolved',
    USER_INVITED = 'user.invited',
    UPGRADE_POPUP = 'upgrade.popup',
    CREATED_WORKFLOW = 'workflow.created',
    DEMO_IMPORTED = 'demo.imported',
    EXECUTION_CREATED = 'run.created',
    WORKFLOW_PUBLISHED = 'workflow.published',
    /**used with templates dialog + import workflow component + workflows imported by uri query param*/
    WORKFLOW_IMPORTED = 'workflow.imported',
    /**used only with import workflow dialog*/
    WORKFLOW_IMPORTED_USING_FILE = 'workflow.imported.using.file',
    CONNECTORS_SEARCH = 'connectors.search',
    REFERRAL = 'referral',
    REFERRAL_LINK_COPIED = 'referral.link.copied',
    WORKFLOW_SHARED = 'workflow.shared',
    TEMPLATE_SEARCH = 'template.search',
    FORMS_VIEWED = 'forms.viewed',
    FORMS_SUBMITTED = 'forms.submitted',
    REWARDS_OPENED = 'rewards.opened',
    REWARDS_INSTRUCTION_CLICKED = 'rewards.instructions.clicked',
    TRIGGER_FAILURES_EXCEEDED = 'trigger.failures.exceeded',
    AI_PROVIDER_USED = 'ai.provider.used',
    AI_PROVIDER_CONFIGURED = 'ai.provider.configured',
    MCP_TOOL_CALLED = 'mcp.tool.called',
    MCP_SERVER_CONNECTED = 'mcp.server.connected',
    UPGRADE_POPUP_OPENED = 'upgrade.popup.opened',
    UPGRADE_CLICKED = 'upgrade.clicked',
    OPENED_PRICING_FROM_DASHBOARD = 'opened.pricing.from.dashboard',
    CONNECTOR_SELECTOR_SEARCH = 'connector.selector.search',
    SIGN_UP_SUBMITTED = 'signup.submitted',
    SIGN_UP_FAILED = 'signup.failed',
    EMAIL_VERIFICATION_COMPLETED = 'email.verification.completed',
    SIGN_IN_SUBMITTED = 'signin.submitted',
    SIGN_IN_FAILED = 'signin.failed',
    FEDERATED_LOGIN_STARTED = 'federated.login.started',
    SIGNED_IN = 'signed.in',
    CHAT_PAGE_VIEWED = 'chat.page.viewed',
}

type BaseTelemetryEvent<T, P> = {
    name: T
    payload: P
}

export type TelemetryEvent =
  | BaseTelemetryEvent<TelemetryEventName.SIGNED_UP, SignedUp>
  | BaseTelemetryEvent<
  TelemetryEventName.EMAIL_CODE_REQUESTED,
  EmailCodeRequested
  >
  | BaseTelemetryEvent<
  TelemetryEventName.EMAIL_CODE_VERIFIED,
  EmailCodeVerified
  >
  | BaseTelemetryEvent<
  TelemetryEventName.EMAIL_CODE_REJECTED,
  EmailCodeRejected
  >
  | BaseTelemetryEvent<
  TelemetryEventName.EMAIL_CODE_RESEND_REQUESTED,
  EmailCodeResendRequested
  >
  | BaseTelemetryEvent<
  TelemetryEventName.CAPTCHA_UNAVAILABLE,
  CaptchaUnavailable
  >
  | BaseTelemetryEvent<TelemetryEventName.REFERRAL, Referral>
  | BaseTelemetryEvent<
  TelemetryEventName.REQUEST_TRIAL_CLICKED,
  RequestTrialClicked
  >
  | BaseTelemetryEvent<TelemetryEventName.KEY_ACTIVATED, KeyActivated>
  | BaseTelemetryEvent<
  TelemetryEventName.REQUEST_TRIAL_SUBMITTED,
  RequestTrialSubmitted
  >
  | BaseTelemetryEvent<TelemetryEventName.WORKFLOW_ISSUE_CLICKED, WorkflowIssueClicked>
  | BaseTelemetryEvent<
  TelemetryEventName.WORKFLOW_ISSUE_RESOLVED,
  WorkflowIssueResolved
  >
  | BaseTelemetryEvent<TelemetryEventName.UPGRADE_CLICKED, UpgradeClicked>
  | BaseTelemetryEvent<TelemetryEventName.UPGRADE_POPUP, UpgradePopup>
  | BaseTelemetryEvent<TelemetryEventName.EXECUTION_CREATED, RunCreated>
  | BaseTelemetryEvent<TelemetryEventName.WORKFLOW_PUBLISHED, WorkflowPublished>
  | BaseTelemetryEvent<TelemetryEventName.QUOTA_ALERT, QuotaAlert>
  | BaseTelemetryEvent<TelemetryEventName.CREATED_WORKFLOW, WorkflowCreated>
  | BaseTelemetryEvent<TelemetryEventName.TEMPLATE_SEARCH, TemplateSearch>
  | BaseTelemetryEvent<TelemetryEventName.CONNECTORS_SEARCH, ConnectorsSearch>
  | BaseTelemetryEvent<TelemetryEventName.WORKFLOW_IMPORTED, WorkflowImported>
  | BaseTelemetryEvent<
  TelemetryEventName.WORKFLOW_IMPORTED_USING_FILE,
  WorkflowImportedUsingFile
  >
  | BaseTelemetryEvent<
  TelemetryEventName.REFERRAL_LINK_COPIED,
  ReferralLinkCopied
  >
  | BaseTelemetryEvent<TelemetryEventName.WORKFLOW_SHARED, WorkflowShared>
  | BaseTelemetryEvent<TelemetryEventName.DEMO_IMPORTED, Record<string, never>>
  | BaseTelemetryEvent<
  TelemetryEventName.OPENED_PRICING_FROM_DASHBOARD,
  OpenedFromDashboard
  >
  | BaseTelemetryEvent<TelemetryEventName.FORMS_VIEWED, FormsViewed>
  | BaseTelemetryEvent<TelemetryEventName.USER_INVITED, UserInvited>
  | BaseTelemetryEvent<TelemetryEventName.FORMS_SUBMITTED, FormsViewed>
  | BaseTelemetryEvent<TelemetryEventName.REWARDS_OPENED, RewardButtonClicked>
  | BaseTelemetryEvent<
  TelemetryEventName.REWARDS_INSTRUCTION_CLICKED,
  RewardInstructionsClicked
  >
  | BaseTelemetryEvent<
  TelemetryEventName.TRIGGER_FAILURES_EXCEEDED,
  TriggerFailuresExceeded
  >
  | BaseTelemetryEvent<
  TelemetryEventName.AI_PROVIDER_USED,
  AiProviderConfiguredOrUsed
  >
  | BaseTelemetryEvent<
  TelemetryEventName.AI_PROVIDER_CONFIGURED,
  AiProviderConfiguredOrUsed
  >
  | BaseTelemetryEvent<TelemetryEventName.MCP_TOOL_CALLED, McpToolCalled>
  | BaseTelemetryEvent<TelemetryEventName.MCP_SERVER_CONNECTED, McpServerConnected>
  | BaseTelemetryEvent<TelemetryEventName.CONNECTOR_SELECTOR_SEARCH, ConnectorSelectorSearch>
  | BaseTelemetryEvent<TelemetryEventName.SIGN_UP_SUBMITTED, SignUpSubmitted>
  | BaseTelemetryEvent<TelemetryEventName.SIGN_UP_FAILED, SignUpFailed>
  | BaseTelemetryEvent<
  TelemetryEventName.EMAIL_VERIFICATION_COMPLETED,
  EmailVerificationCompleted
  >
  | BaseTelemetryEvent<TelemetryEventName.SIGN_IN_SUBMITTED, SignInSubmitted>
  | BaseTelemetryEvent<TelemetryEventName.SIGN_IN_FAILED, SignInFailed>
  | BaseTelemetryEvent<
  TelemetryEventName.FEDERATED_LOGIN_STARTED,
  FederatedLoginStarted
  >
  | BaseTelemetryEvent<TelemetryEventName.SIGNED_IN, SignedIn>
  | BaseTelemetryEvent<TelemetryEventName.CHAT_PAGE_VIEWED, Record<string, never>>
