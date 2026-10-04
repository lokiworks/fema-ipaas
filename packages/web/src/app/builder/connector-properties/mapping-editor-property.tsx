import {
  isNil,
  LocalesEnum,
  MappingSpec,
  Permission,
} from '@fema-ipaas/core-utils';
import {
  workflowConnectorUtil,
  WorkflowActionType,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { useQueries } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { DataSelector } from '@/app/builder/data-selector';
import { connectorsApi } from '@/features/connectors';
import {
  MappingEditor,
  mappingTablesHooks,
  targetSchema,
} from '@/features/mapping-tables';
import { TargetOption } from '@/features/mapping-tables/utils/target-schema';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';

import { MAPPING_EDITOR_TARGET } from './mapping-editor-target';
import { MappingWriteStepDialog } from './mapping-write-step-dialog';
import { TextInputWithMentions } from './text-input-with-mentions';

export function MappingEditorProperty({
  value,
  onChange,
  disabled,
}: {
  value: unknown;
  onChange: (value: MappingSpec) => void;
  disabled: boolean;
}) {
  const sampleData = useBuilderStateContext((state) => state.outputSampleData);
  const [workflowId, stepName, versionId] = useBuilderStateContext((state) => [
    state.workflow.id,
    state.selectedStep,
    state.workflowVersion.id,
  ]);
  const [savedExpansion, setSavedExpansion] = useBuilderStateContext(
    (state) => [state.expandedMappingEditor, state.setExpandedMappingEditor],
  );
  const [expanded, setExpanded] = useState(
    () =>
      savedExpansion !== null &&
      savedExpansion.stepName === stepName &&
      savedExpansion.versionId !== versionId,
  );
  useEffect(() => {
    setSavedExpansion(
      expanded && stepName !== null ? { stepName, versionId } : null,
    );
  }, [expanded, stepName, versionId, setSavedExpansion]);
  const targetOptions = useTargetOptions();
  const { checkAccess } = useAuthorization();
  const { data: coverage } = mappingTablesHooks.useWorkflowCoverage({
    projectId: authenticationSession.getProjectId(),
    workflowId,
    enabled: true,
  });
  const runCoverage = useMemo(
    () => (coverage ?? []).filter((source) => source.stepName === stepName),
    [coverage, stepName],
  );
  return (
    <MappingEditor
      value={value}
      onChange={onChange}
      disabled={disabled}
      sampleData={sampleData}
      targetOptions={targetOptions}
      runCoverage={runCoverage}
      canEditTables={checkAccess(Permission.WRITE_WORKFLOW)}
      expanded={expanded}
      onExpandedChange={setExpanded}
      renderSourcePanel={() => (
        <DataSelector parentHeight={0} parentWidth={0} embedded />
      )}
      renderAddTarget={(params) => <MappingWriteStepDialog {...params} />}
      renderSourceInput={({
        value: source,
        disabled: inputDisabled,
        onChange: onSourceChange,
      }) => (
        <TextInputWithMentions
          initialValue={source}
          disabled={inputDisabled}
          onChange={onSourceChange}
        />
      )}
    />
  );
}

function useTargetOptions(): TargetOption[] {
  const { i18n } = useTranslation();
  const trigger = useBuilderStateContext(
    (state) => state.workflowVersion.trigger,
  );
  const refs = useMemo(() => connectorRefsOf(trigger), [trigger]);
  const queries = useQueries({
    queries: refs.map((ref) => ({
      queryKey: ['connector', ref.name, ref.version, i18n.language, undefined],
      queryFn: () =>
        connectorsApi.get({
          name: ref.name,
          version: ref.version,
          locale: localeOf(i18n.language),
        }),
      staleTime: Infinity,
    })),
  });
  const signature = queries
    .map((query) => `${query.status}:${query.dataUpdatedAt}`)
    .join('|');
  return useMemo(
    () =>
      queries.flatMap((query) => {
        const model = query.data;
        if (
          isNil(model) ||
          model.name === MAPPING_EDITOR_TARGET.connectorName
        ) {
          return [];
        }
        return Object.entries(model.actions)
          .filter(([, action]) =>
            WRITE_CLASSIFICATIONS.includes(action.classification ?? ''),
          )
          .flatMap(([actionName, action]) => {
            const target = targetSchema.fromModelAction({ model, actionName });
            return target === null
              ? []
              : [
                  {
                    key: `${model.name}/${actionName}`,
                    label: `${model.displayName} · ${action.displayName}`,
                    target,
                  },
                ];
          });
      }),
    [signature],
  );
}

function localeOf(language: string): LocalesEnum | undefined {
  return Object.values(LocalesEnum).find((locale) => locale === language);
}

function connectorRefsOf(
  trigger: Parameters<typeof workflowStructureUtil.getAllSteps>[0],
): { name: string; version: string }[] {
  const refs = workflowStructureUtil.getAllSteps(trigger).flatMap((step) =>
    step.type === WorkflowActionType.CONNECTOR ||
    step.type === 'CONNECTOR_TRIGGER'
      ? [
          {
            name: step.settings.connectorName,
            version: workflowConnectorUtil.getExactVersion(
              step.settings.connectorVersion,
            ),
          },
        ]
      : [],
  );
  return [
    ...new Map(refs.map((ref) => [`${ref.name}@${ref.version}`, ref])).values(),
  ];
}

const WRITE_CLASSIFICATIONS: string[] = ['WRITE', 'DESTRUCTIVE'];
