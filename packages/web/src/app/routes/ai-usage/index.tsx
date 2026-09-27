import { AiUsageSummary } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Calendar, ChartColumn } from 'lucide-react';
import { ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { aiHooks, aiUtils } from '@/features/ai';
import { authenticationSession } from '@/lib/authentication-session';
import { formatUtils } from '@/lib/format-utils';
import { cn, DASHBOARD_CONTENT_PADDING_X } from '@/lib/utils';

function AiUsagePage() {
  const projectId = authenticationSession.getProjectId() ?? '';
  const { i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const monthOptions = useMemo(
    () =>
      aiUtils.monthOptions({
        now: new Date(),
        count: MONTHS_TO_SHOW,
        locale: i18n.language,
      }),
    [i18n.language],
  );
  const selectedMonth = searchParams.get('month') ?? monthOptions[0].value;
  const range = aiUtils.monthRange(selectedMonth);
  const { data: usage, isLoading } = aiHooks.useUsage({
    projectId,
    ...range,
  });

  const selectMonth = (month: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('month', month);
    setSearchParams(params, { replace: true });
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-4 w-full max-w-5xl py-4',
        DASHBOARD_CONTENT_PADDING_X,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-base font-semibold">{t('AI usage')}</h1>
          <p className="text-sm text-muted-foreground">
            {t(
              'Model calls and tokens used by this project. Token counts come from the model provider, so check its bill for prices.',
            )}
          </p>
        </div>
        <Select value={selectedMonth} onValueChange={selectMonth}>
          <SelectTrigger className="w-auto gap-2 h-8">
            <Calendar className="size-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent side="bottom" align="end">
            {monthOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isLoading && <Skeleton className="h-64 w-full" />}
      {usage && usage.totals.calls === 0 && <EmptyUsage />}
      {usage && usage.totals.calls > 0 && <UsageDetails usage={usage} />}
    </div>
  );
}

function EmptyUsage() {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-2 py-6">
        <ChartColumn className="size-8 text-muted-foreground" />
        <span className="text-sm font-medium">
          {t('No AI usage this month')}
        </span>
        <span className="text-sm text-muted-foreground">
          {t(
            'Usage shows up here when someone creates a workflow with AI, uses the editor assistant, or a workflow runs an AI step.',
          )}
        </span>
      </CardContent>
    </Card>
  );
}

function UsageDetails({ usage }: { usage: AiUsageSummary }) {
  const maxDailyTokens = Math.max(
    0,
    ...usage.daily.map((day) => aiUtils.totalTokens(day)),
  );
  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        <TotalCard title={t('Calls')} value={usage.totals.calls} />
        <TotalCard title={t('Input tokens')} value={usage.totals.inputTokens} />
        <TotalCard
          title={t('Output tokens')}
          value={usage.totals.outputTokens}
        />
      </div>
      <UsageTable
        title={t('By model')}
        firstColumn={t('Model')}
        rows={aiUtils.sortByTokens(usage.byModel).map((row) => ({
          key: `${row.provider}-${row.model}`,
          label: (
            <div className="flex flex-col">
              <span>{row.model}</span>
              <span className="text-xs text-muted-foreground">
                {aiUtils.providerLabel(row.provider)}
              </span>
            </div>
          ),
          counts: row,
        }))}
      />
      <UsageTable
        title={t('By feature')}
        firstColumn={t('Feature')}
        rows={aiUtils.sortByTokens(usage.byFeature).map((row) => ({
          key: row.feature,
          label: aiUtils.featureLabel(row.feature),
          counts: row,
        }))}
      />
      {usage.byWorkflow.length > 0 && (
        <UsageTable
          title={t('By workflow')}
          firstColumn={t('Workflow')}
          rows={aiUtils.sortByTokens(usage.byWorkflow).map((row) => ({
            key: row.workflowId,
            label: (
              <Link
                className="text-primary hover:underline"
                to={authenticationSession.appendProjectRoutePrefix(
                  `/workflows/${row.workflowId}`,
                )}
              >
                {row.displayName}
              </Link>
            ),
            counts: row,
          }))}
        />
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('By day')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Date')}</TableHead>
                <TableHead className="text-right">{t('Calls')}</TableHead>
                <TableHead className="text-right">{t('Tokens')}</TableHead>
                <TableHead className="w-1/3" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.daily.map((day) => (
                <TableRow key={day.date}>
                  <TableCell>{day.date}</TableCell>
                  <TableCell className="text-right">
                    {formatUtils.formatNumber(day.calls)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatUtils.formatNumber(aiUtils.totalTokens(day))}
                  </TableCell>
                  <TableCell>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{
                          width: `${aiUtils.share({
                            value: aiUtils.totalTokens(day),
                            max: maxDailyTokens,
                          })}%`,
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function TotalCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-sm text-muted-foreground">{title}</span>
      <span className="text-2xl font-semibold">
        {formatUtils.formatNumber(value)}
      </span>
    </div>
  );
}

function UsageTable({
  title,
  firstColumn,
  rows,
}: {
  title: string;
  firstColumn: string;
  rows: UsageRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{firstColumn}</TableHead>
              <TableHead className="text-right">{t('Calls')}</TableHead>
              <TableHead className="text-right">{t('Input tokens')}</TableHead>
              <TableHead className="text-right">{t('Output tokens')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell>{row.label}</TableCell>
                <TableCell className="text-right">
                  {formatUtils.formatNumber(row.counts.calls)}
                </TableCell>
                <TableCell className="text-right">
                  {formatUtils.formatNumber(row.counts.inputTokens)}
                </TableCell>
                <TableCell className="text-right">
                  {formatUtils.formatNumber(row.counts.outputTokens)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

const MONTHS_TO_SHOW = 6;

type UsageRow = {
  key: string;
  label: ReactNode;
  counts: { calls: number; inputTokens: number; outputTokens: number };
};

export { AiUsagePage };
