import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { ImageWithColorBackground } from '@/components/custom/image-with-color-background';
import { cn } from '@/lib/utils';

const StepNodeLogo = ({
  isSkipped,
  logoUrl,
  displayName,
  isSelected = false,
  isHighlighted = false,
}: {
  isSkipped: boolean;
  logoUrl: string;
  displayName: string;
  isSelected?: boolean;
  isHighlighted?: boolean;
}) => {
  const canvasOrientation = useBuilderStateContext(
    (state) => state.canvasOrientation,
  );
  const isHorizontal = canvasOrientation === 'horizontal';
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl transition-shadow',
        {
          'opacity-80': isSkipped,
          'bg-background shadow-[0_1px_4px_rgba(31,35,41,0.12)]': !isHorizontal,
          'ring-2 ring-primary': !isHorizontal && isSelected,
          'ring-2 ring-primary/60':
            !isHorizontal && isHighlighted && !isSelected,
        },
      )}
    >
      <ImageWithColorBackground
        src={logoUrl}
        alt={displayName}
        key={logoUrl + displayName}
        border={true}
        className={cn({
          'size-12 p-3': !isHorizontal,
          'w-12 h-12 p-2.5': isHorizontal,
        })}
        roundedCorner={true}
      />
    </div>
  );
};

export { StepNodeLogo };
