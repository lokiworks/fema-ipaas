import { cn } from '@/lib/utils';

import { useBuilderStateContext } from '../../builder-hooks';
import { leftPanelWidth } from '../../left-panel';

const LargeWidgetWrapper = ({
  children,
  containerClassName,
}: {
  children: React.ReactNode;
  containerClassName?: string;
}) => {
  const leftSidebar = useBuilderStateContext((state) => state.leftSidebar);
  const panelWidth = leftPanelWidth(leftSidebar);
  return (
    <div
      className="pointer-events-none absolute right-3 top-3 z-40 flex justify-center"
      style={{
        left: TOOL_RAIL_OFFSET + (panelWidth > 0 ? panelWidth + 8 : 0),
      }}
    >
      <div
        className={cn(
          'pointer-events-auto py-1.5 px-3.5 border min-h-11.5 border-border bg-background z-40 w-full max-w-[760px] gap-3 animate animate-fade duration-300 rounded-lg shadow-sm flex items-center justify-between',
          containerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
};
LargeWidgetWrapper.displayName = 'LargeWidgetWrapper';
export default LargeWidgetWrapper;

const TOOL_RAIL_OFFSET = 64;
