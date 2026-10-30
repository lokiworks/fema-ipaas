import React, { ComponentType } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const RailButton = React.forwardRef<HTMLButtonElement, RailButtonProps>(
  (
    {
      icon: Icon,
      label,
      active,
      badge,
      badgeHint,
      showLabel = true,
      className,
      ...props
    },
    ref,
  ) => {
    const badgeText = badge && badge > 99 ? '99+' : badge;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={ref}
            type="button"
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex w-12 shrink-0 flex-col items-center justify-center gap-1 rounded-md py-1.5 text-rail-foreground transition-colors',
              'hover:bg-rail-accent hover:text-rail-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              active && 'bg-rail-accent text-rail-active',
              !showLabel && 'h-9',
              className,
            )}
            {...props}
          >
            <Icon className="size-[18px]" />
            {showLabel && (
              <span className="max-w-full truncate text-[11px] leading-none">
                {label}
              </span>
            )}
            {badge !== undefined && badge > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
                {badgeText}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {badge !== undefined && badge > 0 && badgeHint ? badgeHint : label}
        </TooltipContent>
      </Tooltip>
    );
  },
);

RailButton.displayName = 'RailButton';

type RailButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> & {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  badge?: number;
  badgeHint?: string;
  showLabel?: boolean;
};
