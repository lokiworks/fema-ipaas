import { WorkflowActionType, WorkflowTriggerType } from '@fema-ipaas/shared';

import { WorkflowStepInputOutput } from '../run-details/workflow-step-input-output';
import { TestStepContainer } from '../test-step';

const StepDataPanelHost = ({
  workflowId,
  workflowVersionId,
  projectId,
  stepType,
  showGenerateSampleData,
  showStepInputOutFromRun,
  saving,
}: StepDataPanelHostProps) => {
  return (
    <div className="group relative flex h-full w-full flex-col overflow-hidden bg-background">
      {showGenerateSampleData && projectId && (
        <TestStepContainer
          type={stepType}
          workflowId={workflowId}
          workflowVersionId={workflowVersionId}
          projectId={projectId}
          isSaving={saving}
        />
      )}
      {showStepInputOutFromRun && <WorkflowStepInputOutput />}
    </div>
  );
};

StepDataPanelHost.displayName = 'StepDataPanelHost';
export { StepDataPanelHost };

export type StepDataPanelHostProps = {
  workflowId: string;
  workflowVersionId: string;
  projectId?: string;
  stepType: WorkflowActionType | WorkflowTriggerType;
  showGenerateSampleData: boolean;
  showStepInputOutFromRun: boolean;
  saving: boolean;
};
