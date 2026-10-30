import { isNil } from '@fema-ipaas/core-utils';
import {
  StepOutput,
  StepOutputStatus,
  WorkflowActionType,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { executionUtils } from '@/features/executions';
import { cn } from '@/lib/utils';

export function LoopIterationSwitcher({ stepName }: { stepName: string }) {
  const [setLoopIndex, currentIndex, run, loopsIndexes, stepType, orientation] =
    useBuilderStateContext((state) => [
      state.setLoopIndex,
      state.loopsIndexes[stepName] ?? 0,
      state.run,
      state.loopsIndexes,
      workflowStructureUtil.getStep(stepName, state.workflowVersion.trigger)
        ?.type,
      state.canvasOrientation,
    ]);
  const statuses = useMemo<StepOutputStatus[]>(() => {
    if (isNil(run) || isNil(run.steps)) {
      return [];
    }
    const output = executionUtils.extractStepOutput(
      stepName,
      loopsIndexes,
      run.steps,
    );
    if (
      isNil(output) ||
      output.type !== WorkflowActionType.LOOP_ON_ITEMS ||
      isNil(output.output)
    ) {
      return [];
    }
    return output.output.iterations.map(iterationStatus);
  }, [run, stepName, loopsIndexes]);
  const total = statuses.length;

  if (
    isNil(run) ||
    stepType !== WorkflowActionType.LOOP_ON_ITEMS ||
    total === 0
  ) {
    return null;
  }
  const index = Math.min(currentIndex, total - 1);
  const select = (next: number) =>
    setLoopIndex(stepName, Math.max(0, Math.min(next, total - 1)));
  const stop = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  return (
    <div
      data-testid="loop-iteration-switcher"
      className={cn(
        'nodrag absolute z-20 flex items-center gap-0.5 rounded-md border bg-background p-0.5 text-xs shadow-xs',
        orientation === 'horizontal'
          ? 'left-1/2 top-[calc(100%+48px)] -translate-x-1/2'
          : 'left-[calc(50%+34px)] top-[calc(50%+22px)]',
      )}
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={stop}
      onDoubleClick={stop}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6"
        disabled={index === 0}
        aria-label={t('Previous iteration')}
        onClick={() => select(index - 1)}
      >
        <ChevronLeft className="size-3.5" />
      </Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-6 items-center gap-1 rounded-sm px-1.5 whitespace-nowrap hover:bg-accent"
            aria-label={t('Choose an iteration')}
          >
            <span
              className={cn(
                'size-2 shrink-0 rounded-full',
                dotClassName(statuses[index]),
              )}
            />
            {t('Iteration {current} of {total}', {
              current: index + 1,
              total,
            })}
            <ChevronDown className="size-3 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-64 overflow-y-auto"
          onClick={stop}
        >
          {statuses.map((status, position) => (
            <DropdownMenuItem
              key={position}
              onSelect={() => select(position)}
              className={cn(
                'flex items-center gap-2 text-xs',
                position === index && 'bg-accent',
              )}
            >
              <span
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  dotClassName(status),
                )}
              />
              {t('Iteration {index}', { index: position + 1 })}
              <span className="text-muted-foreground">
                {statusLabel(status)}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6"
        disabled={index === total - 1}
        aria-label={t('Next iteration')}
        onClick={() => select(index + 1)}
      >
        <ChevronRight className="size-3.5" />
      </Button>
    </div>
  );
}

function iterationStatus(
  iteration: Record<string, StepOutput>,
): StepOutputStatus {
  const statuses = Object.values(iteration).map((output) => output.status);
  if (statuses.includes(StepOutputStatus.FAILED)) {
    return StepOutputStatus.FAILED;
  }
  if (statuses.includes(StepOutputStatus.RUNNING)) {
    return StepOutputStatus.RUNNING;
  }
  if (statuses.includes(StepOutputStatus.PAUSED)) {
    return StepOutputStatus.PAUSED;
  }
  return StepOutputStatus.SUCCEEDED;
}

function dotClassName(status: StepOutputStatus | undefined): string {
  switch (status) {
    case StepOutputStatus.FAILED:
      return 'bg-destructive';
    case StepOutputStatus.RUNNING:
      return 'bg-primary animate-pulse';
    case StepOutputStatus.PAUSED:
      return 'bg-warning';
    default:
      return 'bg-success';
  }
}

function statusLabel(status: StepOutputStatus): string {
  switch (status) {
    case StepOutputStatus.FAILED:
      return t('Failed');
    case StepOutputStatus.RUNNING:
      return t('Executing');
    case StepOutputStatus.PAUSED:
      return t('Paused');
    default:
      return t('Succeeded');
  }
}
