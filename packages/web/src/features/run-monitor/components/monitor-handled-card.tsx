import { RunMonitorHandled } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatUtils } from '@/lib/format-utils';

export function MonitorHandledCard({
  handled,
  rangeLabel,
  onOpenDuplicates,
  onOpenIssues,
}: {
  handled: RunMonitorHandled;
  rangeLabel: string;
  onOpenDuplicates: (() => void) | null;
  onOpenIssues: () => void;
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
      <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <HandledItem
          testId="handled-duplicates"
          value={number(handled.duplicateEvents)}
          label={t('Duplicate events blocked')}
          description={t(
            'The trigger saw the same event again and did not process it a second time.',
          )}
          actionLabel={t('See the blocked events')}
          disabledHint={t('Select one project to open its blocked events')}
          onAction={onOpenDuplicates}
        />
        <HandledItem
          testId="handled-merged"
          value={number(handled.mergedFailures)}
          label={t('Failures merged into problems')}
          description={t(
            '{failures, plural, =1 {1 failed run was} other {# failed runs were}} grouped into {issues, plural, =1 {1 problem} other {# problems}}, so one alert covers each cause.',
            { failures: handled.mergedFailures, issues: handled.mergedIssues },
          )}
          actionLabel={t('See the problems')}
          disabledHint={null}
          onAction={onOpenIssues}
        />
      </CardContent>
    </Card>
  );
}

function HandledItem({
  testId,
  value,
  label,
  description,
  actionLabel,
  disabledHint,
  onAction,
}: {
  testId: string;
  value: string;
  label: string;
  description: string;
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
      <div>
        <Button
          variant="link"
          size="sm"
          className="px-0"
          disabled={onAction === null}
          title={onAction === null ? disabledHint ?? undefined : undefined}
          onClick={() => onAction?.()}
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
