import {
  WorkspaceWithLimits,
  WorkerGroupScope,
  WorkerMachineWithStatus,
} from '@fema/shared';
import { t } from 'i18next';
import { Layers, Plus } from 'lucide-react';
import { useState } from 'react';

import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Button } from '@/components/ui/button';
import { WorkerGroupInfo } from '@/features/platform-admin/api/workers-api';

import { AssignWorkspacesDialog } from './assign-workspaces-dialog';
import { WorkspaceAvatar } from './workspace-avatar';

export function ByGroupView({
  workspaces,
  workerGroups,
  workers,
}: ByGroupViewProps) {
  const groupsFromLive = workerGroups.map((g) => g.label);
  const groupsFromWorkspaces = workspaces
    .map((p) => p.workerGroupId)
    .filter((id): id is string => id != null);

  const allGroupLabels = Array.from(
    new Set([...groupsFromLive, ...groupsFromWorkspaces]),
  ).sort();

  if (allGroupLabels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <Layers className="size-10" strokeWidth={1.5} />
        <p className="text-sm">{t('No workspaces')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-4">
      {allGroupLabels.map((label) => (
        <GroupCard
          key={label}
          groupLabel={label}
          allWorkspaces={workspaces}
          workers={workers}
        />
      ))}
    </div>
  );
}

function GroupCard({ groupLabel, allWorkspaces, workers }: GroupCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const assignedWorkspaces = allWorkspaces.filter(
    (p) => p.workerGroupId === groupLabel,
  );

  const groupWorkers = workers.filter(
    (w) =>
      w.workerGroupScope === WorkerGroupScope.WORKSPACE &&
      w.workerGroupId === groupLabel,
  );
  const onlineWorkerCount = groupWorkers.length;
  const totalSlots = groupWorkers.reduce((sum, worker) => {
    const parsed = Number(worker.information.workerProps.WORKER_CONCURRENCY);
    return sum + (Number.isInteger(parsed) && parsed > 0 ? parsed : 1);
  }, 0);

  return (
    <>
      <div className="flex w-full flex-col rounded-lg border bg-background p-5 gap-4 sm:w-[475px]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Layers className="size-4" />
          </div>
          <TextWithTooltip tooltipMessage={groupLabel}>
            <span className="text-sm font-semibold truncate min-w-0">
              {groupLabel.replaceAll('_', ' ')}
            </span>
          </TextWithTooltip>
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold leading-tight">
            {onlineWorkerCount}
          </span>
          <span className="text-sm text-muted-foreground">
            {t('{count, plural, =1 {worker} other {workers}}', {
              count: onlineWorkerCount,
            })}{' '}
            | {t('{count} total concurrencies', { count: totalSlots })}
          </span>
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('WORKSPACES')}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="size-3.5" />
              {t('Assign')}
            </Button>
          </div>

          {assignedWorkspaces.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('No workspaces')}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {assignedWorkspaces.slice(0, 3).map((workspace) => (
                <WorkspaceChip key={workspace.id} workspace={workspace} />
              ))}
              {assignedWorkspaces.length > 3 && (
                <span className="text-xs text-muted-foreground">
                  {t('+{count} more', { count: assignedWorkspaces.length - 3 })}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <AssignWorkspacesDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        groupLabel={groupLabel}
        allWorkspaces={allWorkspaces}
      />
    </>
  );
}

function WorkspaceChip({ workspace }: { workspace: WorkspaceWithLimits }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs">
      <WorkspaceAvatar workspace={workspace} size="sm" />
      <TextWithTooltip tooltipMessage={workspace.displayName}>
        <span className="max-w-[100px] truncate">{workspace.displayName}</span>
      </TextWithTooltip>
    </div>
  );
}

type ByGroupViewProps = {
  workspaces: WorkspaceWithLimits[];
  workerGroups: WorkerGroupInfo[];
  workers: WorkerMachineWithStatus[];
};

type GroupCardProps = {
  groupLabel: string;
  allWorkspaces: WorkspaceWithLimits[];
  workers: WorkerMachineWithStatus[];
};
