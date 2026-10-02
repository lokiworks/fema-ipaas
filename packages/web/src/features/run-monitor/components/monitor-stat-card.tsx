import { CircleHelp } from 'lucide-react';
import React from 'react';

import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function MonitorStatCard({
  label,
  value,
  suffix,
  delta,
  help,
  tone,
  active,
  onClick,
}: MonitorStatCardProps) {
  const body = (
    <>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {help && (
          <Tooltip>
            <TooltipTrigger asChild>
              <CircleHelp
                className="size-3 shrink-0 cursor-help"
                aria-label={help}
              />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{help}</TooltipContent>
          </Tooltip>
        )}
      </span>
      <span
        className={cn(
          'flex items-baseline gap-1 text-2xl font-semibold tabular-nums',
          tone === 'danger' && 'text-destructive',
        )}
      >
        {value}
        {suffix && (
          <span className="text-xs font-normal text-muted-foreground">
            {suffix}
          </span>
        )}
      </span>
      <span
        className="w-full truncate text-xs text-muted-foreground"
        title={typeof delta === 'string' ? delta : undefined}
      >
        {delta}
      </span>
    </>
  );
  return (
    <Card
      className={cn(
        'min-w-0 p-0 transition-colors',
        onClick && 'hover:border-primary/60',
        active && 'border-primary ring-1 ring-primary',
      )}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          className="flex w-full flex-col items-start gap-1 p-4 text-left"
        >
          {body}
        </button>
      ) : (
        <div className="flex flex-col items-start gap-1 p-4">{body}</div>
      )}
    </Card>
  );
}

type MonitorStatCardProps = {
  label: string;
  value: React.ReactNode;
  suffix?: string;
  delta: React.ReactNode;
  help?: string;
  tone?: 'danger';
  active?: boolean;
  onClick?: () => void;
};
