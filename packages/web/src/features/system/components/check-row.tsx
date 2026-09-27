import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react';
import React from 'react';

import { cn } from '@/lib/utils';

export function CheckRow({
  level,
  title,
  children,
  action,
}: {
  level: CheckLevel;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const Icon = LEVEL_ICONS[level];
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className={cn('mt-0.5 size-4 shrink-0', LEVEL_CLASSES[level])} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        {children && (
          <div className="text-xs text-muted-foreground">{children}</div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const LEVEL_ICONS = {
  ok: CircleCheck,
  warning: TriangleAlert,
  error: CircleX,
  info: Info,
};

const LEVEL_CLASSES = {
  ok: 'text-success-700',
  warning: 'text-warning',
  error: 'text-destructive',
  info: 'text-muted-foreground',
};

export type CheckLevel = 'ok' | 'warning' | 'error' | 'info';
