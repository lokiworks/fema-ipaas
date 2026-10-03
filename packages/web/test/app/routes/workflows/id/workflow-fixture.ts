import {
  BranchExecutionType,
  PopulatedWorkflow,
  RouterExecutionType,
  WorkflowAction,
  WorkflowActionType,
  WorkflowOperationStatus,
  WorkflowStatus,
  WorkflowTriggerType,
  WorkflowVersionState,
} from '@fema-ipaas/shared';

const NOW = '2026-10-03T00:00:00.000Z';

function connectorStep({
  name,
  nextAction,
}: {
  name: string;
  nextAction?: WorkflowAction;
}): WorkflowAction {
  return {
    name,
    type: WorkflowActionType.CONNECTOR,
    valid: true,
    displayName: `Title ${name}`,
    lastUpdatedDate: NOW,
    settings: {
      connectorName: '@fema-ipaas/connector-feishu',
      connectorVersion: '0.3.0',
      actionName: 'send',
      input: {},
      propertySettings: {},
    },
    nextAction,
  };
}

function codeStep({
  name,
  nextAction,
}: {
  name: string;
  nextAction?: WorkflowAction;
}): WorkflowAction {
  return {
    name,
    type: WorkflowActionType.CODE,
    valid: true,
    displayName: `Title ${name}`,
    lastUpdatedDate: NOW,
    settings: {
      sourceCode: { code: '', packageJson: '{}' },
      input: {},
    },
    nextAction,
  };
}

function buildWorkflow({
  state = WorkflowVersionState.DRAFT,
  status = WorkflowStatus.DISABLED,
  publishedVersionId = null,
}: {
  state?: WorkflowVersionState;
  status?: WorkflowStatus;
  publishedVersionId?: string | null;
} = {}): PopulatedWorkflow {
  const router: WorkflowAction = {
    name: 'router',
    type: WorkflowActionType.ROUTER,
    valid: true,
    displayName: 'Title router',
    lastUpdatedDate: NOW,
    settings: {
      executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
      branches: [
        {
          branchType: BranchExecutionType.CONDITION,
          branchName: 'Manager',
          conditions: [],
        },
        { branchType: BranchExecutionType.FALLBACK, branchName: 'Default' },
      ],
    },
    children: [
      connectorStep({
        name: 'notify_hr',
        nextAction: connectorStep({ name: 'log_hr' }),
      }),
      connectorStep({ name: 'notify_team' }),
    ],
    nextAction: codeStep({ name: 'finish' }),
  };
  const loop: WorkflowAction = {
    name: 'loop',
    type: WorkflowActionType.LOOP_ON_ITEMS,
    valid: true,
    displayName: 'Title loop',
    lastUpdatedDate: NOW,
    settings: { items: '' },
    firstLoopAction: codeStep({
      name: 'build_payload',
      nextAction: connectorStep({ name: 'send_message' }),
    }),
    nextAction: router,
  };
  return {
    id: 'wf-1',
    created: NOW,
    updated: NOW,
    projectId: 'project-1',
    externalId: 'wf-1',
    ownerId: null,
    folderId: null,
    status,
    publishedVersionId,
    metadata: null,
    operationStatus: WorkflowOperationStatus.NONE,
    timeSavedPerRun: null,
    templateId: null,
    createdBy: null,
    version: {
      id: 'version-1',
      created: NOW,
      updated: NOW,
      workflowId: 'wf-1',
      displayName: 'Beisen to Feishu',
      updatedBy: null,
      valid: true,
      schemaVersion: null,
      agentIds: [],
      state,
      connectionIds: [],
      backupFiles: null,
      notes: [],
      trigger: {
        name: 'trigger',
        valid: true,
        displayName: 'Title trigger',
        type: WorkflowTriggerType.EMPTY,
        settings: {},
        lastUpdatedDate: NOW,
        nextAction: loop,
      },
    },
  };
}

export const workflowFixture = { buildWorkflow };
