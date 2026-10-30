import { isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowTriggerType,
  WorkflowVersionState,
  StepOutputStatus,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { FlaskConical, TriangleAlert } from 'lucide-react';
import React, { useMemo } from 'react';

import { useDraftChanged } from '@/app/builder/builder-header/use-draft-changed';
import { stepTestRelevance } from '@/app/builder/state/step-test-relevance';
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
    lastTestDate,
    lastUpdatedDate,
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
      step?.settings?.sampleData?.lastTestDate as string | undefined,
      step?.lastUpdatedDate ?? '',
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
      issue.code !== ValidationCode.WRITE_NOT_REACHED,
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
  const currentSignature = useMemo(
    () => (isNil(step) ? null : stepTestRelevance.signatureOf(step)),
    [step],
  );
  const isTestedByDebug =
    !isNil(debugTested) &&
    debugTested.signature === currentSignature &&
    (isNil(lastTestDate) || lastTestDate <= debugTested.testedAt);
  const hasValidationError = !isNil(firstError);
  const hasValidationWarning = !isNil(firstWarning);
  const status: DraftStepStatus = useMemo(() => {
    if (hasValidationError) return 'has-error';
    if (!isStepValid) return 'invalid';
    if (isBeingTested) return 'testing';
    if (hasValidationWarning) return 'has-warning';

    if (isTestedByDebug) {
      return hasError || debugTested?.failed ? 'failed' : 'tested';
    }
    if (isNil(lastTestDate)) {
      return isNil(debugTested) ? 'untested' : 'needs-test';
    }
    if (lastUpdatedDate > lastTestDate) {
      return 'needs-test';
    }
    if (hasError) return 'failed';
    if (usesConnectorSample) return 'sample';

    return 'tested';
  }, [
    usesConnectorSample,
    hasValidationError,
    hasValidationWarning,
    isStepValid,
    isBeingTested,
    hasError,
    lastTestDate,
    isTestedByDebug,
    debugTested,
    lastUpdatedDate,
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
