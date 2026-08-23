import {
  WorkflowAction,
  workflowOperations,
  WorkflowOperationType,
  workflowStructureUtil,
  WorkflowVersion,
  StepLocationRelativeToParent,
  PasteLocation,
} from '@fema/shared';
import { t } from 'i18next';
import { toast } from 'sonner';

import { BuilderState } from '../../builder-hooks';

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
  navigator.clipboard.writeText(JSON.stringify(request));
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

export async function pasteNodes(
  workflowVersion: BuilderState['workflowVersion'],
  pastingDetails: PasteLocation,
  applyOperation: BuilderState['applyOperation'],
) {
  const actions = await getActionsInClipboard();
  const addOperations = workflowOperations.getOperationsForPaste(
    actions,
    workflowVersion,
    pastingDetails,
  );
  addOperations.forEach((request) => {
    applyOperation(request);
  });
  if (addOperations.length === 0) {
    toast(t('No Steps Pasted'), {
      description: t(
        'Please make sure you have copied a step(s) and allowed permission to your clipboard',
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

export function toggleSkipSelectedNodes({
  selectedNodes,
  workflowVersion,
  applyOperation,
}: Pick<BuilderState, 'selectedNodes' | 'workflowVersion' | 'applyOperation'>) {
  const steps = selectedNodes.map((node) =>
    workflowStructureUtil.getStepOrThrow(node, workflowVersion.trigger),
  ) as WorkflowAction[];
  const areAllStepsSkipped = steps.every((step) => !!step.skip);
  applyOperation({
    type: WorkflowOperationType.SET_SKIP_ACTION,
    request: {
      names: steps.map((step) => step.name),
      skip: !areAllStepsSkipped,
    },
  });
}

export const canvasBulkActions = {
  copySelectedNodes,
  deleteSelectedNodes,
  getActionsInClipboard,
  pasteNodes,
  toggleSkipSelectedNodes,
};
