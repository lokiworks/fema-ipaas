import {
  RateLimitUnit,
  ReliabilityEventKind,
  RunMonitorHandled,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatUtils } from '@/lib/format-utils';

export function MonitorHandledCard({
  handled,
  rangeLabel,
  connectorName,
  onOpenDuplicates,
  onOpenIssues,
  onOpenHandled,
}: {
  handled: RunMonitorHandled;
  rangeLabel: string;
  connectorName: (name: string) => string;
  onOpenDuplicates: (() => void) | null;
  onOpenIssues: () => void;
  onOpenHandled: (kind: ReliabilityEventKind) => void;
}) {
  const number = formatUtils.formatNumber;
  return (
    <Card data-testid="monitor-handled-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          {t('What the platform handled for you')}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(
            '{range}. Counted from the runs and the trigger records; open the details to check each number.',
            { range: rangeLabel },
          )}
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <HandledItem
          testId="handled-duplicates"
          value={number(handled.duplicateEvents)}
          label={t('Deduplicated triggers')}
          description={t(
            'The trigger saw the same event again and did not process it a second time.',
          )}
          actionLabel={t('See the deduplicated triggers')}
          disabledHint={t(
            'Deduplicated triggers are listed per project. Filter by exactly one project to see them.',
          )}
          onAction={onOpenDuplicates}
        />
        <HandledItem
          testId="handled-merged"
          value={number(handled.mergedFailures)}
          label={t('Failures merged into problems')}
          description={t('monitorMergedFailuresDescription', {
            failures: handled.mergedFailures,
            issues: handled.mergedIssues,
          })}
          actionLabel={t('See the problems')}
          disabledHint={null}
          onAction={onOpenIssues}
        />
        <HandledItem
          testId="handled-rate-limit"
          value={number(handled.rateLimitWaits)}
          label={t('Rate limits waited out')}
          description={t(
            '{waits, plural, =1 {A call hit} other {# calls hit}} the other system rate limit and waited for the time it asked for instead of failing, across {runs, plural, =1 {1 run} other {# runs}}.',
            { waits: handled.rateLimitWaits, runs: handled.rateLimitedRuns },
          )}
          detail={
            handled.rateLimitSources.length === 0
              ? null
              : handled.rateLimitSources
                  .map((source) =>
                    t('{connector} ({unit}): {total}', {
                      connector: connectorName(source.connectorName),
                      unit: rateLimitUnitLabel(source.unit),
                      total: number(source.count),
                    }),
                  )
                  .join(t('listSeparator'))
          }
          actionLabel={t('See these runs')}
          disabledHint={null}
          onAction={
            handled.rateLimitWaits === 0
              ? null
              : () => onOpenHandled(ReliabilityEventKind.RATE_LIMIT_QUEUED)
          }
        />
        <HandledItem
          testId="handled-retries"
          value={number(handled.autoRetries)}
          label={t('Safe retries')}
          description={t(
            '{retries, plural, =1 {A step was} other {# step attempts were}} retried by the error handling strategy of its node, across {runs, plural, =1 {1 run} other {# runs}}.',
            { retries: handled.autoRetries, runs: handled.retriedRuns },
          )}
          actionLabel={t('See these runs')}
          disabledHint={null}
          onAction={
            handled.autoRetries === 0
              ? null
              : () => onOpenHandled(ReliabilityEventKind.AUTO_RETRY)
          }
        />
        <HandledItem
          testId="handled-retries-withheld"
          value={number(handled.withheldRetries)}
          label={t('Retries withheld to avoid duplicates')}
          description={t(
            'The result of a write was unclear, so the platform left it for you to check before trying again.',
          )}
          actionLabel={t('See these runs')}
          disabledHint={null}
          onAction={
            handled.withheldRetries === 0
              ? null
              : () => onOpenHandled(ReliabilityEventKind.RETRY_WITHHELD)
          }
        />
        <HandledItem
          testId="handled-catch-up"
          value={number(handled.caughtUpEvents)}
          label={t('Events caught up after downtime')}
          description={t(
            'Events picked up by the first poll after the trigger had not polled for a while, for example while the platform was down.',
          )}
          actionLabel={t('See the caught-up runs')}
          disabledHint={null}
          onAction={
            handled.caughtUpEvents === 0
              ? null
              : () => onOpenHandled(ReliabilityEventKind.CATCH_UP)
          }
        />
      </CardContent>
    </Card>
  );
}

function rateLimitUnitLabel(unit: RateLimitUnit): string {
  switch (unit) {
    case RateLimitUnit.PER_ENTERPRISE:
      return t('counted per enterprise');
    case RateLimitUnit.PER_API_APP_TENANT:
      return t('counted per API, app and tenant');
    case RateLimitUnit.UNDECLARED:
      return t('counting unit not declared');
  }
}

function HandledItem({
  testId,
  value,
  label,
  description,
  detail = null,
  actionLabel,
  disabledHint,
  onAction,
}: {
  testId: string;
  value: string;
  label: string;
  description: string;
  detail?: string | null;
  actionLabel: string;
  disabledHint: string | null;
  onAction: (() => void) | null;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold" data-testid={testId}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{description}</span>
      {detail !== null && (
        <span
          className="text-xs text-muted-foreground"
          data-testid={`${testId}-detail`}
        >
          {detail}
        </span>
      )}
      <div>
        {onAction === null && disabledHint !== null ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-block">
                <Button
                  variant="link"
                  size="sm"
                  className="pointer-events-none px-0"
                  disabled
                >
                  {actionLabel}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{disabledHint}</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            variant="link"
            size="sm"
            className="px-0"
            disabled={onAction === null}
            onClick={() => onAction?.()}
          >
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
