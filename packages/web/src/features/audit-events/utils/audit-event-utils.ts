import {
  ApplicationEvent,
  ApplicationEventName,
  WorkflowOperationType,
  summarizeApplicationEvent,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

function summarizeWorkflowUpdate(
  event: Extract<
    ApplicationEvent,
    { action: ApplicationEventName.WORKFLOW_UPDATED }
  >,
): string {
  const workflow = event.data.workflowVersion.displayName;
  const { request } = event.data;
  switch (request.type) {
    case WorkflowOperationType.ADD_ACTION:
      return t('auditAddedAction', {
        action: request.request.action.displayName,
        workflow,
      });
    case WorkflowOperationType.UPDATE_ACTION:
      return t('auditUpdatedAction', {
        action: request.request.displayName,
        workflow,
      });
    case WorkflowOperationType.DELETE_ACTION:
      return t('auditDeletedActions', {
        actions: request.request.names.join(', '),
        workflow,
      });
    case WorkflowOperationType.CHANGE_NAME:
      return t('auditRenamedWorkflow', {
        workflow,
        name: request.request.displayName,
      });
    case WorkflowOperationType.LOCK_AND_PUBLISH:
      return t('auditLockedAndPublished', { workflow });
    case WorkflowOperationType.USE_AS_DRAFT:
      return t('auditUnlockedWorkflow', { workflow });
    case WorkflowOperationType.MOVE_ACTION:
      return t('auditMovedAction', {
        action: request.request.name,
        parent: request.request.newParentStep,
      });
    case WorkflowOperationType.LOCK_WORKFLOW:
      return t('auditLockedWorkflow', { workflow });
    case WorkflowOperationType.CHANGE_STATUS:
      return t('auditChangedStatus', {
        workflow,
        status: request.request.status,
      });
    case WorkflowOperationType.DUPLICATE_ACTION:
      return t('auditDuplicatedAction', {
        action: request.request.stepName,
        workflow,
      });
    case WorkflowOperationType.IMPORT_WORKFLOW:
      return t('auditImportedWorkflow', {
        workflow: request.request.displayName,
      });
    case WorkflowOperationType.UPDATE_TRIGGER:
      return t('auditUpdatedTrigger', {
        workflow,
        trigger: request.request.displayName,
      });
    case WorkflowOperationType.CHANGE_FOLDER:
      return t('auditMovedToFolder', {
        workflow,
        folder: request.request.folderId,
      });
    case WorkflowOperationType.SAVE_SAMPLE_DATA:
      return t('auditSavedSampleData', {
        step: request.request.stepName,
        workflow,
      });
    case WorkflowOperationType.UPDATE_SAMPLE_DATA_INFO:
      return t('auditUpdatedSampleDataInfo', {
        step: request.request.stepName,
        workflow,
      });
    case WorkflowOperationType.ADD_BRANCH:
      return t('auditAddedBranch', {
        index: request.request.branchIndex + 1,
        workflow,
      });
    case WorkflowOperationType.DELETE_BRANCH:
      return t('auditDeletedBranch', {
        index: request.request.branchIndex + 1,
        workflow,
      });
    case WorkflowOperationType.DUPLICATE_BRANCH:
      return t('auditDuplicatedBranch', {
        index: request.request.branchIndex + 1,
        workflow,
      });
    case WorkflowOperationType.MOVE_BRANCH:
      return t('auditMovedBranch', {
        from: request.request.sourceBranchIndex + 1,
        to: request.request.targetBranchIndex + 1,
        workflow,
      });
    case WorkflowOperationType.SET_SKIP_ACTION:
      return t('auditSkippedActions', {
        actions: request.request.names.join(', '),
        workflow,
      });
    case WorkflowOperationType.UPDATE_METADATA:
      return t('auditUpdatedMetadata', { workflow });
    case WorkflowOperationType.UPDATE_MINUTES_SAVED:
      return t('auditUpdatedMinutesSaved', { workflow });
    case WorkflowOperationType.UPDATE_OWNER:
      return t('auditUpdatedOwner', {
        workflow,
        owner: request.request.ownerId,
      });
    case WorkflowOperationType.ADD_NOTE:
      return t('auditAddedNote', { workflow });
    case WorkflowOperationType.UPDATE_NOTE:
      return t('auditUpdatedNote', { workflow });
    case WorkflowOperationType.DELETE_NOTE:
      return t('auditDeletedNote', { workflow });
    case WorkflowOperationType.SET_JOIN_EDGES:
      return t('auditSetJoinEdges', {
        count: request.request.joinEdges.length,
        workflow,
      });
    default:
      return summarizeApplicationEvent(event);
  }
}

function summarize(event: ApplicationEvent): string {
  switch (event.action) {
    case ApplicationEventName.WORKFLOW_UPDATED:
      return summarizeWorkflowUpdate(event);
    case ApplicationEventName.EXECUTION_STARTED:
      return t('auditRunStarted', { run: event.data.execution.id });
    case ApplicationEventName.EXECUTION_FINISHED:
      return t('auditRunFinished', { run: event.data.execution.id });
    case ApplicationEventName.EXECUTION_RESUMED:
      return t('auditRunResumed', { run: event.data.execution.id });
    case ApplicationEventName.EXECUTION_RETRIED:
      return t('auditRunRetried', { run: event.data.execution.id });
    case ApplicationEventName.WORKFLOW_CREATED:
      return t('auditWorkflowCreated', { workflow: event.data.workflow.id });
    case ApplicationEventName.WORKFLOW_DELETED:
      return t('auditWorkflowDeleted', {
        workflow: event.data.workflow.id,
        name: event.data.workflowVersion.displayName,
      });
    case ApplicationEventName.WORKFLOW_PUBLISHED:
      return t('auditWorkflowPublished', {
        workflow: event.data.workflowVersion.displayName,
      });
    case ApplicationEventName.WORKFLOW_ACTIVATED:
      return t('auditWorkflowActivated', {
        workflow: event.data.workflowVersion.displayName,
      });
    case ApplicationEventName.WORKFLOW_DEACTIVATED:
      return t('auditWorkflowDeactivated', {
        workflow: event.data.workflowVersion.displayName,
      });
    case ApplicationEventName.FOLDER_CREATED:
      return t('auditFolderCreated', { folder: event.data.folder.displayName });
    case ApplicationEventName.FOLDER_UPDATED:
      return t('auditFolderUpdated', { folder: event.data.folder.displayName });
    case ApplicationEventName.FOLDER_DELETED:
      return t('auditFolderDeleted', { folder: event.data.folder.displayName });
    case ApplicationEventName.CONNECTION_UPSERTED:
      return t('auditConnectionUpserted', {
        connection: event.data.connection.displayName,
        externalId: event.data.connection.externalId,
      });
    case ApplicationEventName.CONNECTION_DELETED:
      return t('auditConnectionDeleted', {
        connection: event.data.connection.displayName,
        externalId: event.data.connection.externalId,
      });
    case ApplicationEventName.VARIABLE_UPSERTED:
      return t('auditVariableUpserted', { variable: event.data.variable.name });
    case ApplicationEventName.VARIABLE_DELETED:
      return t('auditVariableDeleted', { variable: event.data.variable.name });
    case ApplicationEventName.VARIABLE_VALUE_REVEALED:
      return t('auditVariableRevealed', { variable: event.data.variable.name });
    case ApplicationEventName.EXECUTION_PAYLOAD_REVEALED:
      return t('auditRunPayloadRevealed', {
        step: event.data.stepName,
        run: event.data.execution.id,
      });
    case ApplicationEventName.ISSUE_REPLAYED:
      return t('auditIssueReplayed', {
        count: event.data.count,
        issue: event.data.issue.title,
      });
    case ApplicationEventName.RUNS_RERUN:
      return t('auditRunsRerun', {
        count: event.data.count,
        strategy: event.data.strategy,
      });
    case ApplicationEventName.PRIVACY_SETTINGS_UPDATED:
      return t('auditPrivacySettingsUpdated');
    case ApplicationEventName.AGENT_APPROVAL_DECIDED:
      return t('auditAgentApprovalDecided', {
        approved: String(event.data.approved),
        tool: event.data.approval.tool,
        run: event.data.approval.executionId,
      });
    case ApplicationEventName.CONNECTION_SHARE_UPDATED:
      return t('auditConnectionShareUpdated', {
        connection: event.data.connection.displayName,
        change: event.data.change,
        user: event.data.targetUser?.email ?? '',
        permission: event.data.permission ?? '',
      });
    case ApplicationEventName.MCP_TOOL_TRIED:
      return t('auditMcpToolTried', {
        tool: event.data.toolName,
        server: event.data.server.displayName,
        success: String(event.data.success),
      });
    case ApplicationEventName.CONNECTOR_DEMAND_SUBMITTED:
      return t('auditConnectorDemandSubmitted', {
        app: event.data.demand.appName,
      });
    case ApplicationEventName.MCP_SERVICE_CHANGED:
      return t('auditMcpServiceChanged', {
        service: event.data.service.name,
        change: event.data.change,
        detail: event.data.detail ?? '',
      });
    case ApplicationEventName.PERSONAL_DATA_ERASURE:
      return t('auditPersonalDataErasure', {
        phase: event.data.phase,
        subject: event.data.request.valueHint,
        count: event.data.matchedRuns,
      });
    case ApplicationEventName.USER_SIGNED_IN:
      return t('auditUserSignedIn', { user: event.userEmail });
    case ApplicationEventName.USER_PASSWORD_RESET:
      return t('auditUserPasswordReset', { user: event.userEmail });
    case ApplicationEventName.USER_EMAIL_VERIFIED:
      return t('auditUserEmailVerified', { user: event.userEmail });
    case ApplicationEventName.USER_SIGNED_UP:
      return t('auditUserSignedUp', {
        user: event.userEmail,
        source: event.data.source,
      });
    case ApplicationEventName.CONNECTOR_PUBLISHED:
      return t('auditConnectorPublished', {
        connector: event.data.connector.name,
        version: event.data.connector.version,
      });
    case ApplicationEventName.MEMBER_ADDED:
      return t('auditMemberAdded', {
        user: event.data.member.userId,
        role: event.data.member.role,
      });
    case ApplicationEventName.MEMBER_REMOVED:
      return t('auditMemberRemoved', { user: event.data.member.userId });
    case ApplicationEventName.DATA_STORE_CREATED:
      return t('auditDataStoreCreated', { name: event.data.dataStore.name });
    case ApplicationEventName.DATA_STORE_UPDATED:
      return t('auditDataStoreUpdated', { name: event.data.dataStore.name });
    case ApplicationEventName.DATA_STORE_DELETED:
      return t('auditDataStoreDeleted', { name: event.data.dataStore.name });
    case ApplicationEventName.DATA_STORE_CLEARED:
      return t('auditDataStoreCleared', {
        name: event.data.dataStore.name,
        count: event.data.count ?? 0,
      });
    case ApplicationEventName.DATA_STORE_RECORD_DELETED:
      return t('auditDataStoreRecordDeleted', {
        name: event.data.dataStore.name,
        key: event.data.key ?? '',
      });
    case ApplicationEventName.PERSONAL_ACCESS_TOKEN_CREATED:
      return t('Personal access token "{name}" was created', {
        name: event.data.token.name,
      });
    case ApplicationEventName.PERSONAL_ACCESS_TOKEN_REVOKED:
      return t('Personal access token "{name}" was revoked', {
        name: event.data.token.name,
      });
    case ApplicationEventName.TENANT_USERS_INVITED:
    case ApplicationEventName.TENANT_USER_ACCESS_CHANGED:
    case ApplicationEventName.TENANT_USER_REMOVED:
    case ApplicationEventName.TENANT_USER_PASSWORD_RESET:
    case ApplicationEventName.MODULE_ACCESS_REQUEST_DECIDED:
    case ApplicationEventName.MODULE_ACCESS_SETTINGS_UPDATED:
    case ApplicationEventName.RESOURCES_OWNERSHIP_TRANSFERRED:
    case ApplicationEventName.LOGIN_SETTINGS_UPDATED:
    case ApplicationEventName.WORKER_STATE_CHANGED:
    case ApplicationEventName.AUDIT_LOG_EXPORTED:
    case ApplicationEventName.PROJECT_LIMITS_UPDATED:
      return event.data.detail
        ? `${event.data.target} · ${event.data.detail}`
        : event.data.target;
  }
}

function actionLabel(action: ApplicationEventName): string {
  return ACTION_LABELS[action]();
}

export const auditEventUtils = { summarize, actionLabel, actionsForSources };

const ACTION_LABELS: Record<ApplicationEventName, () => string> = {
  [ApplicationEventName.WORKFLOW_CREATED]: () => t('Workflow created'),
  [ApplicationEventName.WORKFLOW_DELETED]: () => t('Workflow deleted'),
  [ApplicationEventName.WORKFLOW_UPDATED]: () => t('Workflow updated'),
  [ApplicationEventName.WORKFLOW_PUBLISHED]: () => t('Workflow published'),
  [ApplicationEventName.WORKFLOW_ACTIVATED]: () => t('Workflow activated'),
  [ApplicationEventName.WORKFLOW_DEACTIVATED]: () => t('Workflow deactivated'),
  [ApplicationEventName.EXECUTION_RESUMED]: () => t('Run resumed'),
  [ApplicationEventName.EXECUTION_STARTED]: () => t('Run started'),
  [ApplicationEventName.EXECUTION_FINISHED]: () => t('Run finished'),
  [ApplicationEventName.EXECUTION_RETRIED]: () => t('Run retried'),
  [ApplicationEventName.FOLDER_CREATED]: () => t('Folder created'),
  [ApplicationEventName.FOLDER_UPDATED]: () => t('Folder updated'),
  [ApplicationEventName.FOLDER_DELETED]: () => t('Folder deleted'),
  [ApplicationEventName.CONNECTION_UPSERTED]: () => t('Connection updated'),
  [ApplicationEventName.CONNECTION_DELETED]: () => t('Connection deleted'),
  [ApplicationEventName.VARIABLE_UPSERTED]: () => t('Variable updated'),
  [ApplicationEventName.VARIABLE_DELETED]: () => t('Variable deleted'),
  [ApplicationEventName.VARIABLE_VALUE_REVEALED]: () =>
    t('Variable value revealed'),
  [ApplicationEventName.EXECUTION_PAYLOAD_REVEALED]: () =>
    t('Run payload revealed'),
  [ApplicationEventName.ISSUE_REPLAYED]: () => t('Issue runs replayed'),
  [ApplicationEventName.RUNS_RERUN]: () => t('Runs rerun'),
  [ApplicationEventName.PRIVACY_SETTINGS_UPDATED]: () =>
    t('Privacy settings updated'),
  [ApplicationEventName.AGENT_APPROVAL_DECIDED]: () =>
    t('Agent tool call reviewed'),
  [ApplicationEventName.CONNECTION_SHARE_UPDATED]: () =>
    t('Connection sharing changed'),
  [ApplicationEventName.MCP_TOOL_TRIED]: () => t('MCP tool tried'),
  [ApplicationEventName.CONNECTOR_DEMAND_SUBMITTED]: () =>
    t('Connector request submitted'),
  [ApplicationEventName.MCP_SERVICE_CHANGED]: () => t('MCP service changed'),
  [ApplicationEventName.PERSONAL_DATA_ERASURE]: () =>
    t('Personal data erasure'),
  [ApplicationEventName.USER_SIGNED_UP]: () => t('User signed up'),
  [ApplicationEventName.USER_SIGNED_IN]: () => t('User signed in'),
  [ApplicationEventName.USER_PASSWORD_RESET]: () => t('Password reset'),
  [ApplicationEventName.USER_EMAIL_VERIFIED]: () => t('Email verified'),
  [ApplicationEventName.CONNECTOR_PUBLISHED]: () => t('Connector published'),
  [ApplicationEventName.MEMBER_ADDED]: () => t('Member added'),
  [ApplicationEventName.MEMBER_REMOVED]: () => t('Member removed'),
  [ApplicationEventName.DATA_STORE_CREATED]: () => t('Data store created'),
  [ApplicationEventName.DATA_STORE_UPDATED]: () => t('Data store updated'),
  [ApplicationEventName.DATA_STORE_DELETED]: () => t('Data store deleted'),
  [ApplicationEventName.DATA_STORE_CLEARED]: () => t('Data store cleared'),
  [ApplicationEventName.DATA_STORE_RECORD_DELETED]: () =>
    t('Data store key deleted'),
  [ApplicationEventName.PERSONAL_ACCESS_TOKEN_CREATED]: () =>
    t('Access token created'),
  [ApplicationEventName.PERSONAL_ACCESS_TOKEN_REVOKED]: () =>
    t('Access token revoked'),
  [ApplicationEventName.TENANT_USERS_INVITED]: () => t('Users added'),
  [ApplicationEventName.TENANT_USER_ACCESS_CHANGED]: () =>
    t('User permissions changed'),
  [ApplicationEventName.TENANT_USER_REMOVED]: () => t('User removed'),
  [ApplicationEventName.TENANT_USER_PASSWORD_RESET]: () =>
    t('Password reset by admin'),
  [ApplicationEventName.MODULE_ACCESS_REQUEST_DECIDED]: () =>
    t('Permission request reviewed'),
  [ApplicationEventName.MODULE_ACCESS_SETTINGS_UPDATED]: () =>
    t('Permission settings changed'),
  [ApplicationEventName.RESOURCES_OWNERSHIP_TRANSFERRED]: () =>
    t('Resource ownership transferred'),
  [ApplicationEventName.LOGIN_SETTINGS_UPDATED]: () =>
    t('Sign-in settings changed'),
  [ApplicationEventName.WORKER_STATE_CHANGED]: () => t('Worker changed'),
  [ApplicationEventName.AUDIT_LOG_EXPORTED]: () => t('Audit log exported'),
  [ApplicationEventName.PROJECT_LIMITS_UPDATED]: () =>
    t('Project limits updated'),
};

function actionsForSources(sources: string[]): string[] | undefined {
  const selected = sources.filter(
    (source) =>
      source === AUDIT_EVENT_SOURCE.HUMAN ||
      source === AUDIT_EVENT_SOURCE.SYSTEM,
  );
  if (selected.length === 0 || selected.length === 2) {
    return undefined;
  }
  if (selected[0] === AUDIT_EVENT_SOURCE.SYSTEM) {
    return SYSTEM_EVENT_NAMES;
  }
  return Object.values(ApplicationEventName).filter(
    (name) => !SYSTEM_EVENT_NAMES.includes(name),
  );
}

const SYSTEM_EVENT_NAMES: string[] = [
  ApplicationEventName.EXECUTION_STARTED,
  ApplicationEventName.EXECUTION_FINISHED,
  ApplicationEventName.EXECUTION_RESUMED,
  ApplicationEventName.EXECUTION_RETRIED,
];

export const AUDIT_EVENT_SOURCE = {
  HUMAN: 'human',
  SYSTEM: 'system',
} as const;
