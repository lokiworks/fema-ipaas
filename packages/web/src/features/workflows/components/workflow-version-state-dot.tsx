import { WorkflowVersionState } from '@fema/shared';
import { t } from 'i18next';
import React from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type WorkflowVersionStateProps = {
  state: WorkflowVersionState;
  publishedVersionId: string | undefined | null;
  versionId: string;
};

const findVersionStateName: (
  state: WorkflowVersionStateProps,
) => 'Draft' | 'Published' | 'Locked' = ({
  state,
  publishedVersionId,
  versionId,
}) => {
  if (state === WorkflowVersionState.DRAFT) {
    return 'Draft';
  }
  if (publishedVersionId === versionId) {
    return 'Published';
  }
  return 'Locked';
};
const WorkflowVersionStateDot = React.memo(
  (state: WorkflowVersionStateProps) => {
    const stateName = findVersionStateName(state);
    if (stateName === 'Locked') {
      return null;
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="size-8 flex justify-center items-center">
            {stateName === 'Draft' && (
              <span className="bg-warning size-1.5 rounded-full"></span>
            )}
            {stateName === 'Published' && (
              <span className="bg-success size-1.5 rounded-full"></span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {stateName === 'Draft' && t('Draft')}
          {stateName === 'Published' && t('Published')}
        </TooltipContent>
      </Tooltip>
    );
  },
);

WorkflowVersionStateDot.displayName = 'WorkflowVersionStateDot';
export { WorkflowVersionStateDot };
