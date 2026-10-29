import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { cn } from '@/lib/utils';

import { StepNodeRunDurationAndConnectorName } from './step-node-run-duration-and-connector-name';

const StepNodeDisplayName = ({
  stepDisplayName,
  isSkipped,
  connectorDisplayName,
  stepName,
}: {
  stepDisplayName: string;
  isSkipped: boolean;
  connectorDisplayName: string;
  stepName: string;
}) => {
  const canvasOrientation = useBuilderStateContext(
    (state) => state.canvasOrientation,
  );
  const isHorizontal = canvasOrientation === 'horizontal';
  return (
    <div
      className={cn('flex flex-col justify-center min-w-0', {
        'items-start': !isHorizontal,
        'grow w-full items-center': isHorizontal,
      })}
    >
      <div
        className={cn('flex items-center min-w-0 max-w-full', {
          'justify-between': !isHorizontal,
          'w-full justify-center': isHorizontal,
        })}
      >
        <TextWithTooltip tooltipMessage={stepDisplayName} key={stepDisplayName}>
          <div
            className={cn('text-sm font-medium truncate grow shrink', {
              'text-accent-foreground/70': isSkipped,
              'text-center': isHorizontal,
            })}
          >
            {stepDisplayName}
          </div>
        </TextWithTooltip>
      </div>
      <StepNodeRunDurationAndConnectorName
        stepName={stepName}
        stepDisplayName={stepDisplayName}
        connectorDisplayName={connectorDisplayName}
      />
    </div>
  );
};

export { StepNodeDisplayName };
