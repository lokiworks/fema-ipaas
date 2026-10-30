import { isNil } from '@fema-ipaas/core-utils';
import {
  RunLogCondition,
  RunLogConditionField,
  RunLogFilterState,
  runLogFilterUtils,
  RunLogMatch,
  RunLogRow,
  RunLogScopeProject,
  RunLogType,
  WorkflowRetryStrategy,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Archive, ChevronDown, CopyMinus, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import { ConsolePage } from '@/components/custom/console-page';
import {
  CURSOR_QUERY_PARAM,
  LIMIT_QUERY_PARAM,
} from '@/components/custom/data-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  const selectionScope = JSON.stringify(query);
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
  const dedupeCandidates = dedupeProjectCandidates({
    state,
    projects: scope?.projects ?? [],
  });
  const dedupeProjectId =
    presetProjectId ??
    singleProject(state) ??
    (dedupeCandidates.length === 1 ? dedupeCandidates[0].id : null);

  const applyState = (next: RunLogFilterState) => {
    if (!isNil(presetProjectId) && !hasProjectCondition(next)) {
      navigate(globalLogsPath({ state: next, base: searchParams }));
      return;
    }
    setSearchParams(
      runLogFilterUtils.writeSearchParams({
        state: next,
        base: searchParams,
        presetProjectId,
      }),
    );
  };
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
      conditions: isNil(presetProjectId)
        ? []
        : state.conditions.filter(
            (condition) => condition.field === RunLogConditionField.PROJECT,
          ),
      runIds: [],
    });

  if (
    !isNil(presetProjectId) &&
    searchParams.get(ALL_PROJECTS_PARAM) === 'true'
  ) {
    return (
      <Navigate replace to={globalLogsPath({ state, base: searchParams })} />
    );
  }

  return (
    <ConsolePage
      title={t('Run logs')}
      description={t(
        'Run records of every workflow in your projects. Find why a run failed and rerun it.',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={dedupedView ? '' : state.type} onValueChange={selectTab}>
          <TabsList>
            {TYPE_TABS.map((type) => (
              <TabsTrigger key={type} value={type}>
                {runLogUiUtils.typeLabel(type)}
              </TabsTrigger>
            ))}
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
        <div className="ml-auto flex items-center gap-3">
          {isNil(dedupeProjectId) && dedupeCandidates.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <CopyMinus className="size-4" />
                  {t('Deduplicated triggers')}
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-w-72">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  {t('Deduplicated triggers are listed per project. Pick one:')}
                </DropdownMenuLabel>
                {dedupeCandidates.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onSelect={() =>
                      navigate(
                        `/projects/${project.id}/runs?${VIEW_PARAM}=${DEDUPED_VIEW}`,
                      )
                    }
                  >
                    <span className="truncate">{project.displayName}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    variant={dedupedView ? 'secondary' : 'outline'}
                    size="sm"
                    aria-pressed={dedupedView}
                    disabled={isNil(dedupeProjectId)}
                    onClick={() =>
                      selectTab(dedupedView ? state.type : DEDUPED_VIEW)
                    }
                  >
                    <CopyMinus className="size-4" />
                    {t('Deduplicated triggers')}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                {t(
                  'Triggers that were dropped as duplicates and never ran. Switch back to see run logs.',
                )}
              </TooltipContent>
            </Tooltip>
          )}
          {scope && (
            <Tooltip>
              <TooltipTrigger asChild>
                {scope.canManagePrivacy ? (
                  <Link
                    to="/tenant/security/privacy"
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    <Archive className="size-3.5" />
                    {runLogUiUtils.retentionText(scope)}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Archive className="size-3.5" />
                    {runLogUiUtils.retentionText(scope)}
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent className="max-w-72">
                {t('runRetentionTooltip')}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
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
            key={selectionScope}
            page={page}
            hideProjectColumn={presetProjectId !== null}
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
    </ConsolePage>
  );
};

function dedupeProjectCandidates({
  state,
  projects,
}: {
  state: RunLogFilterState;
  projects: RunLogScopeProject[];
}): RunLogScopeProject[] {
  const condition = state.conditions.find(
    (candidate) => candidate.field === RunLogConditionField.PROJECT,
  );
  if (isNil(condition) || condition.field !== RunLogConditionField.PROJECT) {
    return projects;
  }
  return projects.filter((project) => condition.values.includes(project.id));
}

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

function hasProjectCondition(state: RunLogFilterState): boolean {
  return state.conditions.some(
    (condition) =>
      condition.field === RunLogConditionField.PROJECT &&
      condition.values.length > 0,
  );
}

function globalLogsPath({
  state,
  base,
}: {
  state: RunLogFilterState;
  base: URLSearchParams;
}): string {
  const next = new URLSearchParams(base);
  next.delete(ALL_PROJECTS_PARAM);
  next.delete(CURSOR_QUERY_PARAM);
  next.delete(VIEW_PARAM);
  const params = runLogFilterUtils.writeSearchParams({
    state,
    base: next,
    presetProjectId: null,
  });
  return `/logs?${params.toString()}`;
}

const VIEW_PARAM = 'view';
const ALL_PROJECTS_PARAM = 'allProjects';
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
