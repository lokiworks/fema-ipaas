import { isNil } from '@fema-ipaas/core-utils';
import { ExecutionStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { cn } from '@/lib/utils';

export function RunStateChip() {
  const run = useBuilderStateContext((state) => state.run);

  const tone = isNil(run) ? IDLE : TONES[run.status] ?? IDLE;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={cn(
          'shrink-0 rounded-full border px-2 py-0.5 text-[11px] leading-4',
          tone.className,
        )}
      >
        {tone.label()}
      </span>
    </div>
  );
}

RunStateChip.displayName = 'RunStateChip';

const IDLE = {
  label: () => t('Not run'),
  className: 'border-border text-muted-foreground',
};

const TONES: Partial<
  Record<ExecutionStatus, { label: () => string; className: string }>
> = {
  [ExecutionStatus.RUNNING]: {
    label: () => t('Running'),
    className: 'border-primary/40 text-primary',
  },
  [ExecutionStatus.QUEUED]: {
    label: () => t('Queued'),
    className: 'border-border text-muted-foreground',
  },
  [ExecutionStatus.SUCCEEDED]: {
    label: () => t('Succeeded'),
    className: 'border-success-600/40 text-success-700',
  },
  [ExecutionStatus.FAILED]: {
    label: () => t('Failed'),
    className: 'border-destructive/40 text-destructive',
  },
  [ExecutionStatus.PAUSED]: {
    label: () => t('Paused'),
    className: 'border-warning/40 text-warning',
  },
  [ExecutionStatus.CANCELED]: {
    label: () => t('Canceled'),
    className: 'border-border text-muted-foreground',
  },
};
