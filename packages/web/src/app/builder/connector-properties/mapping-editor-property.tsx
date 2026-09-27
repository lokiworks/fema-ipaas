import { MappingSpec } from '@fema-ipaas/core-utils';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { MappingEditor } from '@/features/mapping-tables';

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
  return (
    <MappingEditor
      value={value}
      onChange={onChange}
      disabled={disabled}
      sampleData={sampleData}
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

export const MAPPING_EDITOR_TARGET = {
  connectorName: '@fema-ipaas/connector-data-mapper',
  actionName: 'map_fields',
  propertyName: 'mapping',
};
