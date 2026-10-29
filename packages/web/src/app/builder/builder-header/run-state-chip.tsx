import { isNil } from '@fema-ipaas/core-utils';
import { WorkflowStatus } from '@fema-ipaas/shared';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { useLiveWorkflowStatus } from '@/app/builder/use-live-workflow-status';
import { cn } from '@/lib/utils';

import { workflowStatusLabels } from './workflow-status-labels';

export function RunStateChip() {
  const workflow = useBuilderStateContext((state) => state.workflow);
  const status = useLiveWorkflowStatus();
  const running = status === WorkflowStatus.ENABLED;
  const label = workflowStatusLabels.runState({
    running,
    hasProduction: !isNil(workflow.publishedVersionId),
  });

  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs leading-4',
        running
          ? 'bg-success-50 text-success-700'
          : 'bg-muted text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          running ? 'bg-success' : 'bg-muted-foreground/60',
        )}
      />
      {label}
    </span>
  );
}

RunStateChip.displayName = 'RunStateChip';
