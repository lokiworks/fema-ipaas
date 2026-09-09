import {
  FlagId,
  ExecutionStatus,
  isExecutionStateTerminal,
  StepOutputStatus,
} from '@fema-ipaas/shared';
import { useReactFlow } from '@xyflow/react';
import { t } from 'i18next';
import { ArrowRight, CircleHelp, Info, Magnet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { executionUtils } from '@/features/executions';
import {
  isTimelineEmpty,
  TimelineBar,
} from '@/features/executions/components/timeline-bar';
import { flagsHooks } from '@/hooks/flags-hooks';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import { EditWorkflowOrViewDraftButton } from '../../builder-header/workflow-status/view-draft-or-edit-workflow-button';
import { useBuilderStateContext } from '../../builder-hooks';
import { workflowCanvasUtils } from '../utils/workflow-canvas-utils';

import LargeWidgetWrapper from './large-widget-wrapper';

function getStatusText({
  status,
  timeout,
  memoryLimit,
  logSizeLimit,
}: {
  status: ExecutionStatus;
  timeout: number;
  memoryLimit: number;
  logSizeLimit: number;
}) {
  switch (status) {
    case ExecutionStatus.SUCCEEDED:
      return t('Run Succeeded');
    case ExecutionStatus.FAILED:
      return t('Run Failed');
    case ExecutionStatus.PAUSED:
      return t('Run Paused');
    case ExecutionStatus.LOG_SIZE_EXCEEDED:
      return t(
        'Run failed due to output of steps exceeding the log size limit of {logSizeLimit} MB',
        { logSizeLimit },
      );
    case ExecutionStatus.MEMORY_LIMIT_EXCEEDED:
      return t(
        'Run failed due to exceeding the memory limit of {memoryLimit} MB',
        {
          memoryLimit: Math.floor(memoryLimit / 1024),
        },
      );
    case ExecutionStatus.QUEUED:
      return t('Queued');
    case ExecutionStatus.RUNNING:
      return t('Running');
    case ExecutionStatus.TIMEOUT:
      return t('Run exceeded {timeout} seconds, try to optimize your steps.', {
        timeout,
      });
    case ExecutionStatus.INTERNAL_ERROR:
      return t('Run failed with an internal error, contact support.');
    case ExecutionStatus.CANCELED:
      return t('Run Cancelled');
  }
}

const RunInfoWidget = () => {
  const run = useBuilderStateContext((state) => state.run);
  const { variant, Icon } = run
    ? executionUtils.getStatusIcon(run.status)
    : { variant: 'default' as const, Icon: CircleHelp };
  const { data: timeoutSeconds } = flagsHooks.useFlag<number>(
    FlagId.EXECUTION_TIME_SECONDS,
  );
  const { data: memoryLimit } = flagsHooks.useFlag<number>(
    FlagId.EXECUTION_MEMORY_LIMIT_KB,
  );
  const { data: logSizeLimit } = flagsHooks.useFlag<number>(
    FlagId.EXECUTION_LOG_SIZE_LIMIT_MB,
  );
  if (!run) {
    return null;
  }
  const isRunTerminal = isExecutionStateTerminal({
    status: run.status,
    ignoreInternalError: false,
  });
  return (
    <LargeWidgetWrapper
      containerClassName={cn(
        executionUtils.getStatusContainerClassName(variant),
        'bg-background border border-border dark:bg-background dark:border-border',
      )}
      key={run.id + run.status}
    >
      <div className="flex items-center justify-between w-full flex-wrap">
        <div className="flex min-w-0 flex-wrap items-center text-sm">
          <Icon className="size-5 mr-2" />
          <span className="text-foreground dark:text-foreground font-medium">
            {getStatusText({
              status: run.status,
              timeout: timeoutSeconds ?? -1,
              memoryLimit: memoryLimit ?? -1,
              logSizeLimit: logSizeLimit ?? -1,
            })}
          </span>

          <div className="shrink-0 text-foreground dark:text-foreground">
            {isRunTerminal && (
              <>
                &nbsp;-&nbsp;
                {run.startTime && (
                  <DateSection
                    text={t('Started')}
                    dateOrDuration={formatUtils.formatDateWithTime(
                      new Date(run.startTime),
                      true,
                    )}
                  />
                )}
                {', '}
                {run.finishTime && run.startTime && (
                  <DateSection
                    text={t('Took')}
                    dateOrDuration={formatUtils.formatDuration(
                      new Date(run.finishTime).getTime() -
                        new Date(run.startTime).getTime(),
                    )}
                  />
                )}
              </>
            )}
          </div>
          {isRunTerminal && !isTimelineEmpty(run.timeline) && (
            <HoverCard openDelay={200} closeDelay={100}>
              <HoverCardTrigger className="ml-1 inline-flex cursor-default items-center">
                <Info className="size-4 text-muted-foreground" />
              </HoverCardTrigger>
              <HoverCardContent className="w-[28rem] p-3">
                <TimelineBar timeline={run.timeline} />
              </HoverCardContent>
            </HoverCard>
          )}
        </div>

        <div className="flex items-center gap-2">
          <ResumeLiveFollowButton isRunTerminal={isRunTerminal} />
          {run.failedStep && (
            <JumpToFailedStepButton failedStepName={run.failedStep.name} />
          )}
          <EditWorkflowOrViewDraftButton
            onCanvas={false}
          ></EditWorkflowOrViewDraftButton>
        </div>
      </div>
    </LargeWidgetWrapper>
  );
};
RunInfoWidget.displayName = 'RunInfoWidget';
export { RunInfoWidget };

const DateSection = ({
  text,
  dateOrDuration,
}: {
  text: string;
  dateOrDuration: string;
}) => {
  return (
    <>
      <span>{`${text}: `}</span>
      <span>{`${dateOrDuration}`}</span>
    </>
  );
};

const ResumeLiveFollowButton = ({
  isRunTerminal,
}: {
  isRunTerminal: boolean;
}) => {
  const [userManuallySelectedStepDuringRun, resumeLiveFollow] =
    useBuilderStateContext((state) => [
      state.userManuallySelectedStepDuringRun,
      state.resumeLiveFollow,
    ]);
  if (isRunTerminal || !userManuallySelectedStepDuringRun) {
    return null;
  }
  return (
    <Button variant="ghost" size="sm" onClick={resumeLiveFollow}>
      <Magnet className="size-4" />
      {t('Follow run updates')}
    </Button>
  );
};

const JumpToFailedStepButton = ({
  failedStepName,
}: {
  failedStepName: string;
}) => {
  const [selectedStep, selectFailedStep, run, loopsIndexes] =
    useBuilderStateContext((state) => [
      state.selectedStep,
      state.selectFailedStep,
      state.run,
      state.loopsIndexes,
    ]);
  const { fitView } = useReactFlow();
  const selectedStepOutput =
    run && selectedStep
      ? executionUtils.extractStepOutput(
          selectedStep,
          loopsIndexes,
          run.steps ?? {},
        )
      : null;
  if (
    selectedStep === failedStepName &&
    selectedStepOutput?.status === StepOutputStatus.FAILED
  ) {
    return null;
  }
  const handleClick = () => {
    selectFailedStep();
    fitView(workflowCanvasUtils.createFocusStepInGraphParams(failedStepName));
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className="text-destructive-700 hover:text-destructive-700 dark:text-destructive-200 dark:hover:text-destructive-200"
    >
      <ArrowRight className="size-4" />
      {t('See error')}
    </Button>
  );
};
