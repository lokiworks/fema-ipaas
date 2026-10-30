import { isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowTriggerType,
  WorkflowVersionState,
  StepOutputStatus,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { CircleDashed, FlaskConical, TriangleAlert } from 'lucide-react';
import React, { useMemo } from 'react';

import { useDraftChanged } from '@/app/builder/builder-header/use-draft-changed';
import { stepTestState } from '@/app/builder/state/step-test-state';
import { connectorSampleData } from '@/app/builder/test-step/utils/connector-sample-data';
import { useBuilderValidation } from '@/app/builder/validation/validation-context';
import { validationMessages } from '@/app/builder/validation/validation-messages';
import { InvalidStepIcon } from '@/components/custom/alert-icon';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { connectorSelectorUtils, connectorsHooks } from '@/features/connectors';
import { StepStatusIcon, executionUtils } from '@/features/executions';
import {
  StepTestStatus,
  ValidationCode,
  ValidationSeverity,
  workflowValidator,
} from '@/features/workflows/utils/workflow-validator';

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
  | 'sample'
  | 'untested';

const StepNodeStatusInDraft = ({ stepName }: { stepName: string }) => {
  const [
    run,
    isBeingTested,
    hasError,
    stepType,
    isInDraft,
    isStepValid,
    isManualTrigger,
    isSkipped,
    debugTested,
    step,
    outputSample,
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
      step?.type,
      state.workflowVersion.state === WorkflowVersionState.DRAFT,
      !!step?.valid,
      isManualTrigger,
      workflowCanvasUtils.isSkipped(stepName, state.workflowVersion.trigger),
      state.debugTestedSteps[stepName],
      step,
      state.outputSampleData[stepName],
    ];
  });
  const triggerConnector =
    step?.type === WorkflowTriggerType.CONNECTOR ? step.settings : null;
  const { connectorModel: triggerConnectorModel } =
    connectorsHooks.useConnector({
      name: triggerConnector?.connectorName ?? '',
      version: triggerConnector?.connectorVersion,
      enabled: !isNil(triggerConnector),
    });
  const usesConnectorSample = connectorSampleData.isConnectorSample({
    sampleData: outputSample,
    connectorSample:
      triggerConnectorModel?.triggers[triggerConnector?.triggerName ?? '']
        ?.sampleData,
  });

  const workflow = useBuilderStateContext((state) => state.workflow);
  const draftChanged = useDraftChanged({
    baselineVersionId: workflow.publishedVersionId,
  });
  const matchesLiveVersion =
    !isNil(workflow.publishedVersionId) && draftChanged === false;

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
      issue.code !== ValidationCode.WRITE_NOT_TESTED &&
      issue.code !== ValidationCode.WRITE_TEST_FAILED,
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
      variant: 'default',
      text: t('To be completed'),
      icon: <CircleDashed className="size-3" />,
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
    sample: {
      variant: 'default',
      text: t('Sample data in use'),
      icon: <FlaskConical className="size-3" />,
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
  const testStatus = useMemo(
    () =>
      isNil(step)
        ? StepTestStatus.UNTESTED
        : stepTestState.statusOf({
            step,
            debugTested,
            failedInSession: hasError,
          }),
    [step, debugTested, hasError],
  );
  const hasValidationError = !isNil(firstError);
  const isOnlyIncomplete =
    hasValidationError &&
    stepIssues
      .filter((issue) => issue.severity === ValidationSeverity.ERROR)
      .every(workflowValidator.isIncompleteIssue);
  const hasValidationWarning = !isNil(firstWarning);
  const status: DraftStepStatus = useMemo(() => {
    if (hasValidationError) return isOnlyIncomplete ? 'invalid' : 'has-error';
    if (!isStepValid) return 'invalid';
    if (isBeingTested) return 'testing';
    if (hasValidationWarning) return 'has-warning';
    switch (testStatus) {
      case StepTestStatus.FAILED:
        return 'failed';
      case StepTestStatus.CHANGED:
        return 'needs-test';
      case StepTestStatus.UNTESTED:
        return 'untested';
      case StepTestStatus.TESTED:
        return usesConnectorSample && isNil(debugTested) ? 'sample' : 'tested';
    }
  }, [
    usesConnectorSample,
    hasValidationError,
    isOnlyIncomplete,
    hasValidationWarning,
    isStepValid,
    isBeingTested,
    testStatus,
    debugTested,
  ]);

  const hasRun = !isNil(run);
  const shouldShowDraftStatusBadge =
    isInDraft &&
    !hasRun &&
    !(matchesLiveVersion && LIVE_HIDDEN_STATUSES.includes(status)) &&
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
        {(status === 'has-error' || status === 'invalid') &&
          !isNil(firstError) && (
            <TooltipContent>
              {validationMessages.messageOf(firstError)}
            </TooltipContent>
          )}
        {status === 'has-warning' && !isNil(firstWarning) && (
          <TooltipContent>
            {validationMessages.messageOf(firstWarning)}
          </TooltipContent>
        )}
        {status === 'sample' && (
          <TooltipContent>
            {t(
              'This step uses the sample data of the connector, not data fetched by a real test. Test it again to use real data.',
            )}
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

const LIVE_HIDDEN_STATUSES: DraftStepStatus[] = [
  'needs-test',
  'untested',
  'tested',
  'sample',
];

StepNodeStatusInDraft.displayName = 'StepNodeStatusInDraft';
export { StepNodeStatusInDraft };
