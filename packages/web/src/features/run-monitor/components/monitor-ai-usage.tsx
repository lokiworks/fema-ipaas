import { RunMonitorAiSource, RunMonitorAiUsage } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  ArrowLeftRight,
  Bug,
  MessageSquareText,
  RotateCcw,
  Sparkles,
  WandSparkles,
  Workflow,
} from 'lucide-react';
import React, { useState } from 'react';

import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import { ModelPrices, runMonitorUtils } from '../utils/run-monitor-utils';

import { MonitorStatCard } from './monitor-stat-card';

export function MonitorAiUsage({
  usage,
  rangeLabel,
  onWorkflowClick,
}: {
  usage: RunMonitorAiUsage | undefined;
  rangeLabel: string;
  onWorkflowClick: (params: { workflowId: string; projectId: string }) => void;
}) {
  const [prices, setPrices] = useState<ModelPrices>(() =>
    runMonitorUtils.readPrices(),
  );
  const updatePrices = (next: ModelPrices) => {
    setPrices(next);
    runMonitorUtils.writePrices(next);
  };
  const setPrice = ({
    model,
    field,
    value,
  }: {
    model: string;
    field: 'input' | 'output';
    value: string;
  }) =>
    updatePrices({
      ...prices,
      [model]: {
        ...(prices[model] ?? { input: '', output: '' }),
        [field]: runMonitorUtils.sanitizePrice(value),
      },
    });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-medium">{t('AI usage')}</h2>
          <span className="text-xs text-muted-foreground">
            {rangeLabel} ·{' '}
            {t(
              'Tokens used by AI steps in workflow runs, the editor AI assistant, AI auto-mapping and AI workflow generation',
            )}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-full', INPUT_CLASS)} />
            {t('Input tokens')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-full', OUTPUT_CLASS)} />
            {t('Output tokens')}
          </span>
        </div>
      </div>
      {!usage ? (
        <Skeleton className="h-40 w-full" />
      ) : usage.totals.calls === 0 ? (
        <Card className="flex flex-col gap-1 p-6">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-muted-foreground" />
            {t('No AI calls in the selected range')}
          </span>
          <span className="text-sm text-muted-foreground">
            {t(
              'Workflow runs that use AI steps, and the AI features in the editor, are counted here.',
            )}
          </span>
        </Card>
      ) : (
        <AiUsageBody
          usage={usage}
          prices={prices}
          onPriceChange={setPrice}
          onResetPrices={() => updatePrices({})}
          onWorkflowClick={onWorkflowClick}
        />
      )}
    </section>
  );
}

function AiUsageBody({
  usage,
  prices,
  onPriceChange,
  onResetPrices,
  onWorkflowClick,
}: {
  usage: RunMonitorAiUsage;
  prices: ModelPrices;
  onPriceChange: (params: {
    model: string;
    field: 'input' | 'output';
    value: string;
  }) => void;
  onResetPrices: () => void;
  onWorkflowClick: (params: { workflowId: string; projectId: string }) => void;
}) {
  const number = formatUtils.formatNumber;
  const total = usage.totals.inputTokens + usage.totals.outputTokens;
  const models = usage.byModel.map((model) => ({
    ...model,
    cost: runMonitorUtils.estimateCost({
      price: prices[model.model],
      inputTokens: model.inputTokens,
      outputTokens: model.outputTokens,
    }),
  }));
  const cost = runMonitorUtils.totalCost(models.map((model) => model.cost));
  const edited = Object.keys(prices).length > 0;
  const maxModel = Math.max(
    0,
    ...models.map((model) => model.inputTokens + model.outputTokens),
  );
  const maxSource = Math.max(
    0,
    ...usage.bySource.map((item) => item.inputTokens + item.outputTokens),
  );
  const maxWorkflow = Math.max(
    0,
    ...usage.byWorkflow.map((item) => item.inputTokens + item.outputTokens),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MonitorStatCard
          label={t('Total tokens')}
          value={number(total)}
          delta={t('Input {input} · Output {output}', {
            input: number(usage.totals.inputTokens),
            output: number(usage.totals.outputTokens),
          })}
          help={t(
            'Input tokens are the prompt and context sent to the model; output tokens are what the model generated',
          )}
        />
        <MonitorStatCard
          label={t('Runs that used AI')}
          value={runMonitorUtils.formatPercent(
            runMonitorUtils.ratio({
              part: usage.runsWithAi,
              total: usage.runs,
            }),
          )}
          delta={t('{part} / {total} runs', {
            part: number(usage.runsWithAi),
            total: number(usage.runs),
          })}
          help={t(
            'Share of runs in the selected range that actually called a model, matched by the run recorded with each model call. Debug runs are not counted.',
          )}
        />
        <MonitorStatCard
          label={t('Average per call')}
          value={number(Math.round(total / usage.totals.calls))}
          suffix={t('tokens')}
          delta={t('{calls} model calls in total', {
            calls: number(usage.totals.calls),
          })}
        />
        <MonitorStatCard
          label={t('Estimated cost')}
          value={runMonitorUtils.formatCost(cost)}
          suffix={cost === null ? undefined : t('yuan')}
          delta={
            cost === null
              ? t('Enter unit prices below to estimate. Not a bill.')
              : t('Estimated from the unit prices you entered. Not a bill.')
          }
          help={t(
            'A rough conversion using the unit prices in the table below. Prices are kept only in this browser; the model provider bill is what you actually pay.',
          )}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[3fr_2fr]">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base font-medium">
                {t('By model')}
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {t(
                  'Unit price: yuan per million tokens, saved only in this browser and used only for estimates',
                )}
              </span>
            </div>
            {edited && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onResetPrices}
              >
                <RotateCcw className="size-4" />
                {t('Clear prices')}
              </Button>
            )}
          </CardHeader>
          <CardContent className="pt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Model')}</TableHead>
                  <TableHead className="w-16 text-right">
                    {t('Calls')}
                  </TableHead>
                  <TableHead className="w-40">{t('Tokens')}</TableHead>
                  <TableHead className="w-24">{t('Input price')}</TableHead>
                  <TableHead className="w-24">{t('Output price')}</TableHead>
                  <TableHead className="w-24 text-right">
                    {t('Estimate')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((model) => (
                  <TableRow key={`${model.provider}-${model.model}`}>
                    <TableCell className="max-w-0">
                      <TextWithTooltip tooltipMessage={model.model}>
                        <p className="truncate font-mono text-xs">
                          {model.model}
                        </p>
                      </TextWithTooltip>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {number(model.calls)}
                    </TableCell>
                    <TableCell>
                      <TokenCell
                        input={model.inputTokens}
                        output={model.outputTokens}
                        max={maxModel}
                      />
                    </TableCell>
                    <TableCell>
                      <PriceInput
                        value={prices[model.model]?.input ?? ''}
                        label={t('Input price')}
                        onChange={(value) =>
                          onPriceChange({
                            model: model.model,
                            field: 'input',
                            value,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <PriceInput
                        value={prices[model.model]?.output ?? ''}
                        label={t('Output price')}
                        onChange={(value) =>
                          onPriceChange({
                            model: model.model,
                            field: 'output',
                            value,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {runMonitorUtils.formatCost(model.cost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">
              {t('By source')}
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {t('{calls} model calls in total', {
                calls: number(usage.totals.calls),
              })}
            </span>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-2">
            {usage.bySource.map((item) => (
              <div key={item.source} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-sm">
                  {SOURCE_ICONS[item.source]}
                  <span className="grow">{sourceLabel(item.source)}</span>
                  <span className="text-xs text-muted-foreground">
                    {t('{calls} calls', { calls: number(item.calls) })}
                  </span>
                  <span className="w-16 text-right tabular-nums">
                    {formatUtils.formatNumberCompact(
                      item.inputTokens + item.outputTokens,
                    )}
                  </span>
                </div>
                {item.calls > 0 ? (
                  <TokenBar
                    input={item.inputTokens}
                    output={item.outputTokens}
                    max={maxSource}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t('No calls in the selected range')}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card className="min-w-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">
            {t('By workflow')}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {t(
              'Click a row to see the run logs of this workflow in the selected range',
            )}
          </span>
        </CardHeader>
        <CardContent className="pt-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Workflow')}</TableHead>
                <TableHead className="w-32">{t('Project')}</TableHead>
                <TableHead className="w-40">{t('Model')}</TableHead>
                <TableHead className="w-16 text-right">
                  <HeaderHelp
                    label={t('Run count')}
                    help={t('Workflow runs that called a model')}
                  />
                </TableHead>
                <TableHead className="w-16 text-right">
                  <HeaderHelp
                    label={t('Calls')}
                    help={t(
                      'Includes calls inside runs, plus the AI assistant and auto-mapping while editing this workflow',
                    )}
                  />
                </TableHead>
                <TableHead className="w-48">{t('Tokens')}</TableHead>
                <TableHead className="w-24 text-right">
                  {t('Average per call')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.byWorkflow.map((item) => (
                <TableRow
                  key={item.workflowId}
                  className="cursor-pointer"
                  onClick={() =>
                    onWorkflowClick({
                      workflowId: item.workflowId,
                      projectId: item.projectId,
                    })
                  }
                >
                  <TableCell className="max-w-0">
                    <TextWithTooltip tooltipMessage={item.workflowDisplayName}>
                      <p className="truncate font-medium">
                        {item.workflowDisplayName}
                      </p>
                    </TextWithTooltip>
                  </TableCell>
                  <TableCell className="max-w-0">
                    <TextWithTooltip tooltipMessage={item.projectDisplayName}>
                      <p className="truncate text-muted-foreground">
                        {item.projectDisplayName}
                      </p>
                    </TextWithTooltip>
                  </TableCell>
                  <TableCell className="max-w-0">
                    <TextWithTooltip tooltipMessage={item.models.join(', ')}>
                      <p className="truncate font-mono text-xs">
                        {item.models.join(', ')}
                      </p>
                    </TextWithTooltip>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {number(item.runs)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {number(item.calls)}
                  </TableCell>
                  <TableCell>
                    <TokenCell
                      input={item.inputTokens}
                      output={item.outputTokens}
                      max={maxWorkflow}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {number(
                      Math.round(
                        (item.inputTokens + item.outputTokens) /
                          Math.max(1, item.calls),
                      ),
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {usage.byWorkflow.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-muted-foreground">
                    {t('No workflow called AI in the selected range')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function TokenCell({
  input,
  output,
  max,
}: {
  input: number;
  output: number;
  max: number;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="grow">
        <TokenBar input={input} output={output} max={max} />
      </span>
      <span className="w-12 text-right text-xs tabular-nums">
        {formatUtils.formatNumberCompact(input + output)}
      </span>
    </span>
  );
}

function TokenBar({
  input,
  output,
  max,
}: {
  input: number;
  output: number;
  max: number;
}) {
  const total = input + output;
  const width = max > 0 ? Math.max(total > 0 ? 2 : 0, (total / max) * 100) : 0;
  const inputShare = total > 0 ? (input / total) * 100 : 0;
  const description = t('Input {input} · Output {output}', {
    input: formatUtils.formatNumber(input),
    output: formatUtils.formatNumber(output),
  });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          tabIndex={0}
          aria-label={description}
        >
          <div className="flex h-full" style={{ width: `${width}%` }}>
            <span
              className={cn('block h-full', INPUT_CLASS)}
              style={{ width: `${inputShare}%` }}
            />
            <span
              className={cn('block h-full', OUTPUT_CLASS)}
              style={{ width: `${100 - inputShare}%` }}
            />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>{description}</TooltipContent>
    </Tooltip>
  );
}

function PriceInput({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const invalid =
    value.length > 0 && runMonitorUtils.parsePrice(value) === null;
  return (
    <Input
      value={value}
      inputMode="decimal"
      aria-label={label}
      aria-invalid={invalid}
      placeholder="-"
      className={cn('h-7 font-mono text-xs', invalid && 'border-destructive')}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function HeaderHelp({ label, help }: { label: string; help: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted underline-offset-4">
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{help}</TooltipContent>
    </Tooltip>
  );
}

function sourceLabel(source: RunMonitorAiSource): string {
  switch (source) {
    case RunMonitorAiSource.WORKFLOW_RUN:
      return t('Workflow runs');
    case RunMonitorAiSource.DEBUG_RUN:
      return t('Debug runs');
    case RunMonitorAiSource.EDITOR_ASSISTANT:
      return t('Editor AI assistant');
    case RunMonitorAiSource.AUTO_MAPPING:
      return t('AI auto-mapping');
    case RunMonitorAiSource.GENERATE_WORKFLOW:
      return t('AI workflow generation');
  }
}

const INPUT_CLASS = 'bg-primary';
const OUTPUT_CLASS = 'bg-primary/40';

const SOURCE_ICONS: Record<RunMonitorAiSource, React.ReactNode> = {
  [RunMonitorAiSource.WORKFLOW_RUN]: (
    <Workflow className="size-4 text-muted-foreground" />
  ),
  [RunMonitorAiSource.DEBUG_RUN]: (
    <Bug className="size-4 text-muted-foreground" />
  ),
  [RunMonitorAiSource.EDITOR_ASSISTANT]: (
    <MessageSquareText className="size-4 text-muted-foreground" />
  ),
  [RunMonitorAiSource.AUTO_MAPPING]: (
    <ArrowLeftRight className="size-4 text-muted-foreground" />
  ),
  [RunMonitorAiSource.GENERATE_WORKFLOW]: (
    <WandSparkles className="size-4 text-muted-foreground" />
  ),
};
