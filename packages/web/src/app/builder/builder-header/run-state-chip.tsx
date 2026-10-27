import { isNil } from '@fema-ipaas/core-utils';
import { WorkflowStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { projectWorkspaceHooks } from '@/features/project-workspace/hooks/project-workspace-hooks';
import { cn } from '@/lib/utils';

export function RunStateChip() {
  const workflow = useBuilderStateContext((state) => state.workflow);
  const { data: tree } = projectWorkspaceHooks.useTree(workflow.projectId);
  const status =
    tree?.workflows.find((row) => row.id === workflow.id)?.status ??
    workflow.status;
  const running = status === WorkflowStatus.ENABLED;
  const label = running
    ? t('Running')
    : isNil(workflow.publishedVersionId)
    ? t('Not run')
    : t('Stopped');

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
