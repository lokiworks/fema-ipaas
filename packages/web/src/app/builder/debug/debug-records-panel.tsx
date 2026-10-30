import { isNil } from '@fema-ipaas/core-utils';
import {
  Permission,
  RunEnvironment,
  StepOutput,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ArrowLeft, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { StepErrorDetails } from '@/app/builder/data-display/step-error-details';
import { RunsList } from '@/app/builder/run-list';
import { SidebarHeader } from '@/app/builder/sidebar-header';
import { LeftSideBarType } from '@/app/builder/types';
import { useEscapeToClose } from '@/app/builder/use-escape-to-close';
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
    selectedStep,
  ] = useBuilderStateContext((state) => [
    state.run,
    state.workflowVersion.trigger,
    state.loopsIndexes,
    state.setLeftSidebar,
    state.selectStepByName,
    state.updateSampleData,
    state.clearRun,
    state.readonly,
    state.selectedStep,
  ]);
  const { checkAccess } = useAuthorization();
  const displayNumbers = useStepDisplayNumbers();
  useEscapeToClose({ onClose: () => setLeftSidebar(LeftSideBarType.NONE) });
  const [status, setStatus] = useState<DebugNodeStatus | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [tabChoice, setTabChoice] = useState<TabChoice | null>(null);

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
  const selectedName = debugRecordsUtils.selectedRowName({
    rows,
    selectedStep,
  });
  const selectedOutput = isNil(selectedName)
    ? undefined
    : outputs[selectedName];
  const errorText = errorOf(selectedOutput);
  const selectedStepModel = isNil(selectedName)
    ? null
    : workflowStructureUtil.getStep(selectedName, trigger) ?? null;
  const activeTab: RecordTab =
    tabChoice?.stepName === selectedName ? tabChoice.tab : RecordTab.OUTPUT;
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
            : isNil(run.stepNameToTest)
            ? t('Full debug')
            : t('Step test · {step}', {
                step:
                  workflowStructureUtil.getStep(run.stepNameToTest, trigger)
                    ?.displayName ?? run.stepNameToTest,
              })}
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
                onSelect={() => selectStepByName(row.stepName)}
              />
            ))}
          </div>
        </ScrollArea>
        {!isNil(selectedName) && (
          <Tabs
            value={activeTab}
            onValueChange={(value) =>
              setTabChoice({ stepName: selectedName, tab: toTab(value) })
            }
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex items-center justify-between gap-2 px-3 pt-2">
              <TabsList>
                <TabsTrigger value={RecordTab.INPUT}>{t('Input')}</TabsTrigger>
                <TabsTrigger value={RecordTab.OUTPUT}>
                  {t('Output')}
                </TabsTrigger>
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
                  {isNil(errorText) ? (
                    <JsonBlock value={selectedOutput?.output} />
                  ) : (
                    <StepErrorDetails
                      errorText={errorText}
                      step={selectedStepModel}
                    />
                  )}
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
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {t('Step {position}', { position: row.ordinal })}
      </span>
      {row.status === DebugNodeStatus.RUNNING && (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {t('Executing')}...
        </span>
      )}
      {row.status !== DebugNodeStatus.RUNNING && !isNil(row.durationMs) && (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {formatUtils.formatDuration(row.durationMs)}
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

type TabChoice = { stepName: string; tab: RecordTab };

enum RecordTab {
  INPUT = 'input',
  OUTPUT = 'output',
}

const STATUS_FILTERS: {
  value: DebugNodeStatus | 'ALL';
  label: () => string;
}[] = [
  { value: 'ALL', label: () => t('All statuses') },
  { value: DebugNodeStatus.SUCCEEDED, label: () => t('Succeeded') },
  { value: DebugNodeStatus.FAILED, label: () => t('Failed') },
  { value: DebugNodeStatus.RUNNING, label: () => t('Executing') },
  { value: DebugNodeStatus.NOT_RUN, label: () => t('Not run') },
];

const STATUS_DOT: Record<DebugNodeStatus, string> = {
  [DebugNodeStatus.SUCCEEDED]: 'bg-success',
  [DebugNodeStatus.FAILED]: 'bg-destructive',
  [DebugNodeStatus.RUNNING]: 'bg-primary animate-pulse',
  [DebugNodeStatus.NOT_RUN]: 'bg-muted-foreground/30',
  [DebugNodeStatus.OTHER]: 'bg-warning',
};
