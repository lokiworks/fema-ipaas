import { t } from 'i18next';
import { useMemo } from 'react';

import { StepStatusIcon, executionUtils } from '@/features/executions';

import { useBuilderStateContext } from '../../../builder-hooks';
import { workflowCanvasUtils } from '../../utils/workflow-canvas-utils';

import { StepNodeBadgeContainer } from './step-node-badge-container';

const ApStepNodeStatusInRun = ({ stepName }: { stepName: string }) => {
  const [run, loopIndexes] = useBuilderStateContext((state) => [
    state.run,
    state.loopsIndexes,
  ]);
  const stepStatusInRun = useMemo(() => {
    return workflowCanvasUtils.getStepStatus(stepName, run, loopIndexes);
  }, [stepName, run, loopIndexes]);
  if (!stepStatusInRun) {
    return null;
  }
  const { variant, text } = stepStatusInRun
    ? executionUtils.getStatusIconForStep(stepStatusInRun)
    : ({ variant: 'default', text: t('Testing...') } as const);
  return (
    <StepNodeBadgeContainer>
      <div
        className={executionUtils.getStatusContainerClassName(variant, true)}
      >
        <StepStatusIcon
          status={stepStatusInRun}
          size="3"
          hideTooltip={true}
        ></StepStatusIcon>
        <div>{text}</div>
      </div>
    </StepNodeBadgeContainer>
  );
};
ApStepNodeStatusInRun.displayName = 'ApStepNodeStatus';

export { ApStepNodeStatusInRun };
