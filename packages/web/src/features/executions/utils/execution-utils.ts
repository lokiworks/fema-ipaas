import { isNil } from '@fema-ipaas/core-utils';
import {
  executionJournal,
  WorkflowActionType,
  Execution,
  ExecutionStatus,
  isFailedState,
  StepOutput,
  StepOutputStatus,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  LucideIcon,
  PauseIcon,
  Play,
  Timer,
} from 'lucide-react';

import { cn } from '@/lib/utils';

export const executionUtils = {
  updateRunSteps: (
    steps: Record<string, StepOutput>,
    stepName: string,
    path: readonly [string, number][],
    output: StepOutput,
  ) => {
    return executionJournal.upsertStep({
      stepName,
      stepOutput: output,
      path,
      steps,
      createLoopIterationIfNotExists: true,
    });
  },
  /*
   * Find the last step that has a status , or the last failed step
   */
  findLastStepWithStatus(
    runStatus: ExecutionStatus,
    steps: Record<string, StepOutput>,
  ): string | null {
    let lastStepWithStatus: string | null = null;
    if (runStatus === ExecutionStatus.SUCCEEDED) {
      return null;
    }
    const runFailed = isFailedState(runStatus);

    Object.entries(steps).forEach(([stepName, step]) => {
      if (runFailed && step.status === StepOutputStatus.FAILED) {
        lastStepWithStatus = stepName;
      }
      if (!runFailed) {
        lastStepWithStatus = stepName;
      }

      if (step.type === WorkflowActionType.LOOP_ON_ITEMS && step.output) {
        const iterations = step.output.iterations;
        iterations.forEach((iteration) => {
          const lastOneInIteration = executionUtils.findLastStepWithStatus(
            runStatus,
            iteration,
          );
          if (!isNil(lastOneInIteration)) {
            lastStepWithStatus = lastOneInIteration;
          }
        });
      }
    });
    return lastStepWithStatus;
  },
  pinLoopsToIterationsWithFailedStep(
    run: Execution,
    //runs get updated if they aren't terminated yet, so we shouldn't reset the loops state on each update
    currentLoopsState: Record<string, number>,
    options?: { liveFollowPaused?: boolean },
  ) {
    const loopsOutputs = executionJournal.getLoopSteps(run.steps);
    const latestStep = run.steps
      ? executionUtils.findLastStepWithStatus(run.status, run.steps)
      : null;
    const result = { ...currentLoopsState };

    Object.entries(loopsOutputs).forEach(([loopName, loopOutput]) => {
      const doesLoopIncludeLatestStep =
        latestStep && executionJournal.isChildOf(loopOutput, latestStep);

      if (isNil(loopOutput.output)) {
        result[loopName] = 0;
        return;
      }
      if (
        doesLoopIncludeLatestStep &&
        loopOutput.output &&
        !options?.liveFollowPaused
      ) {
        result[loopName] = loopOutput.output.iterations.length - 1;
        return;
      }
      result[loopName] = currentLoopsState[loopName] ?? 0;
    });
    return result;
  },
  snapLoopsToLatestIteration(
    run: Execution,
    currentLoopsState: Record<string, number>,
  ): Record<string, number> {
    const loopsOutputs = executionJournal.getLoopSteps(run.steps);
    const result = { ...currentLoopsState };
    Object.entries(loopsOutputs).forEach(([loopName, loopOutput]) => {
      if (!isNil(loopOutput.output)) {
        result[loopName] = loopOutput.output.iterations.length - 1;
      }
    });
    return result;
  },

  extractStepOutput: (
    stepName: string,
    loopsIndexes: Record<string, number>,
    runOutput: Record<string, StepOutput>,
  ): StepOutput | undefined => {
    const stepOutput = runOutput[stepName];
    if (!isNil(stepOutput)) {
      return stepOutput;
    }

    const path =
      executionJournal.getPathToStep(runOutput, stepName, loopsIndexes) ?? [];
    try {
      return executionJournal.getStep({ stepName, path, steps: runOutput });
    } catch (error) {
      return undefined;
    }
  },

  getStatusIconForStep(stepOutput: StepOutputStatus): {
    variant: 'default' | 'success' | 'error';
    Icon: LucideIcon;
    text: string;
    extraClassName?: string;
  } {
    switch (stepOutput) {
      case StepOutputStatus.RUNNING:
        return {
          variant: 'default',
          Icon: Timer,
          text: t('Running'),
          extraClassName: 'text-foreground',
        };
      case StepOutputStatus.PAUSED:
        return {
          variant: 'default',
          Icon: PauseIcon,
          text: t('Paused'),
        };
      case StepOutputStatus.STOPPED:
      case StepOutputStatus.SUCCEEDED:
        return {
          variant: 'success',
          Icon: CircleCheck,
          text: t('Succeeded'),
          extraClassName: 'text-success-700 dark:text-success-200',
        };
      case StepOutputStatus.FAILED:
        return {
          variant: 'error',
          Icon: CircleAlert,
          text: t('Failed'),
          extraClassName: 'text-destructive-700 dark:text-destructive-200',
        };
    }
  },

  getStatusContainerClassName(
    variant: 'default' | 'success' | 'error' | 'warning',
    withPaddingAndAnimation = false,
  ) {
    return cn('text-xs border rounded-md leading-tight', {
      'text-success-800 bg-success-50 border-success-200 dark:text-success-200 dark:bg-success-900 dark:border-success-800':
        variant === 'success',
      'text-destructive-700 bg-destructive-50 border-destructive-200 dark:text-destructive-200 dark:bg-destructive-900 dark:border-destructive-800':
        variant === 'error',
      'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-600 dark:bg-amber-950 border-amber-500 dark:border-amber-900':
        variant === 'warning',
      'bg-background  border-border text-foreground': variant === 'default',
      'flex gap-1 animate-in fade-in slide-in-from-bottom-2 duration-500 items-center  justify-center px-2 py-0.5':
        withPaddingAndAnimation,
    });
  },

  getStatusIcon(status: ExecutionStatus): {
    variant: 'default' | 'success' | 'error';
    Icon: LucideIcon;
  } {
    switch (status) {
      case ExecutionStatus.QUEUED:
        return {
          variant: 'default',
          Icon: Timer,
        };
      case ExecutionStatus.RUNNING:
        return {
          variant: 'default',
          Icon: Play,
        };
      case ExecutionStatus.FAILED:
        return {
          variant: 'error',
          Icon: CircleAlert,
        };
      case ExecutionStatus.PAUSED:
        return {
          variant: 'default',
          Icon: PauseIcon,
        };
      case ExecutionStatus.CANCELED:
        return {
          variant: 'default',
          Icon: CircleX,
        };
      case ExecutionStatus.SUCCEEDED:
        return {
          variant: 'success',
          Icon: CircleCheck,
        };
      case ExecutionStatus.MEMORY_LIMIT_EXCEEDED:
      case ExecutionStatus.LOG_SIZE_EXCEEDED:
      case ExecutionStatus.QUOTA_EXCEEDED:
      case ExecutionStatus.INTERNAL_ERROR:
      case ExecutionStatus.TIMEOUT:
        return {
          variant: 'error',
          Icon: CircleAlert,
        };
    }
  },
  getStatusLabelOverride(status: ExecutionStatus): string | null {
    if (status === ExecutionStatus.QUOTA_EXCEEDED) {
      return t('Out of credits');
    }
    return null;
  },
};
