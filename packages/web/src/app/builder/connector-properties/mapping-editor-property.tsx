import { PropertyType } from '@fema-ipaas/connector-sdk';
import { isNil, MappingSpec } from '@fema-ipaas/core-utils';
import {
  workflowConnectorUtil,
  WorkflowActionType,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { connectorsApi } from '@/features/connectors';
import { MappingEditor, targetSchema } from '@/features/mapping-tables';
import { TargetOption } from '@/features/mapping-tables/utils/target-schema';

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
  const targetOptions = useTargetOptions();
  return (
    <MappingEditor
      value={value}
      onChange={onChange}
      disabled={disabled}
      sampleData={sampleData}
      targetOptions={targetOptions}
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
          locale: undefined,
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
          .map(([actionName, action]) => ({
            key: `${model.name}/${actionName}`,
            label: `${model.displayName} · ${action.displayName}`,
            target: targetSchema.fromAction({
              connectorName: model.name,
              actionName,
              displayName: `${model.displayName} · ${action.displayName}`,
              props: Object.fromEntries(
                Object.entries(action.props).map(([name, prop]) => [
                  name,
                  {
                    displayName: prop.displayName,
                    required: prop.required,
                    type: prop.type,
                    options: optionsOf({ type: prop.type, prop }),
                  },
                ]),
              ),
            }),
          }));
      }),
    [signature],
  );
}

function optionsOf({
  type,
  prop,
}: {
  type: PropertyType;
  prop: unknown;
}): { options: { label: string; value: unknown }[] } | undefined {
  if (
    type !== PropertyType.STATIC_DROPDOWN ||
    typeof prop !== 'object' ||
    prop === null
  ) {
    return undefined;
  }
  const holder = Reflect.get(prop, 'options');
  const list =
    typeof holder === 'object' && holder !== null
      ? Reflect.get(holder, 'options')
      : undefined;
  return Array.isArray(list)
    ? {
        options: list.flatMap((option) =>
          typeof option === 'object' && option !== null
            ? [
                {
                  label: String(Reflect.get(option, 'label')),
                  value: Reflect.get(option, 'value'),
                },
              ]
            : [],
        ),
      }
    : undefined;
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

export const MAPPING_EDITOR_TARGET = {
  connectorName: '@fema-ipaas/connector-data-mapper',
  actionName: 'map_fields',
  propertyName: 'mapping',
};
