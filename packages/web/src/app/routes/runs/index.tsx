import { isNil } from '@fema-ipaas/core-utils';
import {
  RunLogCondition,
  RunLogConditionField,
  RunLogFilterState,
  runLogFilterUtils,
  RunLogMatch,
  RunLogRow,
  RunLogType,
  WorkflowRetryStrategy,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Archive, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import {
  CURSOR_QUERY_PARAM,
  LIMIT_QUERY_PARAM,
} from '@/components/custom/data-table';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { connectorsHooks } from '@/features/connectors/hooks/connectors-hooks';
import {
  RunLogConditionSummary,
  RunLogDrawer,
  RunLogFilterPanel,
  RunLogRerunDialog,
  RunLogsTable,
  runLogsHooks,
  runLogUiUtils,
} from '@/features/run-logs';
import { DedupedEventsTable } from '@/features/trigger-runtime';
import { cn } from '@/lib/utils';

const RunsPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const presetProjectId = projectId ?? null;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rerunRequest, setRerunRequest] = useState<RerunRequest | null>(null);
  const { state, ignoredParams } = useMemo(
    () =>
      runLogFilterUtils.parseSearchParams({
        params: searchParams,
        presetProjectId,
      }),
    [searchParams, presetProjectId],
  );
  const dedupedView = searchParams.get(VIEW_PARAM) === DEDUPED_VIEW;
  const runId = searchParams.get(RUN_PARAM);
  const limit = Number(searchParams.get(LIMIT_QUERY_PARAM) ?? DEFAULT_LIMIT);
  const query = {
    ...runLogFilterUtils.toListQuery({ state }),
    cursor: searchParams.get(CURSOR_QUERY_PARAM) ?? undefined,
    limit: Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT,
  };
  const { data: scope } = runLogsHooks.useScope();
  const {
    data: page,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = runLogsHooks.useRunLogs({ query });
  const { summaries } = connectorsHooks.useConnectorSummariesByNames({
    names: scope?.connectors ?? [],
  });
  const connectorName = (name: string) =>
    summaries.find((summary) => summary.name === name)?.displayName ?? name;
  const rerun = runLogsHooks.useRerun({
    onDone: (response) => {
      setRerunRequest(null);
      const created = response.results.filter(
        (result) =>
          !isNil(result.rerunExecutionId) &&
          result.rerunExecutionId !== result.executionId,
      );
      if (response.results.length === 1 && created.length === 1) {
        openRun(created[0].rerunExecutionId ?? '');
      }
    },
  });
  const maxRetention = scope ? runLogUiUtils.maxRetentionDays(scope) : null;
  const dedupeProjectId = presetProjectId ?? singleProject(state);

  const applyState = (next: RunLogFilterState) =>
    setSearchParams(
      runLogFilterUtils.writeSearchParams({
        state: next,
        base: searchParams,
        presetProjectId,
      }),
    );
  const openRun = (id: string) => {
    const base = new URLSearchParams(searchParams);
    base.set(RUN_PARAM, id);
    const next = runLogFilterUtils.writeSearchParams({
      state,
      base,
      presetProjectId,
    });
    const cursor = searchParams.get(CURSOR_QUERY_PARAM);
    if (!isNil(cursor)) {
      next.set(CURSOR_QUERY_PARAM, cursor);
    }
    setSearchParams(next);
  };
  const closeRun = () =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(RUN_PARAM);
      return next;
    });
  const selectTab = (value: string) => {
    if (value === DEDUPED_VIEW) {
      if (isNil(presetProjectId) && !isNil(dedupeProjectId)) {
        navigate(
          `/projects/${dedupeProjectId}/runs?${VIEW_PARAM}=${DEDUPED_VIEW}`,
        );
        return;
      }
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set(VIEW_PARAM, DEDUPED_VIEW);
        next.delete(CURSOR_QUERY_PARAM);
        return next;
      });
      return;
    }
    const type = TYPE_TABS.find((candidate) => candidate === value);
    if (isNil(type)) {
      return;
    }
    const base = new URLSearchParams(searchParams);
    base.delete(VIEW_PARAM);
    setSearchParams(
      runLogFilterUtils.writeSearchParams({
        state: { ...state, type },
        base,
        presetProjectId,
      }),
    );
  };
  const removeCondition = (condition: RunLogCondition) =>
    applyState({
      ...state,
      conditions: state.conditions.filter(
        (candidate) => candidate.field !== condition.field,
      ),
    });
  const clearConditions = () =>
    applyState({
      ...state,
      match: RunLogMatch.ALL,
      conditions: [],
      runIds: [],
    });

  return (
    <div className={cn('flex flex-col gap-4', isNil(presetProjectId) && 'p-6')}>
      {isNil(presetProjectId) && (
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('Run logs')}</h1>
          <p className="text-sm text-muted-foreground">
            {t(
              'Run records of every workflow in your projects. Find why a run failed and rerun it.',
            )}
          </p>
        </header>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={dedupedView ? DEDUPED_VIEW : state.type}
          onValueChange={selectTab}
        >
          <TabsList>
            {TYPE_TABS.map((type) => (
              <TabsTrigger key={type} value={type}>
                {runLogUiUtils.typeLabel(type)}
              </TabsTrigger>
            ))}
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <TabsTrigger
                    value={DEDUPED_VIEW}
                    disabled={isNil(dedupeProjectId)}
                  >
                    {t('Deduplicated')}
                  </TabsTrigger>
                </span>
              </TooltipTrigger>
              {isNil(dedupeProjectId) && (
                <TooltipContent className="max-w-64">
                  {t(
                    'Deduplicated triggers are listed per project. Filter by exactly one project to see them.',
                  )}
                </TooltipContent>
              )}
            </Tooltip>
          </TabsList>
        </Tabs>
        {!dedupedView && (
          <>
            <RunLogFilterPanel
              state={state}
              scope={scope}
              connectorName={connectorName}
              onApply={applyState}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={isFetching && !isLoading}
              onClick={() => void refetch()}
            >
              <RefreshCw className="size-4" />
              {t('Refresh')}
            </Button>
          </>
        )}
        {scope && (
          <Tooltip>
            <TooltipTrigger asChild>
              {scope.canManagePrivacy ? (
                <Link
                  to="/tenant/security/privacy"
                  className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  <Archive className="size-3.5" />
                  {runLogUiUtils.retentionText(scope)}
                </Link>
              ) : (
                <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Archive className="size-3.5" />
                  {runLogUiUtils.retentionText(scope)}
                </span>
              )}
            </TooltipTrigger>
            <TooltipContent className="max-w-72">
              {t(
                'Expired logs are cleaned up automatically. Sensitive fields are masked before they are written to the log.',
              )}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {dedupedView ? (
        <DedupedEventsTable />
      ) : (
        <>
          <RunLogConditionSummary
            state={state}
            scope={scope}
            ignoredParams={ignoredParams}
            connectorName={connectorName}
            onRemove={removeCondition}
            onClear={clearConditions}
          />
          <RunLogsTable
            page={page}
            isLoading={isLoading}
            isError={isError}
            onOpenRun={openRun}
            onRerun={setRerunRequest}
          />
        </>
      )}
      <RunLogDrawer
        runId={runId}
        retentionDays={maxRetention}
        onClose={closeRun}
        onOpenRun={openRun}
        onRerun={setRerunRequest}
      />
      <RunLogRerunDialog
        open={rerunRequest !== null}
        rows={rerunRequest?.rows ?? []}
        initialStrategy={
          rerunRequest?.strategy ?? WorkflowRetryStrategy.FROM_FAILED_STEP
        }
        pending={rerun.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setRerunRequest(null);
          }
        }}
        onConfirm={(request) => rerun.mutate(request)}
      />
    </div>
  );
};

function singleProject(state: RunLogFilterState): string | null {
  const project = state.conditions.find(
    (condition) => condition.field === RunLogConditionField.PROJECT,
  );
  if (
    isNil(project) ||
    project.field !== RunLogConditionField.PROJECT ||
    project.values.length !== 1
  ) {
    return null;
  }
  return project.values[0];
}

const VIEW_PARAM = 'view';
const DEDUPED_VIEW = 'deduped';
const RUN_PARAM = 'run';
const DEFAULT_LIMIT = 10;
const TYPE_TABS: RunLogType[] = [
  RunLogType.RUN,
  RunLogType.DEBUG,
  RunLogType.ALL,
];

type RerunRequest = {
  rows: RunLogRow[];
  strategy: WorkflowRetryStrategy;
};

export { RunsPage };
