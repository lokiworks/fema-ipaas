import { WorkerNode, WorkerNodeStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { AlertCircle, MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { tenantAccessHooks, tenantAccessUtils } from '@/features/tenant-access';
import { useTimeAgo } from '@/hooks/use-time-ago';

import { AddWorkerDialog } from './add-worker-dialog';

export function NodesTab() {
  const { data: fleet, isLoading } = tenantAccessHooks.useWorkerFleet();
  const [addOpen, setAddOpen] = useState(false);
  const nodes = fleet?.nodes ?? [];
  const online = nodes.filter(
    (node) => node.status === WorkerNodeStatus.ONLINE,
  );
  const capacity = online.reduce((sum, node) => sum + node.concurrency, 0);
  const lagging = nodes.filter(
    (node) =>
      node.status !== WorkerNodeStatus.OFFLINE && !node.versionMatchesApp,
  );

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1 text-sm">
          <span>
            {t('onlineWorkersSummary', {
              online: online.length,
              total: nodes.length,
              capacity,
            })}
          </span>
          {lagging.length > 0 && (
            <span className="flex items-center gap-1 text-warning-700">
              <AlertCircle className="size-4" />
              {t(
                '{count} workers run a different version than the app ({version}) and receive no jobs until upgraded.',
                { count: lagging.length, version: fleet?.appVersion ?? '' },
              )}
            </span>
          )}
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          {t('Add worker')}
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Worker')}</TableHead>
              <TableHead className="w-28">{t('Status')}</TableHead>
              <TableHead className="w-32">{t('Version')}</TableHead>
              <TableHead className="w-40">{t('Labels')}</TableHead>
              <TableHead className="w-28">{t('Busy / concurrency')}</TableHead>
              <TableHead className="w-28">{t('CPU / memory')}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodes.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  {t(
                    'No workers yet. Add at least one worker so workflows can run.',
                  )}
                </TableCell>
              </TableRow>
            )}
            {nodes.map((node) => (
              <NodeRow
                key={node.id}
                node={node}
                appVersion={fleet?.appVersion ?? ''}
              />
            ))}
          </TableBody>
        </Table>
      )}
      <AddWorkerDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        appVersion={fleet?.appVersion ?? 'latest'}
      />
    </div>
  );
}

function NodeRow({
  node,
  appVersion,
}: {
  node: WorkerNode;
  appVersion: string;
}) {
  const heartbeat = useTimeAgo(new Date(node.lastHeartbeatAt));
  const {
    mutate: act,
    mutateAsync: actAsync,
    isPending,
  } = tenantAccessHooks.useWorkerAction();
  const offline = node.status === WorkerNodeStatus.OFFLINE;
  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-mono text-sm">{node.ip}</span>
          <span className="text-xs text-muted-foreground">
            {t('Last heartbeat {time}', { time: heartbeat })}
            {node.workerGroupId && ` · ${node.workerGroupId}`}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Badge
          variant={
            node.status === WorkerNodeStatus.ONLINE
              ? 'success'
              : node.status === WorkerNodeStatus.DRAINING
              ? 'info'
              : 'outline'
          }
        >
          {tenantAccessUtils.workerStatusLabel(node.status)}
        </Badge>
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-1">
          {node.version ?? '—'}
          {!offline && !node.versionMatchesApp && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertCircle className="size-4 text-warning-700" />
              </TooltipTrigger>
              <TooltipContent>
                {t(
                  'Does not match the app version {version}; upgrade this worker',
                  {
                    version: appVersion,
                  },
                )}
              </TooltipContent>
            </Tooltip>
          )}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {node.labels.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            node.labels.map((label) => (
              <Badge key={label} variant="outline">
                {label}
              </Badge>
            ))
          )}
        </div>
      </TableCell>
      <TableCell>
        {offline ? '—' : `${node.busySandboxes} / ${node.concurrency}`}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {offline
          ? '—'
          : `${Math.round(node.cpuUsagePercentage ?? 0)}% / ${Math.round(
              node.ramUsagePercentage ?? 0,
            )}%`}
      </TableCell>
      <TableCell>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('More actions')}
              disabled={isPending}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {node.status === WorkerNodeStatus.DRAINING ? (
              <DropdownMenuItem
                onSelect={() => act({ id: node.id, action: 'resume' })}
              >
                {t('Resume taking jobs')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={offline}
                onSelect={() => act({ id: node.id, action: 'drain' })}
              >
                <div className="flex flex-col">
                  <span>{t('Drain')}</span>
                  <span className="text-xs text-muted-foreground">
                    {offline
                      ? t('Only online workers can be drained')
                      : t('Stops new jobs; running jobs finish')}
                  </span>
                </div>
              </DropdownMenuItem>
            )}
            <ConfirmationDeleteDialog
              title={t('Remove worker')}
              message={t(
                'The worker disappears from this list. If its process is still running it shows up again on its next heartbeat; stop the container to take it away for good.',
              )}
              entityName={node.ip}
              buttonText={t('Remove')}
              mutationFn={async () => {
                await actAsync({ id: node.id, action: 'remove' });
              }}
            >
              <DropdownMenuItem
                disabled={!offline}
                onSelect={(event) => event.preventDefault()}
              >
                <div className="flex flex-col">
                  <span>{t('Remove')}</span>
                  {!offline && (
                    <span className="text-xs text-muted-foreground">
                      {t('Take the worker offline first')}
                    </span>
                  )}
                </div>
              </DropdownMenuItem>
            </ConfirmationDeleteDialog>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
