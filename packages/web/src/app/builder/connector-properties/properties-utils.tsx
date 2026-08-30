import {
  ConnectorProperty,
  ConnectorPropertyMap,
  PropertyType,
} from '@fema-ipaas/connector-sdk';
import { isNil } from '@fema-ipaas/core-utils';
import { PropertyExecutionType, PropertySettings } from '@fema-ipaas/shared';
import { t } from 'i18next';
import React from 'react';
import { ControllerRenderProps, UseFormReturn } from 'react-hook-form';

import { SecretInput } from '@/app/connections/secret-input';
import { ColorPicker } from '@/components/custom/color-picker';
import { DictionaryInput } from '@/components/custom/dictionary-input';
import { JsonEditor } from '@/components/custom/json-editor';
import { Markdown } from '@/components/custom/markdown';
import { MultiSelectConnectorProperty } from '@/components/custom/multi-select-connector-property';
import { ReadMoreDescription } from '@/components/custom/read-more-description';
import { SearchableSelect } from '@/components/custom/searchable-select';
import { FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RequiredFieldAsterisk } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import { ArrayConnectorProperty } from './array-property';
import { AutoFormFieldWrapper } from './auto-form-field-wrapper';
import { BuilderJsonEditorWrapper } from './builder-json-wrapper';
import CustomProperty from './custom-property';
import { DateRangeProperty } from './date-range-property';
import { DynamicProperties } from './dynamic-connector-property';
import { DynamicDropdownConnectorProperty } from './dynamic-dropdown-connector-property';
import { NumberStepper } from './number-stepper';
import { RichTextProperty } from './rich-text-property';
import { StaticDropdownCards } from './static-dropdown-cards';
import { TextInputWithMentions } from './text-input-with-mentions';

export const selectGenericFormComponentForProperty = ({
  field,
  propertyName,
  inputName,
  property,
  allowDynamicValues,
  markdownVariables,
  useMentionTextInput,
  disabled,
  dynamicInputModeToggled,
  form,
  dynamicPropsInfo,
  propertySettings,
  hideLabel,
  hideDescription,
  enableMarkdownForInputWithMention,
}: SelectGenericFormComponentForPropertyParams) => {
  const valueTypeOverride = propertySettings?.[propertyName]?.type;
  const valueTypeEditor = isNil(valueTypeOverride)
    ? undefined
    : VALUE_TYPE_EDITORS[valueTypeOverride];
  if (!isNil(valueTypeEditor)) {
    return (
      <AutoFormFieldWrapper
        propertyName={propertyName}
        inputName={inputName}
        property={property}
        field={field}
        hideLabel={hideLabel}
        disabled={disabled}
        allowDynamicValues={allowDynamicValues}
        dynamicInputModeToggled={false}
      >
        {valueTypeEditor({ field, disabled })}
      </AutoFormFieldWrapper>
    );
  }
  switch (property.type) {
    case PropertyType.ARRAY:
      return (
        <AutoFormFieldWrapper
          property={property}
          hideLabel={hideLabel}
          propertyName={propertyName}
          field={field}
          disabled={disabled}
          inputName={inputName}
          allowDynamicValues={allowDynamicValues}
          dynamicInputModeToggled={dynamicInputModeToggled}
        >
          <ArrayConnectorProperty
            disabled={disabled}
            arrayProperty={property}
            inputName={inputName}
            useMentionTextInput={useMentionTextInput}
          ></ArrayConnectorProperty>
        </AutoFormFieldWrapper>
      );
    case PropertyType.OBJECT:
      return (
        <AutoFormFieldWrapper
          property={property}
          propertyName={propertyName}
          field={field}
          hideLabel={hideLabel}
          inputName={inputName}
          disabled={disabled}
          allowDynamicValues={allowDynamicValues}
          dynamicInputModeToggled={dynamicInputModeToggled}
        >
          <DictionaryInput
            disabled={disabled}
            values={field.value}
            onChange={field.onChange}
            keyInputClassName={useMentionTextInput ? 'h-[38px]' : undefined}
            renderValueInput={
              useMentionTextInput
                ? ({ value, onChange, disabled }) => (
                    <TextInputWithMentions
                      initialValue={value}
                      disabled={disabled}
                      onChange={onChange}
                    />
                  )
                : undefined
            }
          />
        </AutoFormFieldWrapper>
      );
    case PropertyType.CHECKBOX:
      return (
        <AutoFormFieldWrapper
          property={property}
          propertyName={propertyName}
          disabled={disabled}
          hideLabel={hideLabel}
          field={field}
          inputName={inputName}
          allowDynamicValues={allowDynamicValues}
          placeBeforeLabelText={true}
          dynamicInputModeToggled={dynamicInputModeToggled}
        >
          <FormControl>
            <Switch
              id={propertyName}
              checked={field.value}
              disabled={disabled}
              onCheckedChange={field.onChange}
            />
          </FormControl>
        </AutoFormFieldWrapper>
      );
    case PropertyType.MARKDOWN:
      return (
        <Markdown
          markdown={property.description}
          variables={markdownVariables}
          variant={property.variant}
        />
      );
    case PropertyType.RICH_TEXT:
      return (
        <RichTextProperty
          property={property}
          inputName={inputName}
          value={field.value}
          onChange={field.onChange}
          disabled={disabled}
        ></RichTextProperty>
      );
    case PropertyType.STATIC_DROPDOWN:
      return (
        <AutoFormFieldWrapper
          property={property}
          propertyName={propertyName}
          inputName={inputName}
          field={field}
          hideLabel={hideLabel}
          hideDescription={hideDescription}
          disabled={disabled}
          allowDynamicValues={allowDynamicValues}
          dynamicInputModeToggled={dynamicInputModeToggled}
        >
          {property.display === 'cards' ? (
            <StaticDropdownCards
              options={property.options.options}
              value={field.value}
              onChange={field.onChange}
              disabled={disabled}
            ></StaticDropdownCards>
          ) : (
            <SearchableSelect
              options={property.options.options}
              onChange={field.onChange}
              value={field.value}
              disabled={disabled}
              placeholder={
                property.options.placeholder ?? t('Select an option')
              }
              showDeselect={!property.required}
            ></SearchableSelect>
          )}
        </AutoFormFieldWrapper>
      );
    case PropertyType.JSON:
      return (
        <AutoFormFieldWrapper
          propertyName={propertyName}
          inputName={inputName}
          property={property}
          field={field}
          hideLabel={hideLabel}
          disabled={disabled}
          allowDynamicValues={allowDynamicValues}
          dynamicInputModeToggled={dynamicInputModeToggled}
        >
          {useMentionTextInput ? (
            <BuilderJsonEditorWrapper
              field={field}
              disabled={disabled}
            ></BuilderJsonEditorWrapper>
          ) : (
            <JsonEditor field={field} readonly={disabled}></JsonEditor>
          )}
        </AutoFormFieldWrapper>
      );
    case PropertyType.STATIC_MULTI_SELECT_DROPDOWN:
      return (
        <AutoFormFieldWrapper
          property={property}
          inputName={inputName}
          propertyName={propertyName}
          field={field}
          hideLabel={hideLabel}
          disabled={disabled}
          allowDynamicValues={allowDynamicValues}
          dynamicInputModeToggled={dynamicInputModeToggled}
        >
          <MultiSelectConnectorProperty
            placeholder={property.options.placeholder ?? t('Select an option')}
            options={property.options.options}
            onChange={field.onChange}
            initialValues={field.value}
            disabled={disabled}
            showDeselect={
              !isNil(field.value) &&
              field.value.length > 0 &&
              !property.required
            }
          ></MultiSelectConnectorProperty>
        </AutoFormFieldWrapper>
      );
    case PropertyType.MULTI_SELECT_DROPDOWN:
    case PropertyType.DROPDOWN:
      return (
        <AutoFormFieldWrapper
          inputName={inputName}
          property={property}
          propertyName={propertyName}
          field={field}
          hideLabel={hideLabel}
          hideDescription={hideDescription}
          disabled={disabled}
          allowDynamicValues={allowDynamicValues}
          dynamicInputModeToggled={dynamicInputModeToggled}
        >
          {isNil(dynamicPropsInfo) ? (
            <div>Error: dynamicPropsInfo is required</div>
          ) : (
            <DynamicDropdownConnectorProperty
              refreshers={property.refreshers}
              value={field.value}
              actionOrTriggerName={dynamicPropsInfo.actionOrTriggerName}
              connectorName={dynamicPropsInfo.connectorName}
              connectorVersion={dynamicPropsInfo.connectorVersion}
              componentType={dynamicPropsInfo.componentType}
              form={form}
              placedInside={dynamicPropsInfo.placedInside}
              onChange={field.onChange}
              disabled={disabled}
              propertyName={propertyName}
              multiple={property.type === PropertyType.MULTI_SELECT_DROPDOWN}
              showDeselect={!property.required}
              shouldRefreshOnSearch={property.refreshOnSearch ?? false}
            ></DynamicDropdownConnectorProperty>
          )}
        </AutoFormFieldWrapper>
      );
    case PropertyType.NUMBER:
      return property.display === 'stepper' ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-sm leading-none font-medium">
              {property.displayName}
              {property.required && <RequiredFieldAsterisk />}
            </span>
            <NumberStepper
              value={field.value}
              onChange={field.onChange}
              min={property.min}
              max={property.max}
              step={property.step}
              disabled={disabled}
            />
          </div>
          {property.description && (
            <ReadMoreDescription text={property.description} />
          )}
        </div>
      ) : (
        <AutoFormFieldWrapper
          property={property}
          inputName={inputName}
          field={field}
          hideLabel={hideLabel}
          propertyName={propertyName}
          disabled={disabled}
          allowDynamicValues={false}
          dynamicInputModeToggled={dynamicInputModeToggled}
        >
          {useMentionTextInput ? (
            <TextInputWithMentions
              disabled={disabled}
              initialValue={field.value}
              onChange={field.onChange}
              enableMarkdown={enableMarkdownForInputWithMention}
            ></TextInputWithMentions>
          ) : (
            <SecretInput
              ref={field.ref}
              value={field.value}
              onChange={field.onChange}
              disabled={disabled}
              type="text"
            ></SecretInput>
          )}
        </AutoFormFieldWrapper>
      );
    case PropertyType.DATE_RANGE:
      return (
        <AutoFormFieldWrapper
          property={property}
          inputName={inputName}
          field={field}
          hideLabel={hideLabel}
          hideDescription={hideDescription}
          propertyName={propertyName}
          disabled={disabled}
          allowDynamicValues={false}
          dynamicInputModeToggled={dynamicInputModeToggled}
        >
          <DateRangeProperty
            value={field.value}
            onChange={field.onChange}
            disabled={disabled}
            display={property.display}
          ></DateRangeProperty>
        </AutoFormFieldWrapper>
      );
    case PropertyType.DATE_TIME:
    case PropertyType.SHORT_TEXT:
    case PropertyType.LONG_TEXT:
    case PropertyType.FILE:
    case PropertyType.SECRET_TEXT:
      return (
        <AutoFormFieldWrapper
          property={property}
          inputName={inputName}
          field={field}
          hideLabel={hideLabel}
          hideDescription={hideDescription}
          propertyName={propertyName}
          disabled={disabled}
          allowDynamicValues={false}
          dynamicInputModeToggled={dynamicInputModeToggled}
        >
          {useMentionTextInput ? (
            <TextInputWithMentions
              disabled={disabled}
              initialValue={field.value}
              onChange={field.onChange}
              placeholder={
                'placeholder' in property ? property.placeholder : undefined
              }
              enableMarkdown={enableMarkdownForInputWithMention}
            ></TextInputWithMentions>
          ) : (
            <SecretInput
              ref={field.ref}
              value={field.value}
              onChange={field.onChange}
              disabled={disabled}
              placeholder={
                'placeholder' in property ? property.placeholder : undefined
              }
              type={
                property.type === PropertyType.SECRET_TEXT ? 'password' : 'text'
              }
            ></SecretInput>
          )}
        </AutoFormFieldWrapper>
      );
    case PropertyType.DYNAMIC:
      return dynamicPropsInfo ? (
        <DynamicProperties
          refreshers={property.refreshers}
          propertyName={propertyName}
          disabled={disabled}
          connectorName={dynamicPropsInfo.connectorName}
          connectorVersion={dynamicPropsInfo.connectorVersion}
          componentType={dynamicPropsInfo.componentType}
          actionOrTriggerName={dynamicPropsInfo.actionOrTriggerName}
          placedInside={dynamicPropsInfo.placedInside}
          propertySettings={propertySettings}
          updateFormSchema={dynamicPropsInfo.updateFormSchema}
          updatePropertySettingsSchema={
            dynamicPropsInfo.updatePropertySettingsSchema
          }
        ></DynamicProperties>
      ) : (
        <div>Error: dynamicPropsInfo is required</div>
      );
    case PropertyType.CUSTOM_AUTH:
    case PropertyType.BASIC_AUTH:
    case PropertyType.OAUTH2:
    case PropertyType.OIDC:
      return <></>;
    case PropertyType.CUSTOM:
      return (
        <CustomProperty
          code={property.code}
          value={field.value}
          onChange={field.onChange}
          disabled={disabled}
          property={property}
        ></CustomProperty>
      );
    case PropertyType.COLOR:
      return (
        <AutoFormFieldWrapper
          property={property}
          inputName={inputName}
          propertyName={propertyName}
          field={field}
          hideLabel={hideLabel}
          disabled={disabled}
          allowDynamicValues={allowDynamicValues}
          dynamicInputModeToggled={dynamicInputModeToggled}
        >
          <ColorPicker value={field.value} onChange={field.onChange} />
        </AutoFormFieldWrapper>
      );
  }
};

export type SelectGenericFormComponentForPropertyParams = {
  field: ControllerRenderProps<Record<string, any>, string>;
  hideLabel?: boolean;
  hideDescription?: boolean;
  propertyName: string;
  inputName: string;
  property: ConnectorProperty;
  allowDynamicValues: boolean;
  markdownVariables: Record<string, string>;
  useMentionTextInput: boolean;
  disabled: boolean;
  dynamicInputModeToggled: boolean;
  form: UseFormReturn;
  propertySettings: Record<string, PropertySettings> | null;
  enableMarkdownForInputWithMention?: boolean;
  dynamicPropsInfo:
    | ({
        connectorName?: string;
        connectorVersion?: string;
        componentType?: string;
        actionOrTriggerName: string;
      } & (
        | {
            placedInside: 'stepSettings';
            updateFormSchema: (
              key: string,
              newFieldSchema: ConnectorPropertyMap,
            ) => void;
            updatePropertySettingsSchema: (
              schema: ConnectorPropertyMap,
              propertyName: string,
              form: UseFormReturn,
            ) => void;
          }
        | {
            placedInside: 'predefinedAgentInputs';
            updateFormSchema: null;
            updatePropertySettingsSchema: null;
          }
      ))
    | null;
};

const VALUE_TYPE_EDITORS: Partial<
  Record<
    PropertyExecutionType,
    (params: ValueTypeEditorParams) => React.ReactNode
  >
> = {
  [PropertyExecutionType.STRING]: (params) => (
    <FormControl>
      <Input
        {...params.field}
        value={typeof params.field.value === 'string' ? params.field.value : ''}
        disabled={params.disabled}
        placeholder={t('String')}
      />
    </FormControl>
  ),
  [PropertyExecutionType.NUMBER]: (params) => (
    <FormControl>
      <Input
        {...params.field}
        type="number"
        value={typeof params.field.value === 'number' ? params.field.value : ''}
        onChange={(event) =>
          params.field.onChange(
            event.target.value === '' ? '' : Number(event.target.value),
          )
        }
        disabled={params.disabled}
        placeholder={t('Number')}
      />
    </FormControl>
  ),
  [PropertyExecutionType.BOOLEAN]: (params) => (
    <FormControl>
      <Switch
        checked={params.field.value === true}
        onCheckedChange={params.field.onChange}
        disabled={params.disabled}
      />
    </FormControl>
  ),
  [PropertyExecutionType.OBJECT]: (params) => (
    <JsonEditor field={params.field} readonly={params.disabled}></JsonEditor>
  ),
  [PropertyExecutionType.ARRAY]: (params) => (
    <JsonEditor field={params.field} readonly={params.disabled}></JsonEditor>
  ),
  [PropertyExecutionType.NULL]: () => (
    <div className="rounded-md border border-dashed px-3 py-2 font-mono text-xs text-muted-foreground">
      null
    </div>
  ),
};

type ValueTypeEditorParams = {
  field: ControllerRenderProps;
  disabled: boolean;
};
