import {
  ConnectorMetadataModel,
  OutputSchema,
} from '@fema-ipaas/connector-sdk';
import { isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
  WorkflowVersion,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  ChevronRight,
  CircleMinus,
  CirclePlus,
  PencilLine,
} from 'lucide-react';
import { useState } from 'react';

import { textMentionUtils } from '@/app/builder/connector-properties/text-input-with-mentions/text-input-utils';
import { stepLocationUtils } from '@/app/builder/workflow-canvas/utils/step-location';
import { componentsHooks } from '@/features/components';
import { connectionsQueries } from '@/features/connections';
import { connectorsHooks } from '@/features/connectors';
import { StepChangeKind, versionDiff } from '@/features/releases';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

import {
  CompareContext,
  CompareRow,
  PropLabelSource,
  versionCompareRows,
} from './version-compare-rows';

export function VersionChangeList({
  before,
  after,
  collapsed = false,
}: {
  before: WorkflowVersion | null;
  after: WorkflowVersion;
  collapsed?: boolean;
}) {
  const context = useCompareContext({ versions: [before, after] });
  const changes = versionDiff.diffSteps({
    before: before?.trigger ?? null,
    after: after.trigger,
  });
  const workflowRows = isNil(before)
    ? []
    : versionCompareRows.workflowRows({
        changes: versionDiff.workflowChanges({ before, after }),
      });
  if (changes.length === 0 && workflowRows.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1">
      {workflowRows.length > 0 && (
        <StepChangeRow
          kind={StepChangeKind.MODIFIED}
          displayName={t('Workflow')}
          location={null}
          rows={workflowRows}
          collapsed={collapsed}
        />
      )}
      {changes.map((change) => (
        <StepChangeRow
          key={`${change.kind}-${change.name}`}
          kind={change.kind}
          displayName={change.displayName}
          location={stepLocationUtils.label({
            trigger:
              change.kind === StepChangeKind.REMOVED && !isNil(before)
                ? before.trigger
                : after.trigger,
            stepName: change.name,
          })}
          rows={versionCompareRows.stepRows({
            kind: change.kind,
            before: stepOf({ trigger: before?.trigger, name: change.name }),
            after: stepOf({ trigger: after.trigger, name: change.name }),
            context,
          })}
          collapsed={collapsed}
        />
      ))}
    </div>
  );
}

function StepChangeRow({
  kind,
  displayName,
  location,
  rows,
  collapsed,
}: {
  kind: StepChangeKind;
  displayName: string;
  location: string | null;
  rows: CompareRow[];
  collapsed: boolean;
}) {
  const [expanded, setExpanded] = useState(
    !collapsed && kind === StepChangeKind.MODIFIED,
  );
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
            'size-3.5 shrink-0 transition-transform',
            expanded && 'rotate-90',
          )}
        />
        <Icon className={cn('size-3.5 shrink-0', KIND_COLORS[kind])} />
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{displayName}</span>
          {!isNil(location) && location.length > 0 && (
            <span className="text-xs text-muted-foreground">{location}</span>
          )}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {KIND_LABELS[kind]()}
        </span>
        {rows.length > 0 && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
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
  versions: (WorkflowVersion | null | undefined)[];
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
  const stepByName = new Map(steps.map((step) => [step.name, step]));
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
    fieldLabels: ({ stepName, path }) => {
      const step = stepByName.get(stepName);
      if (isNil(step)) {
        return null;
      }
      return textMentionUtils.friendlyLabelsOf({
        path,
        step,
        schema: outputSchemaOf({ step, connectors }),
      });
    },
  };
}

function outputSchemaOf({
  step,
  connectors,
}: {
  step: WorkflowTrigger | WorkflowAction;
  connectors: Map<string, ConnectorMetadataModel>;
}): OutputSchema | null {
  if (step.type === WorkflowActionType.CONNECTOR) {
    return (
      connectors.get(step.settings.connectorName)?.actions[
        step.settings.actionName ?? ''
      ]?.outputSchema ?? null
    );
  }
  if (step.type === WorkflowTriggerType.CONNECTOR) {
    return (
      connectors.get(step.settings.connectorName)?.triggers[
        step.settings.triggerName ?? ''
      ]?.outputSchema ?? null
    );
  }
  return null;
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
