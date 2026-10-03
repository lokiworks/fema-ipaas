import { PopulatedWorkflow, WorkflowStatus } from '@fema-ipaas/shared';

function effectiveStatus({
  workflow,
  toggled,
}: {
  workflow: Pick<PopulatedWorkflow, 'id' | 'updated' | 'status'>;
  toggled: ToggledStatus | null;
}): WorkflowStatus {
  if (
    toggled !== null &&
    toggled.workflowId === workflow.id &&
    toggled.basedOnUpdated === workflow.updated
  ) {
    return toggled.status;
  }
  return workflow.status;
}

function fromUpdate({
  workflow,
  updated,
}: {
  workflow: Pick<PopulatedWorkflow, 'id' | 'updated'>;
  updated: Pick<PopulatedWorkflow, 'status'>;
}): ToggledStatus {
  return {
    workflowId: workflow.id,
    basedOnUpdated: workflow.updated,
    status: updated.status,
  };
}

export const toggledStatusUtils = { effectiveStatus, fromUpdate };

export type ToggledStatus = {
  workflowId: string;
  basedOnUpdated: string;
  status: WorkflowStatus;
};
