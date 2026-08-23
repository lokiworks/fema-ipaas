import { isNil } from '@fema-ipaas/core-utils';
import { WorkflowVersionState } from '@fema-ipaas/shared';
import React from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import {
  WorkflowStatusToggle,
  WorkflowVersionStateDot,
} from '@/features/workflows';

const BuilderWorkflowStatusSection = React.memo(() => {
  const [workflowVersion, workflow] = useBuilderStateContext((state) => [
    state.workflowVersion,
    state.workflow,
  ]);

  return (
    <div className="flex items-center space-x-2">
      <WorkflowVersionStateDot
        state={workflowVersion.state}
        versionId={workflowVersion.id}
        publishedVersionId={workflow.publishedVersionId}
      ></WorkflowVersionStateDot>
      {(workflow.publishedVersionId === workflowVersion.id ||
        (workflowVersion.state === WorkflowVersionState.DRAFT &&
          !isNil(workflow.publishedVersionId))) && (
        <WorkflowStatusToggle workflow={workflow}></WorkflowStatusToggle>
      )}
    </div>
  );
});

BuilderWorkflowStatusSection.displayName = 'BuilderWorkflowStatusSection';
export { BuilderWorkflowStatusSection };
