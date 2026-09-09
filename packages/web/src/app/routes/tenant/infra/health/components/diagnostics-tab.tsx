import { GetDiagnosticsResponse } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SkeletonList } from '@/components/ui/skeleton';

import { healthMetricsQueries } from '../lib/health-metrics-hooks';

export function DiagnosticsTab({ enabled }: { enabled: boolean }) {
  const { data, isLoading } = healthMetricsQueries.useDiagnostics(enabled);

  if (isLoading || !data) {
    return <SkeletonList numberOfItems={4} className="h-24" />;
  }

  return (
    <div className="flex flex-col gap-4 pt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('Infrastructure dependencies')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <InfraTile label={t('Database')} check={data.database} />
          <InfraTile label={t('Redis')} check={data.redis} />
          <InfraTile label={t('File storage')} check={data.storage} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('Deployment')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <Fact
            label={t('Execution mode')}
            value={orUnknown(data.config.executionMode)}
          />
          <Fact
            label={t('File storage location')}
            value={orUnknown(data.config.fileStorageLocation)}
          />
          <Fact
            label={t('Sandbox memory limit')}
            value={formatMegabytes(data.config.sandboxMemoryLimitKb)}
          />
          <Fact
            label={t('Default concurrent jobs')}
            value={orUnknown(data.config.defaultConcurrentJobsLimit)}
          />
          <Fact
            label={t('Project rate limiter')}
            value={
              data.config.projectRateLimiterEnabled
                ? t('Enabled')
                : t('Disabled')
            }
          />
          <Fact
            label={t('S3 signed URLs')}
            value={data.config.s3SignedUrls ? t('Enabled') : t('Disabled')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('appInstances', { count: data.apps.count })}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {data.apps.instances.map((instance) => (
            <div
              key={instance.hostname}
              className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2 text-sm"
            >
              <span className="font-medium">{instance.hostname}</span>
              <span className="text-muted-foreground">
                {t('Version')} {instance.version}
              </span>
              <span className="text-muted-foreground tabular-nums">
                CPU {formatPercentage(instance.cpuUsagePercentage)} · {t('RAM')}{' '}
                {formatPercentage(instance.ramUsagePercentage)} · {t('Disk')}{' '}
                {formatPercentage(instance.diskPercentage)}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {t('Event loop delay')}{' '}
                {formatMilliseconds(instance.eventLoopDelayMs)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('workerMachines', { count: data.workers.count })}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {data.workers.machines.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              {t('No workers are connected.')}
            </p>
          )}
          {data.workers.machines.map((machine) => (
            <div
              key={machine.workerId}
              className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2 text-sm"
            >
              <span className="font-medium">{machine.workerId}</span>
              <span className="text-muted-foreground">{machine.status}</span>
              <span className="text-muted-foreground tabular-nums">
                CPU {formatPercentage(machine.cpuUsagePercentage)} · {t('RAM')}{' '}
                {formatPercentage(machine.ramUsagePercentage)}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {t('Ping')} {formatMilliseconds(machine.serverPingMs)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function InfraTile({ label, check }: InfraTileProps) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        {check.detail !== null && (
          <span className="text-xs text-muted-foreground">{check.detail}</span>
        )}
        {check.detail === null && check.ok && check.latencyMs === null && (
          <span className="text-xs text-muted-foreground">
            {t('Nothing to measure for this backend.')}
          </span>
        )}
      </div>
      <span
        className={
          check.ok
            ? 'text-sm tabular-nums text-success-700'
            : 'text-sm tabular-nums text-destructive-700'
        }
      >
        {check.ok ? t('Reachable') : t('Unreachable')}
        {check.latencyMs !== null &&
          ` · ${check.latencyMs}${t('millisecondsShort')}`}
      </span>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatMegabytes(kilobytes: number | null): string {
  if (kilobytes === null) {
    return t('Unknown');
  }
  return `${Math.round(kilobytes / 1024)} MB`;
}

function formatMilliseconds(value: number | null): string {
  return value === null
    ? t('Unknown')
    : `${Math.round(value)}${t('millisecondsShort')}`;
}

function orUnknown(value: string | number | null): string {
  return value === null ? t('Unknown') : String(value);
}

type InfraTileProps = {
  label: string;
  check: GetDiagnosticsResponse['database'];
};
