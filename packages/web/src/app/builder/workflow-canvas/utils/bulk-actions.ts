import {
  WorkflowAction,
  workflowOperations,
  WorkflowOperationType,
  workflowStructureUtil,
  WorkflowVersion,
  StepLocationRelativeToParent,
  PasteLocation,
  workflowReferenceUtil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { toast } from 'sonner';

import { connectionsApi } from '@/features/connections/api/connections';
import { authenticationSession } from '@/lib/authentication-session';

import { BuilderState } from '../../builder-hooks';

import { useDeleteConfirmation } from './delete-confirmation-store';
import { deleteImpactUtils } from './delete-impact';

type CopyActionsRequest = {
  type: 'COPY_ACTIONS';
  actions: WorkflowAction[];
};

export function copySelectedNodes({
  selectedNodes,
  workflowVersion,
}: Pick<BuilderState, 'selectedNodes' | 'workflowVersion'>) {
  const actionsToCopy = workflowOperations.getActionsForCopy(
    selectedNodes,
    workflowVersion,
  );
  const request: CopyActionsRequest = {
    type: 'COPY_ACTIONS',
    actions: actionsToCopy,
  };
  return navigator.clipboard.writeText(JSON.stringify(request));
}

export function deleteSelectedNodes({
  selectedNodes,
  applyOperation,
  selectedStep,
  exitStepSettings,
}: Pick<
  BuilderState,
  'selectedNodes' | 'applyOperation' | 'selectedStep' | 'exitStepSettings'
>) {
  applyOperation({
    type: WorkflowOperationType.DELETE_ACTION,
    request: {
      names: selectedNodes,
    },
  });
  if (selectedStep && selectedNodes.includes(selectedStep)) {
    exitStepSettings();
  }
}

export function requestNodeDeletion({
  workflowVersion,
  ...rest
}: Pick<
  BuilderState,
  | 'selectedNodes'
  | 'applyOperation'
  | 'selectedStep'
  | 'exitStepSettings'
  | 'workflowVersion'
>) {
  const impact = deleteImpactUtils.impactOf({
    trigger: workflowVersion.trigger,
    names: rest.selectedNodes,
  });
  if (deleteImpactUtils.needsConfirmation({ impact })) {
    useDeleteConfirmation.getState().open(impact);
    return;
  }
  deleteSelectedNodes(rest);
}

export async function cutSelectedNodes({
  selectedNodes,
  workflowVersion,
  applyOperation,
  selectedStep,
  exitStepSettings,
}: Pick<
  BuilderState,
  | 'selectedNodes'
  | 'workflowVersion'
  | 'applyOperation'
  | 'selectedStep'
  | 'exitStepSettings'
>) {
  const actions = selectedNodes.filter(
    (node) => node !== workflowVersion.trigger.name,
  );
  if (actions.length === 0) {
    return;
  }
  await copySelectedNodes({ selectedNodes: actions, workflowVersion });
  deleteSelectedNodes({
    selectedNodes: actions,
    applyOperation,
    selectedStep,
    exitStepSettings,
  });
}

export async function getActionsInClipboard(): Promise<WorkflowAction[]> {
  try {
    const clipboardText = await navigator.clipboard.readText();
    const request: CopyActionsRequest = JSON.parse(clipboardText);
    if (request && request.type === 'COPY_ACTIONS') {
      return request.actions;
    }
  } catch (error) {
    console.error('Error getting actions in clipboard', error);
    return [];
  }

  return [];
}

export async function pasteNodes({
  workflowVersion,
  location,
  applyOperations,
}: {
  workflowVersion: WorkflowVersion;
  location: PasteLocation;
  applyOperations: BuilderState['applyOperations'];
}) {
  const clipboardActions = await getActionsInClipboard();
  const { actions, clearedStepNames } = await removeUnavailableConnections(
    clipboardActions,
  );
  const addOperations = workflowOperations.getOperationsForPaste(
    actions,
    workflowVersion,
    location,
  );
  applyOperations(addOperations);
  if (addOperations.length === 0) {
    toast(t('No Steps Pasted'), {
      description: t(
        'Please make sure you have copied a step(s) and allowed permission to your clipboard',
      ),
    });
    return;
  }
  if (clearedStepNames.length > 0) {
    toast(t('Connections cleared'), {
      description: t(
        '{count, plural, =1 {1 pasted step used a connection this project cannot use. Pick a connection for it.} other {# pasted steps used connections this project cannot use. Pick connections for them.}}',
        { count: clearedStepNames.length },
      ),
    });
  }
}

export function getLastLocationAsPasteLocation(
  workflowVersion: WorkflowVersion,
): PasteLocation {
  const firstLevelParents = [
    workflowVersion.trigger,
    ...workflowStructureUtil.getAllNextActionsWithoutChildren(
      workflowVersion.trigger,
    ),
  ];
  const lastAction = firstLevelParents[firstLevelParents.length - 1];
  return {
    parentStepName: lastAction.name,
    stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
  };
}

export function getLastStepName(workflowVersion: WorkflowVersion): string {
  return getLastLocationAsPasteLocation(workflowVersion).parentStepName;
}

export function toggleSkipSelectedNodes({
  selectedNodes,
  workflowVersion,
  applyOperation,
}: Pick<BuilderState, 'selectedNodes' | 'workflowVersion' | 'applyOperation'>) {
  const steps = selectedNodes.flatMap((node) => {
    const step = workflowStructureUtil.getStepOrThrow(
      node,
      workflowVersion.trigger,
    );
    return workflowStructureUtil.isAction(step.type) ? [step.name] : [];
  });
  const areAllStepsSkipped = selectedNodes.every((node) => {
    const step = workflowStructureUtil.getStep(node, workflowVersion.trigger);
    return !!step && 'skip' in step && !!step.skip;
  });
  applyOperation({
    type: WorkflowOperationType.SET_SKIP_ACTION,
    request: {
      names: steps,
      skip: !areAllStepsSkipped,
    },
  });
}

async function removeUnavailableConnections(
  actions: WorkflowAction[],
): Promise<{ actions: WorkflowAction[]; clearedStepNames: string[] }> {
  const referenced = actions.flatMap((action) =>
    workflowStructureUtil
      .getAllSteps(action)
      .flatMap(workflowReferenceUtil.connectionIdsOf),
  );
  const projectId = authenticationSession.getProjectId();
  if (referenced.length === 0 || !projectId) {
    return { actions, clearedStepNames: [] };
  }
  try {
    const page = await connectionsApi.list({ projectId, limit: 1000 });
    const available = new Set(
      page.data.map((connection) => connection.externalId),
    );
    return workflowReferenceUtil.stripUnavailableConnections({
      actions,
      isAvailable: (externalId) => available.has(externalId),
    });
  } catch (error) {
    console.error('Could not check connections for pasted steps', error);
    return { actions, clearedStepNames: [] };
  }
}

export const canvasBulkActions = {
  copySelectedNodes,
  cutSelectedNodes,
  deleteSelectedNodes,
  requestNodeDeletion,
  getActionsInClipboard,
  getLastStepName,
  pasteNodes,
  toggleSkipSelectedNodes,
};
