import { FlowActionType, FlowTriggerType } from '@fema/shared';
import React from 'react';

import { TestActionSection } from './test-action-section';
import { TestTriggerSection } from './test-trigger-section';

type TestStepContainerProps = {
  flowVersionId: string;
  isSaving: boolean;
  flowId: string;
  type: FlowActionType | FlowTriggerType;
  workspaceId: string;
};

const TestStepContainer = React.memo(
  ({
    flowVersionId,
    isSaving,
    type,
    flowId,
    workspaceId,
  }: TestStepContainerProps) => {
    return (
      <div className="flex flex-col h-full">
        {type === FlowTriggerType.CONNECTOR ? (
          <TestTriggerSection
            flowId={flowId}
            isSaving={isSaving}
            flowVersionId={flowVersionId}
            workspaceId={workspaceId}
          ></TestTriggerSection>
        ) : (
          <TestActionSection
            flowVersionId={flowVersionId}
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
