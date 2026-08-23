import { ExecutionStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Link } from 'react-router-dom';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { authenticationSession } from '@/lib/authentication-session';
import { formatUtils } from '@/lib/format-utils';

export function OverviewStatCard({
  label,
  value,
  hint,
  isLoading,
}: {
  label: string;
  value: string;
  hint?: string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-3xl font-semibold">{value}</div>
        )}
        {hint && !isLoading && (
          <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}

export function RunTrendChart({
  trend,
  isLoading,
}: {
  trend: { day: string; succeeded: number; failed: number }[];
  isLoading: boolean;
}) {
  const max = Math.max(1, ...trend.map((d) => d.succeeded + d.failed));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {t('Runs over time')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : trend.length === 0 ? (
          <div className="flex h-32 items-center text-sm text-muted-foreground">
            {t('No runs in this period')}
          </div>
        ) : (
          <div className="flex h-32 items-end gap-1">
            {trend.map((point) => (
              <div
                key={point.day}
                className="flex flex-1 flex-col justify-end gap-px"
                title={`${formatUtils.formatDateOnly(new Date(point.day))} · ${
                  point.succeeded
                } ${t('succeeded')}, ${point.failed} ${t('failed')}`}
              >
                <div
                  className="w-full rounded-t-sm bg-destructive/70"
                  style={{ height: `${(point.failed / max) * 100}%` }}
                />
                <div
                  className="w-full bg-primary/70"
                  style={{ height: `${(point.succeeded / max) * 100}%` }}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FailingWorkflowsCard({
  workflows,
  isLoading,
}: {
  workflows: {
    workflowId: string;
    displayName: string;
    count: number;
    lastFailure: string;
  }[];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {t('Failing workflows')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : workflows.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">
            {t('No failures in this period')}
          </div>
        ) : (
          <div className="flex flex-col divide-y">
            {workflows.map((workflow) => (
              <Link
                key={workflow.workflowId}
                to={`${authenticationSession.appendWorkspaceRoutePrefix(
                  '/runs',
                )}?workflowId=${workflow.workflowId}&status=${
                  ExecutionStatus.FAILED
                }`}
                className="flex items-center justify-between py-2 text-sm hover:underline"
              >
                <span className="truncate">{workflow.displayName}</span>
                <span className="shrink-0 pl-3 text-destructive">
                  {workflow.count}
                </span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
