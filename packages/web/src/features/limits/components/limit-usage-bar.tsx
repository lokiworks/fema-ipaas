import { Progress } from '@/components/ui/progress';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import { limitsUtils } from '../utils/limits-utils';

export function LimitUsageBar({
  used,
  limit,
  className,
}: {
  used: number;
  limit: number | null;
  className?: string;
}) {
  const ratio = limitsUtils.usageRatio({ used, limit });
  const tone = limitsUtils.usageTone(ratio);
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <Progress
        className="h-1.5 w-24 shrink-0"
        value={Math.min(100, (ratio ?? 0) * 100)}
        indicatorClassName={limitsUtils.toneIndicatorClass(tone)}
      />
      <span
        className={cn(
          'truncate text-xs tabular-nums',
          limitsUtils.toneTextClass(tone),
        )}
      >
        {`${formatUtils.formatNumber(used)} / ${
          limit === null ? '—' : formatUtils.formatNumber(limit)
        }`}
      </span>
    </div>
  );
}
