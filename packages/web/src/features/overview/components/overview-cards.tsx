import {
  ConnectionHealthSummary,
  ConnectionStatus,
  ConnectorUsageSummary,
  ExecutionStatus,
  RecentlyEditedWorkflow,
} from '@fema-ipaas/shared';
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
                to={`${authenticationSession.appendProjectRoutePrefix(
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

export function ConnectionHealthCard({
  health,
  isLoading,
}: {
  health: ConnectionHealthSummary[];
  isLoading: boolean;
}) {
  const total = health.reduce((sum, entry) => sum + entry.count, 0);
  const broken = health
    .filter((entry) => entry.status !== ConnectionStatus.ACTIVE)
    .reduce((sum, entry) => sum + entry.count, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {t('Connection health')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : total === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">
            {t('No connections yet')}
          </div>
        ) : (
          <Link
            to={authenticationSession.appendProjectRoutePrefix('/connections')}
            className="flex flex-col gap-1"
          >
            <span className="text-2xl font-semibold">
              {broken === 0 ? t('All healthy') : `${broken} / ${total}`}
            </span>
            <span className="text-xs text-muted-foreground">
              {broken === 0
                ? t('{count} connections working', { count: total })
                : t('connections need attention')}
            </span>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

export function TopConnectorsCard({
  connectors,
  isLoading,
}: {
  connectors: ConnectorUsageSummary[];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {t('Most used connectors')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : connectors.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">
            {t('No connections yet')}
          </div>
        ) : (
          <div className="flex flex-col divide-y">
            {connectors.map((connector) => (
              <div
                key={connector.connectorName}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="truncate">
                  {connectorNameUtils.readable(connector.connectorName)}
                </span>
                <span className="shrink-0 pl-3 text-muted-foreground">
                  {connector.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RecentlyEditedCard({
  workflows,
  isLoading,
}: {
  workflows: RecentlyEditedWorkflow[];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {t('Recently edited')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : workflows.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">
            {t('No workflows yet')}
          </div>
        ) : (
          <div className="flex flex-col divide-y">
            {workflows.map((workflow) => (
              <Link
                key={workflow.workflowId}
                to={authenticationSession.appendProjectRoutePrefix(
                  `/workflows/${workflow.workflowId}`,
                )}
                className="flex items-center justify-between py-2 text-sm hover:underline"
              >
                <span className="truncate">{workflow.displayName}</span>
                <span className="shrink-0 pl-3 text-muted-foreground">
                  {formatUtils.formatDateOnly(new Date(workflow.updated))}
                </span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const connectorNameUtils = {
  readable(connectorName: string): string {
    return connectorName.replace('@fema-ipaas/connector-', '');
  },
};
