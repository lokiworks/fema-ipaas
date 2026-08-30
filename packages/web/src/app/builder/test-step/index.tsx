import { WorkflowActionType, WorkflowTriggerType } from '@fema-ipaas/shared';
import React from 'react';

import { TestActionSection } from './test-action-section';
import { TestTriggerSection } from './test-trigger-section';

type TestStepContainerProps = {
  workflowVersionId: string;
  isSaving: boolean;
  workflowId: string;
  type: WorkflowActionType | WorkflowTriggerType;
  projectId: string;
};

const TestStepContainer = React.memo(
  ({
    workflowVersionId,
    isSaving,
    type,
    workflowId,
    projectId,
  }: TestStepContainerProps) => {
    return (
      <div className="flex flex-col h-full">
        {type === WorkflowTriggerType.CONNECTOR ? (
          <TestTriggerSection
            workflowId={workflowId}
            isSaving={isSaving}
            workflowVersionId={workflowVersionId}
            projectId={projectId}
          ></TestTriggerSection>
        ) : (
          <TestActionSection
            workflowVersionId={workflowVersionId}
            isSaving={isSaving}
            projectId={projectId}
          ></TestActionSection>
        )}
      </div>
    );
  },
);
TestStepContainer.displayName = 'TestStepContainer';

export { TestStepContainer };
