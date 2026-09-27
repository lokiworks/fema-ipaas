import { isNil, tryParseFriendlyConnectorError } from '@fema-ipaas/core-utils';
import {
  Permission,
  RunEnvironment,
  StepOutput,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ArrowLeft, Lightbulb, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { FriendlyErrorView } from '@/app/builder/data-display/friendly-error-view';
import { RunsList } from '@/app/builder/run-list';
import { SidebarHeader } from '@/app/builder/sidebar-header';
import { LeftSideBarType } from '@/app/builder/types';
import { useStepDisplayNumbers } from '@/app/builder/use-step-display-numbers';
import { CollapsibleJson } from '@/components/custom/collapsible-json';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { executionUtils } from '@/features/executions';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import {
  DebugHint,
  DebugNodeRow,
  DebugNodeStatus,
  debugRecordsUtils,
} from './debug-records-utils';

export function DebugRecordsPanel() {
  const run = useBuilderStateContext((state) => state.run);
  if (isNil(run)) {
    return <RunsList />;
  }
  return <RunRecord key={run.id} />;
}

function RunRecord() {
  const [
    run,
    trigger,
    loopsIndexes,
    setLeftSidebar,
    selectStepByName,
    updateSampleData,
    clearRun,
    readonly,
  ] = useBuilderStateContext((state) => [
    state.run,
    state.workflowVersion.trigger,
    state.loopsIndexes,
    state.setLeftSidebar,
    state.selectStepByName,
    state.updateSampleData,
    state.clearRun,
    state.readonly,
  ]);
  const { checkAccess } = useAuthorization();
  const displayNumbers = useStepDisplayNumbers();
  const [status, setStatus] = useState<DebugNodeStatus | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [tab, setTab] = useState<RecordTab | null>(null);

  const outputs = useMemo(() => {
    const steps = run?.steps ?? {};
    return Object.fromEntries(
      workflowStructureUtil
        .getAllSteps(trigger)
        .map((step) => [
          step.name,
          executionUtils.extractStepOutput(step.name, loopsIndexes, steps),
        ]),
    );
  }, [run, trigger, loopsIndexes]);
  const rows = useMemo(
    () => debugRecordsUtils.listNodes({ trigger, outputs, displayNumbers }),
    [trigger, outputs, displayNumbers],
  );
  const failed = debugRecordsUtils.firstFailed(rows);
  const selectedName = picked ?? failed?.stepName ?? rows[0]?.stepName ?? null;
  const selectedOutput = isNil(selectedName)
    ? undefined
    : outputs[selectedName];
  const errorText = errorOf(selectedOutput);
  const activeTab: RecordTab =
    tab ?? (isNil(errorText) ? RecordTab.OUTPUT : RecordTab.ERROR);
  const visibleRows = debugRecordsUtils.filterNodes({ rows, status, query });

  if (isNil(run)) {
    return null;
  }
  const statusLabel = executionUtils.getStatusLabel(run.status);

  return (
    <div className="flex h-full w-full flex-col">
      <SidebarHeader onClose={() => setLeftSidebar(LeftSideBarType.NONE)}>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2"
          onClick={() => clearRun(checkAccess(Permission.WRITE_WORKFLOW))}
        >
          <ArrowLeft className="size-3.5" />
          {t('All runs')}
        </Button>
        <span className="truncate font-semibold">{t('Debug records')}</span>
      </SidebarHeader>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{statusLabel}</span>
        {run.startTime && (
          <span>{formatUtils.formatDate(new Date(run.startTime))}</span>
        )}
        {run.startTime && run.finishTime && (
          <span>
            {formatUtils.formatDuration(
              new Date(run.finishTime).getTime() -
                new Date(run.startTime).getTime(),
              true,
            )}
          </span>
        )}
        <span>
          {run.environment === RunEnvironment.PRODUCTION
            ? t('Production')
            : t('Test')}
        </span>
      </div>
      <div className="flex items-center gap-2 px-3 pb-2">
        <Select
          value={status}
          onValueChange={(value) => setStatus(toStatusFilter(value))}
        >
          <SelectTrigger className="h-8 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>
                {filter.label()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative grow">
          <Search className="absolute left-2 top-2 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('Search steps, separate keywords with spaces')}
            className="h-8 pl-8"
          />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col border-t">
        <ScrollArea className="max-h-[40%] shrink-0 border-b">
          <div className="flex flex-col p-1">
            {visibleRows.length === 0 && (
              <span className="px-3 py-4 text-xs text-muted-foreground">
                {t('No steps match these filters')}
              </span>
            )}
            {visibleRows.map((row) => (
              <NodeRow
                key={row.stepName}
                row={row}
                selected={row.stepName === selectedName}
                onSelect={() => {
                  setPicked(row.stepName);
                  setTab(null);
                  selectStepByName(row.stepName);
                }}
              />
            ))}
          </div>
        </ScrollArea>
        {!isNil(selectedName) && (
          <Tabs
            value={activeTab}
            onValueChange={(value) => setTab(toTab(value))}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex items-center justify-between gap-2 px-3 pt-2">
              <TabsList>
                <TabsTrigger value={RecordTab.INPUT}>{t('Input')}</TabsTrigger>
                <TabsTrigger value={RecordTab.OUTPUT}>
                  {t('Output')}
                </TabsTrigger>
                <TabsTrigger value={RecordTab.ERROR}>{t('Error')}</TabsTrigger>
              </TabsList>
              {activeTab === RecordTab.OUTPUT &&
                !readonly &&
                !isNil(selectedOutput?.output) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() =>
                      updateSampleData({
                        stepName: selectedName,
                        input: selectedOutput?.input,
                        output: selectedOutput?.output,
                      })
                    }
                  >
                    {t('Use as output')}
                  </Button>
                )}
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="p-3">
                <TabsContent value={RecordTab.INPUT} className="mt-0">
                  <JsonBlock value={selectedOutput?.input} />
                </TabsContent>
                <TabsContent value={RecordTab.OUTPUT} className="mt-0">
                  <JsonBlock value={selectedOutput?.output} />
                </TabsContent>
                <TabsContent value={RecordTab.ERROR} className="mt-0">
                  <ErrorBlock errorText={errorText} />
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        )}
      </div>
    </div>
  );
}

function NodeRow({
  row,
  selected,
  onSelect,
}: {
  row: DebugNodeRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
        selected && 'bg-muted',
      )}
    >
      <span
        className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[row.status])}
      />
      <span className="min-w-0 grow truncate">{row.displayName}</span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
        {row.displayNumber}
      </span>
      {!isNil(row.durationMs) && (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {formatUtils.formatDuration(row.durationMs, true)}
        </span>
      )}
    </button>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  if (isNil(value)) {
    return (
      <span className="text-xs text-muted-foreground">
        {t('Nothing was recorded for this step')}
      </span>
    );
  }
  return <CollapsibleJson json={value} label={t('Data')} defaultOpen={true} />;
}

function ErrorBlock({ errorText }: { errorText: string | null }) {
  if (isNil(errorText)) {
    return (
      <span className="text-xs text-muted-foreground">
        {t('This step did not fail')}
      </span>
    );
  }
  const friendly = tryParseFriendlyConnectorError(errorText);
  const hints = debugRecordsUtils.troubleshootingHints(errorText);
  return (
    <div className="flex flex-col gap-3">
      {friendly ? (
        <FriendlyErrorView error={friendly} />
      ) : (
        <pre className="whitespace-pre-wrap break-all rounded-md bg-destructive/5 p-3 text-xs text-destructive">
          {errorText}
        </pre>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Lightbulb className="size-3.5 text-warning" />
          {t('Where to look')}
        </span>
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {hints.map((hint) => (
            <li key={hint}>{HINT_TEXT[hint]()}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function errorOf(output: StepOutput | undefined): string | null {
  return output?.errorMessage ?? null;
}

function toStatusFilter(value: string): DebugNodeStatus | 'ALL' {
  return (
    Object.values(DebugNodeStatus).find((status) => status === value) ?? 'ALL'
  );
}

function toTab(value: string): RecordTab {
  return (
    Object.values(RecordTab).find((candidate) => candidate === value) ??
    RecordTab.OUTPUT
  );
}

enum RecordTab {
  INPUT = 'input',
  OUTPUT = 'output',
  ERROR = 'error',
}

const STATUS_FILTERS: {
  value: DebugNodeStatus | 'ALL';
  label: () => string;
}[] = [
  { value: 'ALL', label: () => t('All statuses') },
  { value: DebugNodeStatus.SUCCEEDED, label: () => t('Succeeded') },
  { value: DebugNodeStatus.FAILED, label: () => t('Failed') },
  { value: DebugNodeStatus.RUNNING, label: () => t('Running') },
  { value: DebugNodeStatus.NOT_RUN, label: () => t('Not run') },
];

const STATUS_DOT: Record<DebugNodeStatus, string> = {
  [DebugNodeStatus.SUCCEEDED]: 'bg-success',
  [DebugNodeStatus.FAILED]: 'bg-destructive',
  [DebugNodeStatus.RUNNING]: 'bg-primary animate-pulse',
  [DebugNodeStatus.NOT_RUN]: 'bg-muted-foreground/30',
  [DebugNodeStatus.OTHER]: 'bg-warning',
};

const HINT_TEXT: Record<DebugHint, () => string> = {
  [DebugHint.CHECK_CONNECTION]: () =>
    t(
      'The connection was rejected. Reconnect it or check that the credentials are still valid.',
    ),
  [DebugHint.CHECK_PERMISSION]: () =>
    t(
      'The account behind the connection lacks permission. Grant the scope or use another connection.',
    ),
  [DebugHint.CHECK_RESOURCE]: () =>
    t(
      'The target record or URL was not found. Check ids and paths in the inputs.',
    ),
  [DebugHint.RATE_LIMITED]: () =>
    t(
      'The service is rate limiting. Retry later or add a delay or retry strategy.',
    ),
  [DebugHint.TIMEOUT]: () =>
    t('The call timed out. Check the service status or raise the timeout.'),
  [DebugHint.CHECK_NETWORK]: () =>
    t(
      'The address could not be reached. Check the URL and that the worker can reach it.',
    ),
  [DebugHint.CHECK_INPUT]: () =>
    t(
      'The service rejected the inputs. Compare the input with what the service expects.',
    ),
  [DebugHint.CHECK_REFERENCE]: () =>
    t(
      'A referenced value was empty. Check the upstream output and the reference path.',
    ),
  [DebugHint.READ_MESSAGE]: () =>
    t('Read the error message above, fix the step and debug again.'),
};
