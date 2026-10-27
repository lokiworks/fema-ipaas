import { ExecutionStatus } from '@fema-ipaas/shared';

import { executionUtils } from '@/features/executions/utils/execution-utils';
import { cn } from '@/lib/utils';

export function RunStatus({ status }: { status: ExecutionStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
      <span
        aria-hidden="true"
        className={cn('size-2 shrink-0 rounded-full', dotClassName(status))}
      />
      {executionUtils.getStatusLabel(status)}
    </span>
  );
}

function dotClassName(status: ExecutionStatus): string {
  switch (status) {
    case ExecutionStatus.SUCCEEDED:
      return 'bg-success';
    case ExecutionStatus.RUNNING:
    case ExecutionStatus.QUEUED:
    case ExecutionStatus.PAUSED:
      return 'bg-primary';
    case ExecutionStatus.CANCELED:
      return 'bg-muted-foreground';
    case ExecutionStatus.FAILED:
    case ExecutionStatus.TIMEOUT:
    case ExecutionStatus.INTERNAL_ERROR:
    case ExecutionStatus.MEMORY_LIMIT_EXCEEDED:
    case ExecutionStatus.LOG_SIZE_EXCEEDED:
      return 'bg-destructive';
  }
}
