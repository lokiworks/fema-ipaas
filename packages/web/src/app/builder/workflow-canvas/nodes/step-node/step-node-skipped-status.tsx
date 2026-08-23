import { isNil } from '@fema/core-utils';
import {
  WorkflowTriggerType,
  WorkflowVersionState,
  workflowStructureUtil,
} from '@fema/shared';
import { t } from 'i18next';
import { RouteOff } from 'lucide-react';

import { executionUtils } from '@/features/executions';

import { useBuilderStateContext } from '../../../builder-hooks';
import { workflowCanvasUtils } from '../../utils/workflow-canvas-utils';

import { StepNodeBadgeContainer } from './step-node-badge-container';

const ApStepNodeSkippedStatus = ({ stepName }: { stepName: string }) => {
  const [run, stepType, isInDraft, isSkipped] = useBuilderStateContext(
    (state) => [
      state.run,
      workflowStructureUtil.getStep(stepName, state.workflowVersion.trigger)
        ?.type,
      state.workflowVersion.state === WorkflowVersionState.DRAFT,
      workflowCanvasUtils.isSkipped(stepName, state.workflowVersion.trigger),
    ],
  );

  const hasRun = !isNil(run);
  const shouldShowSkippedStatus =
    isSkipped &&
    (isInDraft || hasRun) &&
    stepType !== WorkflowTriggerType.EMPTY;

  if (!shouldShowSkippedStatus) {
    return null;
  }

  return (
    <StepNodeBadgeContainer>
      <div
        className={executionUtils.getStatusContainerClassName('default', true)}
      >
        <RouteOff className="size-3" />
        <div>{t('Skipped')}</div>
      </div>
    </StepNodeBadgeContainer>
  );
};

ApStepNodeSkippedStatus.displayName = 'ApStepNodeSkippedStatus';
export { ApStepNodeSkippedStatus };
