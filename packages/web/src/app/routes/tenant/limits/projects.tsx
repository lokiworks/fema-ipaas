import { ProjectLimitsRow } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Pencil } from 'lucide-react';
import { useState } from 'react';

import { CenteredPage } from '@/app/components/centered-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  EditProjectLimitsDialog,
  LimitUsageBar,
  limitsHooks,
} from '@/features/limits';

export default function ProjectLimitsPage() {
  const { data, isLoading } = limitsHooks.useProjectLimits();
  const [editing, setEditing] = useState<ProjectLimitsRow | null>(null);
  const rows = data?.data ?? [];

  return (
    <CenteredPage
      widthClassName="max-w-5xl"
      title={t('Projects and limits')}
      description={t(
        'Workflow and monthly run limits of each project. Once a project reaches its monthly limit, new runs are refused and recorded in the run log.',
      )}
    >
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Project')}</TableHead>
              <TableHead>{t('Owner')}</TableHead>
              <TableHead className="text-right">{t('Members')}</TableHead>
              <TableHead>{t('Workflows')}</TableHead>
              <TableHead>{t('Runs this month')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.projectId}>
                <TableCell className="font-medium">{row.displayName}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.ownerName ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.memberCount}
                </TableCell>
                <TableCell>
                  <LimitCell
                    used={row.workflows.used}
                    limit={row.workflows.limit}
                    inherited={row.workflows.override === null}
                  />
                </TableCell>
                <TableCell>
                  <LimitCell
                    used={row.monthlyRuns.used}
                    limit={row.monthlyRuns.limit}
                    inherited={row.monthlyRuns.override === null}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(row)}
                  >
                    <Pencil className="size-4" />
                    {t('Adjust limits')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-sm text-muted-foreground"
                >
                  {t('No projects yet')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
      <EditProjectLimitsDialog
        row={editing}
        workflowsCeiling={data?.workflowsCeiling ?? 0}
        monthlyRunsCeiling={data?.monthlyRunsCeiling ?? 0}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
          }
        }}
      />
    </CenteredPage>
  );
}

function LimitCell({
  used,
  limit,
  inherited,
}: {
  used: number;
  limit: number | null;
  inherited: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <LimitUsageBar used={used} limit={limit} />
      {inherited && (
        <Badge variant="outline" className="shrink-0 text-xs font-normal">
          {t('Instance limit')}
        </Badge>
      )}
    </div>
  );
}
