import { ConnectorMetadataModel } from '@fema-ipaas/connector-sdk';
import { isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
  WorkflowVersion,
  WorkflowVersionState,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import {
  ChevronRight,
  CircleMinus,
  CirclePlus,
  PencilLine,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { LoadingSpinner } from '@/components/custom/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { componentsHooks } from '@/features/components';
import { connectionsQueries } from '@/features/connections';
import { connectorsHooks } from '@/features/connectors';
import { StepChangeKind, versionDiff } from '@/features/releases';
import { workflowHooks, workflowsApi } from '@/features/workflows';
import { authenticationSession } from '@/lib/authentication-session';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import {
  CompareContext,
  CompareRow,
  PropLabelSource,
  versionCompareRows,
} from './version-compare-rows';
import { versionNumbers } from './version-numbers';

export function CompareVersionsDialog({
  open,
  onOpenChange,
  workflowId,
  leftVersionId,
  rightVersionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  leftVersionId: string | null;
  rightVersionId: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('Compare versions')}</DialogTitle>
          <DialogDescription>
            {t('Pick any two versions, or the draft, to see what changed.')}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <CompareVersionsBody
            key={`${leftVersionId}-${rightVersionId}`}
            workflowId={workflowId}
            initialLeft={leftVersionId}
            initialRight={rightVersionId}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CompareVersionsBody({
  workflowId,
  initialLeft,
  initialRight,
}: {
  workflowId: string;
  initialLeft: string | null;
  initialRight: string | null;
}) {
  const { data: versionsPage } =
    workflowHooks.useListWorkflowVersions(workflowId);
  const versions = useMemo(() => versionsPage?.data ?? [], [versionsPage]);
  const numbers = useMemo(
    () => versionNumbers.numberVersions(versions),
    [versions],
  );
  const [left, setLeft] = useState<string | null>(initialLeft);
  const [right, setRight] = useState<string | null>(initialRight);
  const leftId = left ?? versions[1]?.id ?? null;
  const rightId = right ?? versions[0]?.id ?? null;
  const leftQuery = useVersion({ workflowId, versionId: leftId });
  const rightQuery = useVersion({ workflowId, versionId: rightId });
  const optionLabel = (id: string) => {
    const version = versions.find((candidate) => candidate.id === id);
    if (!version) {
      return id;
    }
    const label =
      version.state === WorkflowVersionState.DRAFT
        ? t('Draft')
        : versionNumbers.label({ numbers, versionId: id }) ?? '';
    const date =
      version.state === WorkflowVersionState.DRAFT
        ? version.updated
        : version.created;
    return `${label} · ${formatUtils.formatDate(new Date(date))}`;
  };

  const changes =
    leftQuery.data && rightQuery.data
      ? versionDiff.diffSteps({
          before: leftQuery.data.trigger,
          after: rightQuery.data.trigger,
        })
      : [];
  const workflowRows =
    leftQuery.data && rightQuery.data
      ? versionCompareRows.workflowRows({
          changes: versionDiff.workflowChanges({
            before: leftQuery.data,
            after: rightQuery.data,
          }),
        })
      : [];
  const context = useCompareContext({
    versions: [leftQuery.data, rightQuery.data],
  });
  const isLoading = leftQuery.isLoading || rightQuery.isLoading;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <VersionSelect
          label={t('Older version')}
          value={leftId}
          options={versions.map((version) => version.id)}
          optionLabel={optionLabel}
          onChange={setLeft}
        />
        <VersionSelect
          label={t('Newer version')}
          value={rightId}
          options={versions.map((version) => version.id)}
          optionLabel={optionLabel}
          onChange={setRight}
        />
      </div>
      {isLoading ? (
        <div className="flex py-10">
          <LoadingSpinner />
        </div>
      ) : changes.length === 0 && workflowRows.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          {t('These two versions have the same steps and settings.')}
        </p>
      ) : (
        <ScrollArea className="max-h-[60vh]">
          <div className="flex flex-col gap-1">
            {workflowRows.length > 0 && (
              <StepChangeRow
                kind={StepChangeKind.MODIFIED}
                displayName={t('Workflow')}
                rows={workflowRows}
              />
            )}
            {changes.map((change) => (
              <StepChangeRow
                key={`${change.kind}-${change.name}`}
                kind={change.kind}
                displayName={change.displayName}
                rows={versionCompareRows.stepRows({
                  kind: change.kind,
                  before: stepOf({
                    trigger: leftQuery.data?.trigger,
                    name: change.name,
                  }),
                  after: stepOf({
                    trigger: rightQuery.data?.trigger,
                    name: change.name,
                  }),
                  context,
                })}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function StepChangeRow({
  kind,
  displayName,
  rows,
}: {
  kind: StepChangeKind;
  displayName: string;
  rows: CompareRow[];
}) {
  const [expanded, setExpanded] = useState(kind === StepChangeKind.MODIFIED);
  const Icon = KIND_ICONS[kind];
  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
      >
        <ChevronRight
          className={cn(
            'size-3.5 transition-transform',
            expanded && 'rotate-90',
          )}
        />
        <Icon className={cn('size-3.5', KIND_COLORS[kind])} />
        <span className="font-medium">{displayName}</span>
        <span className="text-xs text-muted-foreground">
          {KIND_LABELS[kind]()}
        </span>
        {rows.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {t('{count, plural, other {# fields}}', { count: rows.length })}
          </span>
        )}
      </button>
      {expanded && rows.length > 0 && (
        <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t px-3 py-2 text-xs">
          <span className="font-medium text-muted-foreground">
            {t('Field')}
          </span>
          <span className="font-medium text-muted-foreground">
            {t('Older version')}
          </span>
          <span className="font-medium text-muted-foreground">
            {t('Newer version')}
          </span>
          {rows.map((row) => (
            <FieldRow key={row.key} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldRow({ row }: { row: CompareRow }) {
  return (
    <>
      <span className="break-words font-medium text-foreground">
        {row.label}
      </span>
      <span className="whitespace-pre-wrap break-all text-destructive-700">
        {row.before}
      </span>
      <span className="whitespace-pre-wrap break-all text-success-700">
        {row.after}
      </span>
    </>
  );
}

function useCompareContext({
  versions,
}: {
  versions: (WorkflowVersion | undefined)[];
}): CompareContext {
  const steps = versions.flatMap((version) =>
    isNil(version) ? [] : workflowStructureUtil.getAllSteps(version.trigger),
  );
  const connectorNames = [
    ...new Set(
      steps.flatMap((step) =>
        step.type === WorkflowActionType.CONNECTOR ||
        step.type === WorkflowTriggerType.CONNECTOR
          ? [step.settings.connectorName]
          : [],
      ),
    ),
  ].sort();
  const connectorQueries = connectorsHooks.useMultipleConnectors({
    names: connectorNames,
  });
  const { data: components } = componentsHooks.useComponents();
  const projectId = authenticationSession.getProjectId() ?? '';
  const { data: connectionsPage } = connectionsQueries.useConnections({
    request: { projectId, limit: 1000 },
    extraKeys: ['version-compare', projectId],
    staleTime: 30_000,
  });
  const connectors = new Map(
    connectorQueries.flatMap((query): [string, ConnectorMetadataModel][] =>
      isNil(query.data) ? [] : [[query.data.name, query.data]],
    ),
  );
  const stepNames = Object.fromEntries(
    steps.map((step) => [step.name, step.displayName]),
  );
  const connectionNames = Object.fromEntries(
    (connectionsPage?.data ?? []).map((connection) => [
      connection.externalId,
      connection.displayName,
    ]),
  );
  return {
    propsOf: (step) =>
      propsOf({ step, connectors, components: components ?? [] }),
    connectorName: (name) => connectors.get(name)?.displayName ?? null,
    operationName: ({ connector, name }) => {
      const model = connectors.get(connector);
      return (
        model?.actions[name]?.displayName ??
        model?.triggers[name]?.displayName ??
        null
      );
    },
    componentName: (type) =>
      components?.find((component) => component.type === type)?.displayName ??
      null,
    stepNames,
    connectionNames,
  };
}

function propsOf({
  step,
  connectors,
  components,
}: {
  step: WorkflowTrigger | WorkflowAction | null;
  connectors: Map<string, ConnectorMetadataModel>;
  components: ComponentProps[];
}): Record<string, PropLabelSource> {
  if (isNil(step)) {
    return {};
  }
  if (step.type === WorkflowActionType.COMPONENT) {
    return toLabelSources(
      components.find(
        (component) => component.type === step.settings.componentType,
      )?.props ?? {},
    );
  }
  if (step.type === WorkflowActionType.CONNECTOR) {
    const model = connectors.get(step.settings.connectorName);
    return toLabelSources(
      model?.actions[step.settings.actionName ?? '']?.props ?? {},
    );
  }
  if (step.type === WorkflowTriggerType.CONNECTOR) {
    const model = connectors.get(step.settings.connectorName);
    return toLabelSources(
      model?.triggers[step.settings.triggerName ?? '']?.props ?? {},
    );
  }
  return {};
}

function toLabelSources(
  props: Record<string, LabelledProp | undefined>,
): Record<string, PropLabelSource> {
  return Object.fromEntries(
    Object.entries(props).flatMap(([name, prop]) =>
      isNil(prop)
        ? []
        : [
            [
              name,
              {
                displayName: prop.displayName,
                options: 'options' in prop ? prop.options : undefined,
              },
            ],
          ],
    ),
  );
}

function VersionSelect({
  label,
  value,
  options,
  optionLabel,
  onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  optionLabel: (id: string) => string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={t('Choose a version')} />
        </SelectTrigger>
        <SelectContent>
          {options.map((id) => (
            <SelectItem key={id} value={id}>
              {optionLabel(id)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function useVersion({
  workflowId,
  versionId,
}: {
  workflowId: string;
  versionId: string | null;
}) {
  return useQuery({
    queryKey: ['workflow-version-compare', workflowId, versionId],
    queryFn: async () =>
      (
        await workflowsApi.get(workflowId, {
          versionId: versionId ?? undefined,
        })
      ).version,
    enabled: versionId !== null,
  });
}

function stepOf({
  trigger,
  name,
}: {
  trigger: WorkflowTrigger | undefined;
  name: string;
}) {
  if (!trigger) {
    return null;
  }
  return workflowStructureUtil.getStep(name, trigger) ?? null;
}

const KIND_ICONS = {
  [StepChangeKind.ADDED]: CirclePlus,
  [StepChangeKind.MODIFIED]: PencilLine,
  [StepChangeKind.REMOVED]: CircleMinus,
};

const KIND_COLORS = {
  [StepChangeKind.ADDED]: 'text-success-700',
  [StepChangeKind.MODIFIED]: 'text-primary',
  [StepChangeKind.REMOVED]: 'text-destructive',
};

const KIND_LABELS = {
  [StepChangeKind.ADDED]: () => t('Added'),
  [StepChangeKind.MODIFIED]: () => t('Modified'),
  [StepChangeKind.REMOVED]: () => t('Removed'),
};

type LabelledProp = { displayName: string };

type ComponentProps = {
  type: string;
  props: Record<string, LabelledProp | undefined>;
};
