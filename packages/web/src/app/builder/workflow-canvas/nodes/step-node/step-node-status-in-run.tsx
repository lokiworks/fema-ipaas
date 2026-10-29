import { isNil } from '@fema-ipaas/core-utils';
import { t } from 'i18next';
import { CircleDashed } from 'lucide-react';
import { useMemo } from 'react';

import { StepStatusIcon, executionUtils } from '@/features/executions';

import { useBuilderStateContext } from '../../../builder-hooks';
import { useRunPath } from '../../use-run-path';
import { workflowCanvasUtils } from '../../utils/workflow-canvas-utils';

import { StepNodeBadgeContainer } from './step-node-badge-container';

const StepNodeStatusInRun = ({ stepName }: { stepName: string }) => {
  const [run, loopIndexes, isSkippedByUser] = useBuilderStateContext(
    (state) => [
      state.run,
      state.loopsIndexes,
      workflowCanvasUtils.isSkipped(stepName, state.workflowVersion.trigger),
    ],
  );
  const runPath = useRunPath();
  const stepStatusInRun = useMemo(() => {
    return workflowCanvasUtils.getStepStatus(stepName, run, loopIndexes);
  }, [stepName, run, loopIndexes]);
  if (!stepStatusInRun) {
    if (
      isSkippedByUser ||
      isNil(runPath) ||
      !runPath.notExecuted.has(stepName)
    ) {
      return null;
    }
    return (
      <StepNodeBadgeContainer>
        <div
          className={executionUtils.getStatusContainerClassName(
            'default',
            true,
          )}
        >
          <CircleDashed className="size-3" />
          <div>{t('Not executed')}</div>
        </div>
      </StepNodeBadgeContainer>
    );
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
StepNodeStatusInRun.displayName = 'StepNodeStatus';

export { StepNodeStatusInRun };
