import { isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowTriggerType,
  WorkflowVersionState,
  StepOutputStatus,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { TriangleAlert } from 'lucide-react';
import React, { useMemo } from 'react';

import { useBuilderValidation } from '@/app/builder/validation/validation-context';
import { validationMessages } from '@/app/builder/validation/validation-messages';
import {
  ValidationCode,
  ValidationSeverity,
  workflowValidator,
} from '@/app/builder/validation/workflow-validator';
import { InvalidStepIcon } from '@/components/custom/alert-icon';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { connectorSelectorUtils } from '@/features/connectors';
import { StepStatusIcon, executionUtils } from '@/features/executions';

import { useBuilderStateContext } from '../../../builder-hooks';
import { workflowCanvasUtils } from '../../utils/workflow-canvas-utils';

import { StepNodeBadgeContainer } from './step-node-badge-container';
type DraftStepStatus =
  | 'has-error'
  | 'has-warning'
  | 'invalid'
  | 'testing'
  | 'failed'
  | 'needs-test'
  | 'tested'
  | 'untested';

const StepNodeStatusInDraft = ({ stepName }: { stepName: string }) => {
  const [
    run,
    isBeingTested,
    hasError,
    lastTestDate,
    lastUpdatedDate,
    stepType,
    isInDraft,
    isStepValid,
    isManualTrigger,
    isSkipped,
  ] = useBuilderStateContext((state) => {
    const step = workflowStructureUtil.getStep(
      stepName,
      state.workflowVersion.trigger,
    );
    const isManualTrigger =
      step?.type === WorkflowTriggerType.CONNECTOR &&
      connectorSelectorUtils.isManualTrigger({
        connectorName: step?.settings.connectorName,
        triggerName: step?.settings.triggerName ?? '',
      });
    return [
      state.run,
      state.isStepBeingTested(stepName),
      !isNil(state.errorLogs[stepName]),
      step?.settings?.sampleData?.lastTestDate as string | undefined,
      step?.lastUpdatedDate ?? '',
      step?.type,
      state.workflowVersion.state === WorkflowVersionState.DRAFT,
      !!step?.valid,
      isManualTrigger,
      workflowCanvasUtils.isSkipped(stepName, state.workflowVersion.trigger),
    ];
  });

  const validation = useBuilderValidation();
  const stepIssues = workflowValidator.issuesForStep({
    result: validation,
    stepName,
  });
  const firstError = stepIssues.find(
    (issue) => issue.severity === ValidationSeverity.ERROR,
  );
  const firstWarning = stepIssues.find(
    (issue) =>
      issue.severity === ValidationSeverity.WARNING &&
      issue.code !== ValidationCode.WRITE_NOT_TESTED,
  );
  const draftStatusConfig: Record<
    DraftStepStatus,
    {
      variant: 'default' | 'success' | 'error' | 'warning';
      text: string;
      icon: React.ReactNode;
    }
  > = {
    'has-error': {
      variant: 'error',
      text: t('Needs fixing'),
      icon: <InvalidStepIcon className="size-3" />,
    },
    'has-warning': {
      variant: 'warning',
      text: t('Check this'),
      icon: <TriangleAlert className="size-3" />,
    },
    invalid: {
      variant: 'warning',
      text: t('Incomplete'),
      icon: <InvalidStepIcon className="size-3" />,
    },
    testing: {
      variant: 'default',
      text: t('Testing...'),
      icon: (
        <StepStatusIcon
          status={StepOutputStatus.RUNNING}
          size="3"
          hideTooltip={true}
        />
      ),
    },
    failed: {
      variant: 'error',
      text: t('Failed'),
      icon: (
        <StepStatusIcon
          status={StepOutputStatus.FAILED}
          size="3"
          hideTooltip={true}
        />
      ),
    },
    'needs-test': {
      variant: 'default',
      text: t('Test me'),
      icon: <TriangleAlert className="size-3" />,
    },
    untested: {
      variant: 'default',
      text: t('Test me'),
      icon: <TriangleAlert className="size-3" />,
    },
    tested: {
      variant: 'success',
      text: t('Tested'),
      icon: (
        <StepStatusIcon
          status={StepOutputStatus.SUCCEEDED}
          size="3"
          hideTooltip={true}
        />
      ),
    },
  };
  const hasValidationError = !isNil(firstError);
  const hasValidationWarning = !isNil(firstWarning);
  const status: DraftStepStatus = useMemo(() => {
    if (hasValidationError) return 'has-error';
    if (!isStepValid) return 'invalid';
    if (isBeingTested) return 'testing';
    if (hasValidationWarning) return 'has-warning';

    if (isNil(lastTestDate)) {
      return 'untested';
    }
    if (lastUpdatedDate > lastTestDate) {
      return 'needs-test';
    }
    if (hasError) return 'failed';

    return 'tested';
  }, [
    hasValidationError,
    hasValidationWarning,
    isStepValid,
    isBeingTested,
    hasError,
    lastTestDate,
    lastUpdatedDate,
  ]);

  const hasRun = !isNil(run);
  const shouldShowDraftStatusBadge =
    isInDraft &&
    !hasRun &&
    stepType !== WorkflowTriggerType.EMPTY &&
    !isManualTrigger &&
    !isSkipped;

  if (!shouldShowDraftStatusBadge) {
    return null;
  }

  const config = draftStatusConfig[status];
  const badgeClassName = executionUtils.getStatusContainerClassName(
    config.variant,
    true,
  );

  return (
    <StepNodeBadgeContainer>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={badgeClassName}>
            {config.icon}
            <div>{config.text}</div>
          </div>
        </TooltipTrigger>
        {status === 'has-error' && !isNil(firstError) && (
          <TooltipContent>
            {validationMessages.messageOf(firstError)}
          </TooltipContent>
        )}
        {status === 'has-warning' && !isNil(firstWarning) && (
          <TooltipContent>
            {validationMessages.messageOf(firstWarning)}
          </TooltipContent>
        )}
        {status === 'untested' && (
          <TooltipContent>
            {t('This step has not been tested yet')}
          </TooltipContent>
        )}
        {status === 'needs-test' && (
          <TooltipContent>
            {t('This step has been updated since the last test')}
          </TooltipContent>
        )}
      </Tooltip>
    </StepNodeBadgeContainer>
  );
};

StepNodeStatusInDraft.displayName = 'StepNodeStatusInDraft';
export { StepNodeStatusInDraft };
