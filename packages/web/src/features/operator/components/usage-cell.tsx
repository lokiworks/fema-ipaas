import { cn } from '@/lib/utils';

import { operatorUtils } from '../utils/operator-utils';

export function UsageCell({
  used,
  limit,
  testId,
}: {
  used: number;
  limit: number | null | undefined;
  testId?: string;
}) {
  const ratio = operatorUtils.usageRatio({ used, limit });
  const tone = operatorUtils.usageTone({ used, limit });
  return (
    <div className="flex min-w-24 flex-col gap-1" data-testid={testId}>
      <span
        className={cn(
          'text-sm tabular-nums',
          tone === 'danger' && 'text-destructive',
          tone === 'warning' && 'text-amber-600',
        )}
      >
        {used} / {operatorUtils.limitLabel(limit)}
      </span>
      {ratio !== null && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full',
              tone === 'danger' && 'bg-destructive',
              tone === 'warning' && 'bg-amber-500',
              tone === 'normal' && 'bg-primary',
            )}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
