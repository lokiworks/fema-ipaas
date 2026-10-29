import {
  ApplicationEvent,
  ApplicationEventName,
  DefaultProjectRole,
  ExecutionStatus,
  PLATFORM_LEVEL_AUDIT_ACTIONS,
  WorkflowOperationType,
  summarizeApplicationEvent,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import { projectRoleLabels } from '@/features/project-workspace/lib/role-labels';

function summarizeWorkflowUpdate({
  event,
}: {
  event: Extract<
    ApplicationEvent,
    { action: ApplicationEventName.WORKFLOW_UPDATED }
  >;
}): string {
  const workflow = event.data.workflowVersion.displayName;
  const { request } = event.data;
  const version: unknown = event.data.workflowVersion;
  const stepLabel = (name: string) =>
    findStepDisplayName({ node: version, name }) ?? name;
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
        actions: request.request.names.map(stepLabel).join(', '),
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
        action: stepLabel(request.request.name),
        parent: stepLabel(request.request.newParentStep),
      });
    case WorkflowOperationType.LOCK_WORKFLOW:
      return t('auditLockedWorkflow', { workflow });
    case WorkflowOperationType.CHANGE_STATUS:
      return t('auditChangedStatus', {
        workflow,
        status: workflowStatusLabel(request.request.status),
      });
    case WorkflowOperationType.DUPLICATE_ACTION:
      return t('auditDuplicatedAction', {
        action: stepLabel(request.request.stepName),
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
        step: stepLabel(request.request.stepName),
        workflow,
      });
    case WorkflowOperationType.UPDATE_SAMPLE_DATA_INFO:
      return t('auditUpdatedSampleDataInfo', {
        step: stepLabel(request.request.stepName),
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
        actions: request.request.names.map(stepLabel).join(', '),
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

function summarize({
  event,
  workflowNames = {},
  userNames = {},
}: {
  event: ApplicationEvent;
  workflowNames?: Record<string, string>;
  userNames?: Record<string, string>;
}): string {
  switch (event.action) {
    case ApplicationEventName.WORKFLOW_UPDATED:
      return summarizeWorkflowUpdate({ event });
    case ApplicationEventName.EXECUTION_STARTED:
      return summarizeRun({
        execution: event.data.execution,
        workflowNames,
        named: 'auditRunStartedNamed',
        unnamed: 'auditRunStarted',
      });
    case ApplicationEventName.EXECUTION_FINISHED:
      return summarizeRun({
        execution: event.data.execution,
        workflowNames,
        named: 'auditRunFinishedNamed',
        unnamed: 'auditRunFinished',
        outcome: runOutcomeOf(event.data.execution.status),
      });
    case ApplicationEventName.EXECUTION_RESUMED:
      return summarizeRun({
        execution: event.data.execution,
        workflowNames,
        named: 'auditRunResumedNamed',
        unnamed: 'auditRunResumed',
      });
    case ApplicationEventName.EXECUTION_RETRIED:
      return summarizeRun({
        execution: event.data.execution,
        workflowNames,
        named: 'auditRunRetriedNamed',
        unnamed: 'auditRunRetried',
      });
    case ApplicationEventName.WORKFLOW_CREATED: {
      const name =
        event.data.workflow.version?.displayName ??
        workflowNames[event.data.workflow.id];
      return name
        ? t('auditWorkflowCreatedNamed', { name })
        : t('auditWorkflowCreated', {
            workflow: shortId(event.data.workflow.id),
          });
    }
    case ApplicationEventName.WORKFLOW_DELETED: {
      const name = event.data.workflowVersion.displayName;
      return name
        ? t('auditWorkflowDeletedNamed', { name })
        : t('auditWorkflowDeleted', {
            workflow: shortId(event.data.workflow.id),
          });
    }
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
      return isCreation(event.data.connection)
        ? t('auditConnectionCreatedNamed', {
            connection: event.data.connection.displayName,
          })
        : t('auditConnectionUpdatedNamed', {
            connection: event.data.connection.displayName,
          });
    case ApplicationEventName.CONNECTION_DELETED:
      return t('auditConnectionDeletedNamed', {
        connection: event.data.connection.displayName,
      });
    case ApplicationEventName.VARIABLE_UPSERTED:
      return isCreation(event.data.variable)
        ? t('auditVariableCreatedNamed', { variable: event.data.variable.name })
        : t('auditVariableUpdatedNamed', {
            variable: event.data.variable.name,
          });
    case ApplicationEventName.VARIABLE_DELETED:
      return t('auditVariableDeleted', { variable: event.data.variable.name });
    case ApplicationEventName.VARIABLE_VALUE_REVEALED:
      return t('auditVariableRevealed', { variable: event.data.variable.name });
    case ApplicationEventName.EXECUTION_PAYLOAD_REVEALED:
      return withReason({
        text: t('auditRunPayloadRevealed', {
          step: event.data.stepName,
          run: event.data.execution.id,
        }),
        reason: event.data.reason,
      });
    case ApplicationEventName.EXECUTION_PAYLOAD_REVEAL_DENIED:
      return withReason({
        text: t('auditRunPayloadRevealDenied', {
          step: event.data.stepName,
          run: event.data.execution.id,
        }),
        reason: event.data.reason,
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
      return event.data.method === 'sso'
        ? t('auditUserSignedInSso', { user: event.userEmail })
        : t('auditUserSignedIn', { user: event.userEmail });
    case ApplicationEventName.USER_PASSWORD_RESET:
      return t('auditUserPasswordReset', { user: event.userEmail });
    case ApplicationEventName.USER_EMAIL_VERIFIED:
      return t('auditUserEmailVerified', { user: event.userEmail });
    case ApplicationEventName.USER_SIGNED_UP:
      return t('auditUserSignedUp', {
        user: event.userEmail,
        source: event.data.source ?? 'code',
      });
    case ApplicationEventName.CONNECTOR_PUBLISHED:
      return t('auditConnectorPublished', {
        connector: event.data.connector.name,
        version: event.data.connector.version,
      });
    case ApplicationEventName.MEMBER_ADDED:
      return t('auditMemberAdded', {
        user: userLabel({
          id: event.data.member.userId,
          email: event.data.member.email,
          userNames,
        }),
        role: invitationRoleLabel(event.data.member.role),
      });
    case ApplicationEventName.MEMBER_REMOVED:
      return t('auditMemberRemoved', {
        user: userLabel({
          id: event.data.member.userId,
          email: event.data.member.email,
          userNames,
        }),
      });
    case ApplicationEventName.INVITATION_SENT:
      return t('auditInvitationSent', {
        email: event.data.invitation.email,
        role: invitationRoleLabel(event.data.invitation.role),
      });
    case ApplicationEventName.INVITATION_REVOKED:
      return t('auditInvitationRevoked', {
        email: event.data.invitation.email,
      });
    case ApplicationEventName.TENANT_USER_REMOVED:
      return summarizeUserRemoved({
        target: event.data.target,
        detail: event.data.detail,
        userNames,
      });
    case ApplicationEventName.TENANT_USER_PASSWORD_RESET:
      return t('auditUserPasswordResetByAdmin', {
        user: userLabel({ id: event.data.target, userNames }),
      });
    case ApplicationEventName.TENANT_USER_ACCESS_CHANGED:
      return summarizeAccessChanged({
        target: event.data.target,
        detail: event.data.detail,
        userNames,
      });
    case ApplicationEventName.RESOURCES_OWNERSHIP_TRANSFERRED:
      return summarizeOwnershipTransferred({
        target: event.data.target,
        detail: event.data.detail,
        userNames,
      });
    case ApplicationEventName.MODULE_ACCESS_REQUEST_DECIDED:
      return summarizeRequestDecided({
        target: event.data.target,
        detail: event.data.detail,
        userNames,
      });
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
    case ApplicationEventName.RELEASE_DEPLOYED_TO_TEST:
      return t('auditReleaseDeployedToTest', {
        workflow: event.data.workflow?.displayName ?? '',
      });
    case ApplicationEventName.RELEASE_REQUESTED:
      return t('auditReleaseRequested', {
        workflow: event.data.workflow?.displayName ?? '',
      });
    case ApplicationEventName.RELEASE_APPROVED:
      return t('auditReleaseApproved', {
        workflow: event.data.workflow?.displayName ?? '',
      });
    case ApplicationEventName.RELEASE_REJECTED:
      return t('auditReleaseRejected', {
        workflow: event.data.workflow?.displayName ?? '',
      });
    case ApplicationEventName.RELEASE_WITHDRAWN:
      return t('auditReleaseWithdrawn', {
        workflow: event.data.workflow?.displayName ?? '',
      });
    case ApplicationEventName.RELEASE_ROLLED_BACK:
      return t('auditReleaseRolledBack', {
        workflow: event.data.workflow?.displayName ?? '',
      });
    case ApplicationEventName.ENVIRONMENTS_UPDATED:
      return event.data.environmentsEnabled === true
        ? t('auditEnvironmentsOn')
        : t('auditEnvironmentsOff');
    case ApplicationEventName.PROJECT_CREATED:
      return t('auditProjectCreated', {
        name: event.data.createdProject.displayName,
      });
    case ApplicationEventName.MAPPING_TABLE_CREATED:
      return t('auditMappingTableCreated', {
        name: event.data.mappingTable.name,
      });
    case ApplicationEventName.MAPPING_TABLE_UPDATED:
      return event.data.addedRows === undefined
        ? t('auditMappingTableUpdated', { name: event.data.mappingTable.name })
        : t('auditMappingTableRowsAdded', {
            name: event.data.mappingTable.name,
            count: event.data.addedRows,
          });
    case ApplicationEventName.MAPPING_TABLE_DELETED:
      return t('auditMappingTableDeleted', {
        name: event.data.mappingTable.name,
      });
    case ApplicationEventName.USER_SIGN_IN_FAILED:
      return summarizeSignInFailed({
        target: event.data.target,
        detail: event.data.detail,
      });
    case ApplicationEventName.TENANT_USERS_INVITED:
    case ApplicationEventName.MODULE_ACCESS_SETTINGS_UPDATED:
    case ApplicationEventName.LOGIN_SETTINGS_UPDATED:
    case ApplicationEventName.SSO_SETTINGS_UPDATED:
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

function eventActionLabel(event: ApplicationEvent): string {
  switch (event.action) {
    case ApplicationEventName.CONNECTION_UPSERTED:
      return isCreation(event.data.connection)
        ? t('auditActionConnectionCreated')
        : t('auditActionConnectionUpdated');
    case ApplicationEventName.VARIABLE_UPSERTED:
      return isCreation(event.data.variable)
        ? t('auditActionVariableCreated')
        : t('auditActionVariableUpdated');
    default:
      return actionLabel(event.action);
  }
}

function isCreation({
  created,
  updated,
}: {
  created: string | Date;
  updated: string | Date;
}): boolean {
  return (
    Math.abs(new Date(updated).getTime() - new Date(created).getTime()) <
    CREATION_WINDOW_MS
  );
}

export const auditEventUtils = {
  summarize,
  actionLabel,
  eventActionLabel,
  actionsForSources,
  needsWorkflowName,
  runIdOf,
  isPlatformLevel,
  learnWorkflowNames,
};

function summarizeRun({
  execution,
  workflowNames,
  named,
  unnamed,
  outcome = 'finished',
}: {
  execution: { id: string; workflowId: string; workflowDisplayName?: string };
  workflowNames: Record<string, string>;
  named: string;
  unnamed: string;
  outcome?: RunOutcome;
}): string {
  const workflow =
    execution.workflowDisplayName ?? workflowNames[execution.workflowId];
  return workflow
    ? t(named, { workflow, run: shortId(execution.id), outcome })
    : t(unnamed, { run: shortId(execution.id), outcome });
}

function runOutcomeOf(status: string): RunOutcome {
  switch (status) {
    case ExecutionStatus.SUCCEEDED:
      return 'succeeded';
    case ExecutionStatus.FAILED:
    case ExecutionStatus.INTERNAL_ERROR:
    case ExecutionStatus.TIMEOUT:
    case ExecutionStatus.MEMORY_LIMIT_EXCEEDED:
    case ExecutionStatus.LOG_SIZE_EXCEEDED:
      return 'failed';
    case ExecutionStatus.CANCELED:
      return 'canceled';
    default:
      return 'finished';
  }
}

function userLabel({
  id,
  email,
  userNames,
}: {
  id: string;
  email?: string;
  userNames: Record<string, string>;
}): string {
  const known = userNames[id];
  if (known) {
    return known;
  }
  if (email) {
    return email;
  }
  return id.includes('@') ? id : t('deletedUserWithId', { id: shortId(id) });
}

function invitationRoleLabel(role: string | undefined): string {
  return projectRoleLabels.label(
    Object.values(DefaultProjectRole).find((candidate) => candidate === role),
  );
}

function summarizeUserRemoved({
  target,
  detail,
  userNames,
}: {
  target: string;
  detail: string | undefined;
  userNames: Record<string, string>;
}): string {
  const user = userLabel({ id: target, userNames });
  const transfer = detail ? TRANSFER_DETAIL_PATTERN.exec(detail) : null;
  if (!transfer) {
    return t('auditUserRemoved', { user });
  }
  const [, count, receiver] = transfer;
  return t('auditUserRemovedWithTransfer', {
    user,
    count: Number(count),
    receiver: userLabel({ id: receiver, userNames }),
  });
}

function summarizeAccessChanged({
  target,
  detail,
  userNames,
}: {
  target: string;
  detail: string | undefined;
  userNames: Record<string, string>;
}): string {
  const user = userLabel({ id: target, userNames });
  switch (detail) {
    case 'disabled':
      return t('auditUserDisabled', { user });
    case 'enabled':
      return t('auditUserEnabled', { user });
    default:
      return t('auditUserAccessChanged', { user });
  }
}

function summarizeOwnershipTransferred({
  target,
  detail,
  userNames,
}: {
  target: string;
  detail: string | undefined;
  userNames: Record<string, string>;
}): string {
  const matched = detail ? RESOURCE_COUNT_PATTERN.exec(detail) : null;
  return t('auditOwnershipTransferred', {
    user: userLabel({ id: target, userNames }),
    count: matched ? Number(matched[1]) : 0,
  });
}

function summarizeRequestDecided({
  target,
  detail,
  userNames,
}: {
  target: string;
  detail: string | undefined;
  userNames: Record<string, string>;
}): string {
  const [userId = '', module = ''] = target.split(' ');
  return t('auditAccessRequestDecided', {
    user: userLabel({ id: userId, userNames }),
    module,
    approved: String(detail === 'approved'),
  });
}

function isPlatformLevel(action: ApplicationEventName): boolean {
  return PLATFORM_LEVEL_AUDIT_ACTIONS.includes(action);
}

function learnWorkflowNames({
  events,
}: {
  events: ApplicationEvent[];
}): Record<string, string> {
  return Object.fromEntries(
    [...events].reverse().flatMap((event) => {
      switch (event.action) {
        case ApplicationEventName.WORKFLOW_UPDATED:
        case ApplicationEventName.WORKFLOW_DELETED:
        case ApplicationEventName.WORKFLOW_PUBLISHED:
        case ApplicationEventName.WORKFLOW_ACTIVATED:
        case ApplicationEventName.WORKFLOW_DEACTIVATED:
          return event.data.workflowVersion.displayName
            ? [[event.data.workflow.id, event.data.workflowVersion.displayName]]
            : [];
        default:
          return [];
      }
    }),
  );
}

function needsWorkflowName(event: ApplicationEvent): boolean {
  switch (event.action) {
    case ApplicationEventName.EXECUTION_STARTED:
    case ApplicationEventName.EXECUTION_FINISHED:
    case ApplicationEventName.EXECUTION_RESUMED:
    case ApplicationEventName.EXECUTION_RETRIED:
      return !event.data.execution.workflowDisplayName;
    case ApplicationEventName.WORKFLOW_CREATED:
      return true;
    default:
      return false;
  }
}

function runIdOf(event: ApplicationEvent): string | null {
  switch (event.action) {
    case ApplicationEventName.EXECUTION_STARTED:
    case ApplicationEventName.EXECUTION_FINISHED:
    case ApplicationEventName.EXECUTION_RESUMED:
    case ApplicationEventName.EXECUTION_RETRIED:
      return event.data.execution.id;
    default:
      return null;
  }
}

function workflowStatusLabel(status: string): string {
  switch (status) {
    case 'ENABLED':
      return t('Enabled');
    case 'DISABLED':
      return t('Stopped');
    default:
      return status;
  }
}

function summarizeSignInFailed({
  target,
  detail,
}: {
  target: string;
  detail: string | undefined;
}): string {
  const matched = detail ? SIGN_IN_DETAIL_PATTERN.exec(detail) : null;
  if (!matched) {
    return detail ? `${target} · ${detail}` : target;
  }
  const [, method, code] = matched;
  return t('auditSignInFailed', {
    email: target || t('Unknown'),
    method:
      method === 'password' ? t('password') : t('email verification code'),
    reason: signInFailureReason(code),
  });
}

function signInFailureReason(code: string): string {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return t('wrong email or password');
    case 'INVALID_OTP':
      return t('wrong or expired verification code');
    case 'USER_IS_INACTIVE':
      return t('the account is disabled');
    case 'EMAIL_IS_NOT_VERIFIED':
      return t('the email is not verified');
    case 'EMAIL_AUTH_DISABLED':
      return t('email sign-in is turned off');
    case 'DOMAIN_NOT_ALLOWED':
      return t('the email domain is not allowed');
    case 'INVITATION_ONLY_SIGN_UP':
      return t('this account is not invited yet');
    case 'AUTHORIZATION':
      return t('not authorized');
    default:
      return t('the sign-in was refused');
  }
}

function shortId(id: string): string {
  return id.slice(0, 6);
}

function findStepDisplayName({
  node,
  name,
}: {
  node: unknown;
  name: string;
}): string | undefined {
  if (Array.isArray(node)) {
    return node
      .map((child) => findStepDisplayName({ node: child, name }))
      .find((found) => found !== undefined);
  }
  if (typeof node !== 'object' || node === null) {
    return undefined;
  }
  const record = new Map(Object.entries(node));
  const displayName = record.get('displayName');
  if (record.get('name') === name && typeof displayName === 'string') {
    return displayName;
  }
  return [...record.values()]
    .map((child) => findStepDisplayName({ node: child, name }))
    .find((found) => found !== undefined);
}

function withReason({
  text,
  reason,
}: {
  text: string;
  reason: string | undefined;
}): string {
  return reason ? `${text}（${t('Stated reason')}：${reason}）` : text;
}

const ACTION_LABELS: Record<ApplicationEventName, () => string> = {
  [ApplicationEventName.WORKFLOW_CREATED]: () =>
    t('auditActionWorkflowCreated'),
  [ApplicationEventName.WORKFLOW_DELETED]: () =>
    t('auditActionWorkflowDeleted'),
  [ApplicationEventName.WORKFLOW_UPDATED]: () =>
    t('auditActionWorkflowUpdated'),
  [ApplicationEventName.WORKFLOW_PUBLISHED]: () =>
    t('auditActionWorkflowPublished'),
  [ApplicationEventName.WORKFLOW_ACTIVATED]: () =>
    t('auditActionWorkflowActivated'),
  [ApplicationEventName.WORKFLOW_DEACTIVATED]: () =>
    t('auditActionWorkflowDeactivated'),
  [ApplicationEventName.EXECUTION_RESUMED]: () => t('auditActionRunResumed'),
  [ApplicationEventName.EXECUTION_STARTED]: () => t('auditActionRunStarted'),
  [ApplicationEventName.EXECUTION_FINISHED]: () => t('auditActionRunFinished'),
  [ApplicationEventName.EXECUTION_RETRIED]: () => t('auditActionRunRetried'),
  [ApplicationEventName.FOLDER_CREATED]: () => t('auditActionFolderCreated'),
  [ApplicationEventName.FOLDER_UPDATED]: () => t('auditActionFolderUpdated'),
  [ApplicationEventName.FOLDER_DELETED]: () => t('auditActionFolderDeleted'),
  [ApplicationEventName.CONNECTION_UPSERTED]: () =>
    t('auditActionConnectionUpserted'),
  [ApplicationEventName.CONNECTION_DELETED]: () =>
    t('auditActionConnectionDeleted'),
  [ApplicationEventName.VARIABLE_UPSERTED]: () =>
    t('auditActionVariableUpserted'),
  [ApplicationEventName.VARIABLE_DELETED]: () =>
    t('auditActionVariableDeleted'),
  [ApplicationEventName.VARIABLE_VALUE_REVEALED]: () =>
    t('auditActionVariableRevealed'),
  [ApplicationEventName.EXECUTION_PAYLOAD_REVEALED]: () =>
    t('auditActionPayloadRevealed'),
  [ApplicationEventName.EXECUTION_PAYLOAD_REVEAL_DENIED]: () =>
    t('auditActionPayloadRevealDenied'),
  [ApplicationEventName.ISSUE_REPLAYED]: () => t('auditActionIssueReplayed'),
  [ApplicationEventName.RUNS_RERUN]: () => t('auditActionRunsRerun'),
  [ApplicationEventName.PRIVACY_SETTINGS_UPDATED]: () =>
    t('auditActionPrivacyUpdated'),
  [ApplicationEventName.AGENT_APPROVAL_DECIDED]: () =>
    t('auditActionAgentApproval'),
  [ApplicationEventName.CONNECTION_SHARE_UPDATED]: () =>
    t('auditActionConnectionShare'),
  [ApplicationEventName.MCP_TOOL_TRIED]: () => t('auditActionMcpToolTried'),
  [ApplicationEventName.CONNECTOR_DEMAND_SUBMITTED]: () =>
    t('auditActionConnectorDemand'),
  [ApplicationEventName.MCP_SERVICE_CHANGED]: () =>
    t('auditActionMcpServiceChanged'),
  [ApplicationEventName.PERSONAL_DATA_ERASURE]: () =>
    t('auditActionPersonalDataErasure'),
  [ApplicationEventName.USER_SIGNED_UP]: () => t('auditActionSignedUp'),
  [ApplicationEventName.USER_SIGNED_IN]: () => t('auditActionSignedIn'),
  [ApplicationEventName.USER_SIGN_IN_FAILED]: () =>
    t('auditActionSignInFailed'),
  [ApplicationEventName.USER_PASSWORD_RESET]: () =>
    t('auditActionPasswordReset'),
  [ApplicationEventName.USER_EMAIL_VERIFIED]: () =>
    t('auditActionEmailVerified'),
  [ApplicationEventName.CONNECTOR_PUBLISHED]: () =>
    t('auditActionConnectorPublished'),
  [ApplicationEventName.MEMBER_ADDED]: () => t('auditActionMemberAdded'),
  [ApplicationEventName.MEMBER_REMOVED]: () => t('auditActionMemberRemoved'),
  [ApplicationEventName.INVITATION_SENT]: () => t('auditActionInvitationSent'),
  [ApplicationEventName.INVITATION_REVOKED]: () =>
    t('auditActionInvitationRevoked'),
  [ApplicationEventName.DATA_STORE_CREATED]: () =>
    t('auditActionDataStoreCreated'),
  [ApplicationEventName.DATA_STORE_UPDATED]: () =>
    t('auditActionDataStoreUpdated'),
  [ApplicationEventName.DATA_STORE_DELETED]: () =>
    t('auditActionDataStoreDeleted'),
  [ApplicationEventName.DATA_STORE_CLEARED]: () =>
    t('auditActionDataStoreCleared'),
  [ApplicationEventName.DATA_STORE_RECORD_DELETED]: () =>
    t('auditActionDataStoreKeyDeleted'),
  [ApplicationEventName.PERSONAL_ACCESS_TOKEN_CREATED]: () =>
    t('auditActionTokenCreated'),
  [ApplicationEventName.PERSONAL_ACCESS_TOKEN_REVOKED]: () =>
    t('auditActionTokenRevoked'),
  [ApplicationEventName.RELEASE_DEPLOYED_TO_TEST]: () =>
    t('auditActionDeployedToTest'),
  [ApplicationEventName.RELEASE_REQUESTED]: () =>
    t('auditActionPromotionRequested'),
  [ApplicationEventName.RELEASE_APPROVED]: () =>
    t('auditActionPromotionApproved'),
  [ApplicationEventName.RELEASE_REJECTED]: () =>
    t('auditActionPromotionRejected'),
  [ApplicationEventName.RELEASE_WITHDRAWN]: () =>
    t('auditActionPromotionWithdrawn'),
  [ApplicationEventName.RELEASE_ROLLED_BACK]: () => t('auditActionRolledBack'),
  [ApplicationEventName.ENVIRONMENTS_UPDATED]: () =>
    t('auditActionEnvironmentsUpdated'),
  [ApplicationEventName.TENANT_USERS_INVITED]: () => t('auditActionUsersAdded'),
  [ApplicationEventName.TENANT_USER_ACCESS_CHANGED]: () =>
    t('auditActionUserAccessChanged'),
  [ApplicationEventName.TENANT_USER_REMOVED]: () => t('auditActionUserRemoved'),
  [ApplicationEventName.TENANT_USER_PASSWORD_RESET]: () =>
    t('auditActionUserPasswordReset'),
  [ApplicationEventName.MODULE_ACCESS_REQUEST_DECIDED]: () =>
    t('auditActionAccessRequestDecided'),
  [ApplicationEventName.MODULE_ACCESS_SETTINGS_UPDATED]: () =>
    t('auditActionAccessSettings'),
  [ApplicationEventName.RESOURCES_OWNERSHIP_TRANSFERRED]: () =>
    t('auditActionOwnershipTransferred'),
  [ApplicationEventName.LOGIN_SETTINGS_UPDATED]: () =>
    t('auditActionLoginSettings'),
  [ApplicationEventName.SSO_SETTINGS_UPDATED]: () =>
    t('auditActionSsoSettings'),
  [ApplicationEventName.WORKER_STATE_CHANGED]: () =>
    t('auditActionWorkerChanged'),
  [ApplicationEventName.AUDIT_LOG_EXPORTED]: () => t('auditActionLogExported'),
  [ApplicationEventName.PROJECT_LIMITS_UPDATED]: () =>
    t('auditActionProjectLimits'),
  [ApplicationEventName.PROJECT_CREATED]: () => t('auditActionProjectCreated'),
  [ApplicationEventName.MAPPING_TABLE_CREATED]: () =>
    t('auditActionMappingTableCreated'),
  [ApplicationEventName.MAPPING_TABLE_UPDATED]: () =>
    t('auditActionMappingTableUpdated'),
  [ApplicationEventName.MAPPING_TABLE_DELETED]: () =>
    t('auditActionMappingTableDeleted'),
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

const CREATION_WINDOW_MS = 1000;

const SIGN_IN_DETAIL_PATTERN = /^(password|email code): ([A-Z_]+)$/;

const TRANSFER_DETAIL_PATTERN = /^(\d+) resources to (.+)$/;

const RESOURCE_COUNT_PATTERN = /^(\d+) resources$/;

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

type RunOutcome = 'succeeded' | 'failed' | 'canceled' | 'finished';
