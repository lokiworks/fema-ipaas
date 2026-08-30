import { Timer } from 'lucide-react';
import { useMemo } from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { executionUtils } from '@/features/executions';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

const StepNodeRunDuration = ({ duration }: { duration: number }) => {
  return (
    <div className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
      <Timer className="size-3" />
      <span>{formatUtils.formatDuration(duration, true)}</span>
    </div>
  );
};

const StepNodeRunDurationAndConnectorName = ({
  stepName,
  connectorDisplayName,
}: {
  stepName: string;
  connectorDisplayName: string;
}) => {
  const [run, loopIndexes, workflowVersion, canvasOrientation] =
    useBuilderStateContext((state) => [
      state.run,
      state.loopsIndexes,
      state.workflowVersion,
      state.canvasOrientation,
    ]);
  const isHorizontal = canvasOrientation === 'horizontal';
  const selectedStepOutput = useMemo(() => {
    return run && run.steps
      ? executionUtils.extractStepOutput(stepName, loopIndexes, run.steps)
      : null;
  }, [run, stepName, loopIndexes, workflowVersion.trigger]);

  return (
    <div
      className={cn('flex mt-0.5 w-full items-center', {
        'justify-between': !isHorizontal,
        'justify-center': isHorizontal,
      })}
    >
      <TextWithTooltip
        tooltipMessage={`${connectorDisplayName} · ${stepName}`}
        key={stepName + selectedStepOutput?.duration}
      >
        <div
          className={cn(
            'font-mono text-[11px] text-muted-foreground truncate grow shrink',
            {
              'w-full': !isHorizontal,
              'text-center': isHorizontal,
            },
          )}
        >
          {stepName}
        </div>
      </TextWithTooltip>
      {selectedStepOutput && (
        <StepNodeRunDuration duration={selectedStepOutput?.duration ?? 0} />
      )}
    </div>
  );
};
StepNodeRunDurationAndConnectorName.displayName =
  'StepNodeRunDurationAndConnectorName';
export { StepNodeRunDurationAndConnectorName };
