import {
  RunMonitorBucket,
  RunMonitorMetric,
  RunMonitorViewConfig,
  RunMonitorWorkflowRow,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Skeleton } from '@/components/ui/skeleton';
import {
  MonitorAiUsage,
  MonitorStatCards,
  MonitorStatusCard,
  MonitorToolbar,
  MonitorTrendCard,
  MonitorViewNameDialog,
  MonitorViewsMenu,
  MonitorWorkflowTable,
  RUN_MONITOR_DEFAULT_VIEW_ID,
  ViewNameDialogState,
  ViewNameMode,
  runMonitorHooks,
  runMonitorLabels,
  runMonitorUtils,
} from '@/features/run-monitor';
import { cn, DASHBOARD_CONTENT_PADDING_X } from '@/lib/utils';

export function MonitorPage() {
  const navigate = useNavigate();
  const [timezone] = useState(() => runMonitorUtils.browserTimezone());
  const [selectedId, setSelectedId] = useState(RUN_MONITOR_DEFAULT_VIEW_ID);
  const [config, setConfig] = useState<RunMonitorViewConfig>(() =>
    runMonitorUtils.defaultConfig(),
  );
  const [nameDialog, setNameDialog] = useState<ViewNameDialogState | null>(
    null,
  );
  const { data: views } = runMonitorHooks.useViews();
  const { data: options } = runMonitorHooks.useOptions();
  const createView = runMonitorHooks.useCreateView();
  const updateView = runMonitorHooks.useUpdateView();
  const deleteView = runMonitorHooks.useDeleteView();

  const myViews = views ?? [];
  const view = myViews.find((item) => item.id === selectedId);
  const viewId = view ? view.id : RUN_MONITOR_DEFAULT_VIEW_ID;
  const savedConfig = view?.config ?? runMonitorUtils.defaultConfig();
  const effective = runMonitorUtils.pruneConfig({ config, options });
  const dirty = !runMonitorUtils.sameConfig({
    a: effective,
    b: runMonitorUtils.pruneConfig({ config: savedConfig, options }),
  });
  const request = {
    range: effective.range,
    timezone,
    projectIds: effective.projectIds,
    workflowIds: effective.workflowIds,
  };
  const summaryQuery = runMonitorHooks.useSummary(request);
  const aiQuery = runMonitorHooks.useAiUsage(request);
  const summary = summaryQuery.data;
  const rangeLabel = runMonitorLabels.range(effective.range);
  const takenNames = [t('Default view'), ...myViews.map((item) => item.name)];

  const patch = (next: Partial<RunMonitorViewConfig>) =>
    setConfig({ ...effective, ...next });
  const applyView = (id: string) => {
    const next = myViews.find((item) => item.id === id);
    setSelectedId(next ? next.id : RUN_MONITOR_DEFAULT_VIEW_ID);
    setConfig(next ? next.config : runMonitorUtils.defaultConfig());
  };
  const openLogs = ({
    from,
    to,
    projectIds,
    workflowIds,
    metric,
  }: {
    from: string;
    to: string;
    projectIds: string[];
    workflowIds: string[];
    metric: RunMonitorMetric;
  }) =>
    navigate(
      runMonitorUtils.logsLink({
        from,
        to,
        projectIds,
        workflowIds,
        group: runMonitorUtils.metricGroup(metric),
      }),
    );
  const openWorkflowLogs = ({
    workflowId,
    projectId,
  }: {
    workflowId: string;
    projectId: string;
  }) => {
    if (!summary) {
      return;
    }
    openLogs({
      from: summary.from,
      to: summary.to,
      projectIds: [projectId],
      workflowIds: [workflowId],
      metric: RunMonitorMetric.ALL,
    });
  };
  const openBucketLogs = (bucket: RunMonitorBucket) =>
    openLogs({
      from: bucket.start,
      to: bucket.end,
      projectIds: effective.projectIds,
      workflowIds: effective.workflowIds,
      metric: effective.metric,
    });

  const submitName = async ({
    mode,
    name,
  }: {
    mode: ViewNameMode;
    name: string;
  }) => {
    if (mode === 'rename' && view) {
      await updateView.mutateAsync({ id: view.id, request: { name } });
      toast.success(t('View renamed'));
      return;
    }
    const created = await createView.mutateAsync({ name, config: effective });
    setSelectedId(created.id);
    setConfig(created.config);
    toast.success(t('Saved as view "{name}"', { name }));
  };
  const saveChanges = () => {
    if (!view) {
      return;
    }
    updateView.mutate(
      { id: view.id, request: { config: effective } },
      {
        onSuccess: (updated) => {
          setConfig(updated.config);
          toast.success(t('View saved'));
        },
      },
    );
  };
  const removeView = async () => {
    if (!view) {
      return;
    }
    await deleteView.mutateAsync(view.id);
    applyView(RUN_MONITOR_DEFAULT_VIEW_ID);
    toast.success(t('View deleted'));
  };

  const filterSummary = [
    rangeLabel,
    effective.projectIds.length > 0
      ? effective.projectIds
          .map(
            (id) =>
              options?.projects.find((project) => project.id === id)
                ?.displayName ?? id,
          )
          .join(', ')
      : t('All projects'),
    effective.workflowIds.length > 0
      ? t('{count} workflows', { count: effective.workflowIds.length })
      : t('All workflows'),
    metricLabel(effective.metric),
  ].join(' · ');

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-4 py-4',
        DASHBOARD_CONTENT_PADDING_X,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('Run monitor')}</h1>
          <p className="text-sm text-muted-foreground">
            {t(
              'Watch run counts, success rates, durations and AI usage by project and workflow, across the projects you are a member of.',
            )}
          </p>
        </div>
        <MonitorViewsMenu
          views={myViews}
          selectedId={viewId}
          dirty={dirty}
          onSelect={applyView}
          onSaveAs={() =>
            setNameDialog({
              mode: 'create',
              initial: runMonitorUtils.uniqueViewName({
                names: takenNames,
                base: t('My view'),
              }),
            })
          }
          onSave={saveChanges}
          onRename={() => {
            if (view) {
              setNameDialog({ mode: 'rename', initial: view.name });
            }
          }}
          onReset={() => setConfig(savedConfig)}
          onDelete={removeView}
        />
      </header>
      <MonitorToolbar
        range={effective.range}
        projectIds={effective.projectIds}
        workflowIds={effective.workflowIds}
        options={options}
        updatedAt={summaryQuery.dataUpdatedAt || Date.now()}
        refreshing={summaryQuery.isFetching}
        onRangeChange={(range) => patch({ range })}
        onProjectsChange={(projectIds) =>
          patch({
            projectIds,
            workflowIds: effective.workflowIds.filter((id) => {
              const workflow = options?.workflows.find(
                (item) => item.id === id,
              );
              return (
                workflow !== undefined &&
                (projectIds.length === 0 ||
                  projectIds.includes(workflow.projectId))
              );
            }),
          })
        }
        onWorkflowsChange={(workflowIds) => patch({ workflowIds })}
        onRefresh={() => {
          void summaryQuery.refetch();
          void aiQuery.refetch();
        }}
      />
      {!summary ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <MonitorStatCards
            stats={summary.stats}
            metric={effective.metric}
            onMetricChange={(metric) => patch({ metric })}
          />
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[2fr_1fr]">
            <MonitorTrendCard
              buckets={summary.buckets}
              unit={summary.unit}
              step={summary.step}
              metric={effective.metric}
              chartMode={effective.chartMode}
              timezone={timezone}
              rangeLabel={rangeLabel}
              onChartModeChange={(chartMode) => patch({ chartMode })}
              onBucketClick={openBucketLogs}
            />
            <MonitorStatusCard
              stats={summary.stats}
              byStatus={summary.byStatus}
            />
          </div>
          <MonitorWorkflowTable
            rows={summary.workflows}
            truncated={summary.workflowsTruncated}
            fileName={`${t('Run monitor')}-${rangeLabel}-${new Date(summary.to)
              .toISOString()
              .slice(0, 10)}.csv`}
            onRowClick={(row: RunMonitorWorkflowRow) =>
              openWorkflowLogs({
                workflowId: row.workflowId,
                projectId: row.projectId,
              })
            }
          />
        </>
      )}
      <MonitorAiUsage
        usage={aiQuery.data}
        rangeLabel={rangeLabel}
        onWorkflowClick={openWorkflowLogs}
      />
      <MonitorViewNameDialog
        state={nameDialog}
        takenNames={
          nameDialog?.mode === 'rename'
            ? takenNames.filter((name) => name !== view?.name)
            : takenNames
        }
        summary={filterSummary}
        onOpenChange={(open) => {
          if (!open) {
            setNameDialog(null);
          }
        }}
        onSubmit={submitName}
      />
    </div>
  );
}

function metricLabel(metric: RunMonitorMetric): string {
  switch (metric) {
    case RunMonitorMetric.ALL:
      return t('All statuses');
    case RunMonitorMetric.SUCCEEDED:
      return t('Succeeded');
    case RunMonitorMetric.FAILED:
      return t('Failed');
    case RunMonitorMetric.TERMINATED:
      return t('Terminated');
  }
}
