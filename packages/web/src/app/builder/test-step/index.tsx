import { WorkflowActionType, WorkflowTriggerType } from '@fema/shared';
import React from 'react';

import { TestActionSection } from './test-action-section';
import { TestTriggerSection } from './test-trigger-section';

type TestStepContainerProps = {
  workflowVersionId: string;
  isSaving: boolean;
  workflowId: string;
  type: WorkflowActionType | WorkflowTriggerType;
  workspaceId: string;
};

const TestStepContainer = React.memo(
  ({
    workflowVersionId,
    isSaving,
    type,
    workflowId,
    workspaceId,
  }: TestStepContainerProps) => {
    return (
      <div className="flex flex-col h-full">
        {type === WorkflowTriggerType.CONNECTOR ? (
          <TestTriggerSection
            workflowId={workflowId}
            isSaving={isSaving}
            workflowVersionId={workflowVersionId}
            workspaceId={workspaceId}
          ></TestTriggerSection>
        ) : (
          <TestActionSection
            workflowVersionId={workflowVersionId}
            isSaving={isSaving}
            workspaceId={workspaceId}
          ></TestActionSection>
        )}
      </div>
    );
  },
);
TestStepContainer.displayName = 'TestStepContainer';

export { TestStepContainer };
