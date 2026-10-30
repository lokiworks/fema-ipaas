import { isNil } from '@fema-ipaas/core-utils';
import {
  AI_CONNECTOR_NAME,
  StepOutputStatus,
  workflowStructureUtil,
  WorkflowActionType,
  WorkflowTriggerType,
  isExecutionStateTerminal,
  Execution,
  ExecutionStatus,
  LogSliceRef,
  StepOutputType,
  RunInternalError,
  WorkflowAction,
  WorkflowTrigger,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Download, Info, ShieldAlert } from 'lucide-react';
import { useMemo } from 'react';

import { StepOutputSkeleton } from '@/app/components/step-output-skeleton';
import { SmartOutputViewer } from '@/components/custom/smart-output-viewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RunApprovalsNotice } from '@/features/agent-approvals';
import { connectorsHooks } from '@/features/connectors';
import { executionUtils } from '@/features/executions';
import { MaskedPayloadNotice } from '@/features/privacy';
import { runLogsHooks } from '@/features/run-logs/hooks/run-logs-hooks';
import {
  runLogUiUtils,
  RunRetention,
} from '@/features/run-logs/utils/run-log-ui-utils';
import { formatUtils } from '@/lib/format-utils';

import { useBuilderStateContext } from '../builder-hooks';
import { DataDisplayTabs } from '../data-display/data-display-tabs';
import { StepErrorDetails } from '../data-display/step-error-details';
import { StepDataPanelHeader } from '../step-data/step-data-panel-header';

import { builtinOutputSchemas } from './builtin-output-schemas';
import { RouterHitSummary } from './router-hit-summary';
import { truncatedInputUtils } from './truncated-input-utils';

export const WorkflowStepInputOutput = () => {
  const [run, loopsIndexes, workflowVersion, selectedStep] =
    useBuilderStateContext((state) => [
      state.run,
      state.loopsIndexes,
      state.workflowVersion,
      state.selectedStep
        ? workflowStructureUtil.getStepOrThrow(
            state.selectedStep,
            state.workflowVersion.trigger,
          )
        : null,
    ]);
  const selectedStepOutput = useMemo(() => {
    return run && selectedStep && run.steps
      ? executionUtils.extractStepOutput(
          selectedStep.name,
          loopsIndexes,
          run.steps,
        )
      : null;
  }, [run, selectedStep?.name, loopsIndexes, workflowVersion.trigger]);
  const isStepRunning = selectedStepOutput?.status === StepOutputStatus.RUNNING;
  const isSlicedOutput =
    selectedStepOutput?.outputType === StepOutputType.SLICE;
  const slicedOutputRef = isSlicedOutput
    ? (selectedStepOutput?.output as LogSliceRef | undefined)
    : undefined;
  const stepConnectorName =
    selectedStep?.type === WorkflowActionType.CONNECTOR ||
    selectedStep?.type === WorkflowTriggerType.CONNECTOR
      ? selectedStep.settings.connectorName
      : undefined;
  const stepConnectorVersion =
    selectedStep?.type === WorkflowActionType.CONNECTOR ||
    selectedStep?.type === WorkflowTriggerType.CONNECTOR
      ? selectedStep.settings.connectorVersion
      : undefined;
  const { connectorModel } = connectorsHooks.useConnector({
    name: stepConnectorName ?? '',
    version: stepConnectorVersion,
    enabled: !isNil(stepConnectorName),
  });
  const parsedOutput = isSlicedOutput
    ? undefined
    : selectedStepOutput?.errorMessage ??
      selectedStepOutput?.output ??
      'No output';

  if (!run) {
    return <></>;
  }
  const isRunDone = isExecutionStateTerminal({
    status: run.status,
    ignoreInternalError: true,
  });
  const { data: runLogScope } = runLogsHooks.useScope();
  const retention = runLogUiUtils.projectRetention({
    scope: runLogScope,
    projectId: run.projectId,
  });

  if (
    run.status === ExecutionStatus.INTERNAL_ERROR &&
    !isNil(run.internalError) &&
    isNil(selectedStepOutput)
  ) {
    return <InternalErrorPanel internalError={run.internalError} />;
  }

  if (
    !isRunDone &&
    run.status !== ExecutionStatus.PAUSED &&
    run.status !== ExecutionStatus.INTERNAL_ERROR &&
    isNil(selectedStepOutput)
  ) {
    return <StepOutputSkeleton className="p-4" />;
  }

  const message =
    run.status === ExecutionStatus.INTERNAL_ERROR && isNil(selectedStepOutput)
      ? t(
          'There are no logs captured for this run because of an internal error, please contact your platform administrator.',
        )
      : handleRunFailureOrEmptyLog(run, retention);
  if (message) {
    return (
      <div className="flex flex-col justify-center items-center gap-4 w-full pt-8 px-5">
        <Info size={36} className="text-muted-foreground" />
        <h4 className="px-6 text-sm text-center text-muted-foreground">
          {message}
        </h4>
      </div>
    );
  }

  if (!selectedStepOutput || !selectedStep) {
    return (
      <div className="flex flex-col h-full w-full">
        <div className="flex items-center justify-end gap-1 px-3 py-2 shrink-0"></div>
        <div className="grow flex flex-col items-center justify-center w-full px-6 py-10 gap-4 text-center">
          <div className="flex items-center justify-center size-12 rounded-full bg-muted text-muted-foreground">
            <Info className="size-6" />
          </div>
          <div className="flex flex-col gap-1.5 max-w-[280px]">
            <span className="text-sm font-medium text-foreground">
              {t("This step didn't run")}
            </span>
            <span className="text-xs text-muted-foreground leading-relaxed">
              {t(
                'This step was skipped during this run, no input or output was captured.',
              )}
            </span>
          </div>
        </div>
      </div>
    );
  }
  const failureOutputSchema =
    selectedStepOutput.status === StepOutputStatus.FAILED
      ? builtinOutputSchemas.failureOutput(selectedStepOutput.output)
      : null;
  const stepMaskedFields =
    builtinOutputSchemas.maskedValueCount(selectedStepOutput.input) +
    builtinOutputSchemas.maskedValueCount(selectedStepOutput.output);
  const status: 'success' | 'failed' | 'testing' | 'idle' =
    selectedStepOutput.status === StepOutputStatus.FAILED
      ? 'failed'
      : selectedStepOutput.status === StepOutputStatus.RUNNING
      ? 'testing'
      : 'success';

  const stepName =
    selectedStep.type === WorkflowActionType.CONNECTOR
      ? selectedStep.settings.actionName
      : selectedStep.type === WorkflowTriggerType.CONNECTOR
      ? selectedStep.settings.triggerName
      : selectedStep.type;
  const connectorSchema =
    connectorModel?.actions[stepName ?? '']?.outputSchema ??
    connectorModel?.triggers[stepName ?? '']?.outputSchema ??
    null;
  const errorMessage = selectedStepOutput.errorMessage;

  return (
    <div className="h-full flex flex-col">
      <StepDataPanelHeader
        status={status}
        lastTestDate={run.created}
        viewMode="run"
      />
      <ScrollArea className="flex-1 p-3">
        <div className="flex w-full flex-col gap-3">
          {runLogUiUtils.runDataState(run) === 'MASKED_ONLY' && (
            <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>{runLogUiUtils.maskedOnlyNotice(retention)}</span>
            </div>
          )}
          <MaskedPayloadNotice
            executionId={run.id}
            stepName={selectedStep.name}
            maskedFields={stepMaskedFields}
            scope="step"
            redacted={run.payloadRedacted ?? false}
            canReveal={run.canRevealPayload ?? false}
            rawExpired={run.rawPayloadExpired ?? false}
          />
          <RunApprovalsNotice
            executionId={run.id}
            stepName={selectedStep.name}
            enabled={stepConnectorName === AI_CONNECTOR_NAME}
          />
          {!isStepRunning && (
            <RouterHitSummary
              step={selectedStep}
              output={selectedStepOutput.output}
            />
          )}
          {isStepRunning ? (
            <StepOutputSkeleton className="p-4" />
          ) : slicedOutputRef ? (
            <SlicedOutputDownload slicedOutputRef={slicedOutputRef} />
          ) : !isNil(errorMessage) ? (
            <StepErrorDetails errorText={errorMessage} step={selectedStep} />
          ) : status === 'success' ? (
            <SmartOutputViewer
              json={builtinOutputSchemas.displayOutput({
                step: selectedStep,
                output: parsedOutput,
              })}
              title={t('Data')}
              connectorSchema={
                connectorSchema ?? builtinOutputSchemas.forStep(selectedStep)
              }
            />
          ) : (
            <DataDisplayTabs
              data={parsedOutput}
              title={t('Output')}
              copyableData={parsedOutput}
              downloadFileName={`${selectedStep.name}-output`}
            />
          )}
          {!isStepRunning && !isNil(failureOutputSchema) && (
            <SmartOutputViewer
              json={selectedStepOutput.output}
              title={t('Failure details passed to the failure branch')}
              connectorSchema={failureOutputSchema}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export const RunStepActualInput = ({
  step,
}: {
  step: WorkflowAction | WorkflowTrigger;
}) => {
  const [run, loopsIndexes] = useBuilderStateContext((state) => [
    state.run,
    state.loopsIndexes,
  ]);
  const connectorStep =
    step.type === WorkflowActionType.CONNECTOR ||
    step.type === WorkflowTriggerType.CONNECTOR
      ? step
      : null;
  const { connectorModel } = connectorsHooks.useConnector({
    name: connectorStep?.settings.connectorName ?? '',
    version: connectorStep?.settings.connectorVersion,
    enabled: !isNil(connectorStep),
  });
  const stepOutput =
    isNil(run) || isNil(run.steps)
      ? null
      : executionUtils.extractStepOutput(step.name, loopsIndexes, run.steps);
  if (isNil(stepOutput)) {
    return (
      <span className="text-sm text-muted-foreground">
        {t(
          'This step was skipped during this run, no input or output was captured.',
        )}
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {truncatedInputUtils.hasTruncatedValues(stepOutput.input) && (
        <TruncatedInputNotice />
      )}
      <SmartOutputViewer
        json={stepOutput.input}
        title={t('Data')}
        connectorSchema={builtinOutputSchemas.inputSchema({
          step,
          connectorModel,
          input: stepOutput.input,
        })}
      />
    </div>
  );
};

const InternalErrorPanel = ({
  internalError,
}: {
  internalError: RunInternalError;
}) => (
  <ScrollArea className="h-full">
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <ShieldAlert className="w-4 h-4 text-destructive shrink-0" />
        <span className="text-sm font-medium">{t('Internal error')}</span>
        <Badge variant="outline" className="gap-1">
          <ShieldAlert className="w-3 h-3" />
          {t('Tenant Admin Only')}
        </Badge>
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>
          {t('Source')}: {internalError.source}
        </span>
        {internalError.code && (
          <span>
            {t('Code')}: {internalError.code}
          </span>
        )}
        <span>
          {t('Occurred at')}:{' '}
          {formatUtils.formatDate(new Date(internalError.occurredAt))}
        </span>
      </div>
      <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap break-words font-mono">
        {internalError.message}
      </pre>
    </div>
  </ScrollArea>
);

const TruncatedInputNotice = () => (
  <div className="flex items-start gap-2 p-3 bg-muted rounded-md text-sm">
    <Info className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
    <span>
      {t(
        'Some input values were too large to keep in the run logs and are shown as truncated. The step ran with the full values.',
      )}{' '}
      <a
        href="https://github.com/lokiworks/fema-ipaas/docs/install/troubleshooting/truncated-logs"
        target="_blank"
        rel="noreferrer"
        className="text-primary underline"
      >
        {t('Learn more')}
      </a>
    </span>
  </div>
);

const SlicedOutputDownload = ({
  slicedOutputRef,
}: {
  slicedOutputRef: LogSliceRef;
}) => (
  <div className="flex flex-col gap-3 p-4 bg-muted rounded-md">
    <div className="flex items-start gap-2 text-sm">
      <Info className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
      <span>
        {t(
          'Output is too large to display inline ({size}). Download to inspect.',
          { size: formatUtils.formatStorageSize(slicedOutputRef.size) },
        )}
      </span>
    </div>
    <Button asChild variant="outline" size="sm" className="w-fit gap-2">
      <a
        href={slicedOutputRef.url}
        target="_blank"
        rel="noopener noreferrer"
        download
      >
        <Download className="w-4 h-4" />
        {t('Download output')}
      </a>
    </Button>
  </div>
);

function handleRunFailureOrEmptyLog(
  run: Execution | null,
  retention: RunRetention | null,
) {
  if (
    isNil(run) ||
    !isExecutionStateTerminal({ status: run.status, ignoreInternalError: true })
  ) {
    return null;
  }

  if (runLogUiUtils.runDataState(run) === 'NONE') {
    return runLogUiUtils.logsGoneText(retention);
  }
  return null;
}
