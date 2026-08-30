import { ConnectorPropertyMap, PropertyType } from '@fema-ipaas/connector-sdk';
import { isNil } from '@fema-ipaas/core-utils';
import {
  AUTHENTICATION_PROPERTY_NAME,
  PropertySettings,
} from '@fema-ipaas/shared';
import deepEqual from 'deep-equal';
import React, { useState, useRef, useContext } from 'react';
import { useFormContext, UseFormReturn, useWatch } from 'react-hook-form';
import { useDeepCompareEffectNoCheck } from 'use-deep-compare-effect';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { SkeletonList } from '@/components/ui/skeleton';
import { internalErrorToast } from '@/components/ui/sonner';
import { connectorsHooks, formUtils } from '@/features/connectors';
import { authenticationSession } from '@/lib/authentication-session';

import { DynamicPropertiesErrorBoundary } from './dynamic-connector-properties-error-boundary';
import { DynamicPropertiesContext } from './dynamic-properties-context';
import { GenericPropertiesForm } from './generic-properties-form';

const removeOptionsFromDropdownPropertiesSchema = (
  schema: ConnectorPropertyMap,
): ConnectorPropertyMap => {
  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => {
      if (
        value.type === PropertyType.STATIC_DROPDOWN ||
        value.type === PropertyType.STATIC_MULTI_SELECT_DROPDOWN
      ) {
        return [key, { ...value, options: { disabled: false, options: [] } }];
      }
      return [key, value];
    }),
  ) as ConnectorPropertyMap;
};

const DynamicPropertiesImplementation = React.memo(
  (props: DynamicPropertiesProps) => {
    const [workflowVersion, readonly] = useBuilderStateContext((state) => [
      state.workflowVersion,
      state.readonly,
    ]);
    const form = useFormContext();
    const watchConfig: Record<string, unknown> = {
      name:
        props.placedInside === 'stepSettings' ? 'settings.input' : undefined,
    };
    const allInputsValues = useWatch(watchConfig);
    const refreshersPropertiesNames = [
      ...props.refreshers,
      AUTHENTICATION_PROPERTY_NAME,
    ];
    const refresherValues = refreshersPropertiesNames.reduce<
      Record<string, unknown>
    >((acc, refresher) => {
      acc[refresher] = allInputsValues[refresher];
      return acc;
    }, {});
    const previousRefresherValues =
      useRef<Record<string, unknown>>(refresherValues);
    const lastKnownValue = useRef<Record<string, unknown> | undefined>(
      undefined,
    );
    const optionsRequestId = useRef(0);
    const { propertyLoadingFinished, propertyLoadingStarted } = useContext(
      DynamicPropertiesContext,
    );
    const [propertyMap, setPropertyMap] = useState<
      ConnectorPropertyMap | undefined
    >(undefined);
    const propertyPrefix =
      props.placedInside === 'stepSettings' ? 'settings.input' : '';
    const { mutate, isPending } =
      connectorsHooks.useConnectorOptions<PropertyType.DYNAMIC>({
        onMutate: () => {
          propertyLoadingStarted(props.propertyName);
        },
        onError: (error) => {
          console.error(error);
          internalErrorToast();
          propertyLoadingFinished(props.propertyName);
        },
        onSuccess: () => {
          propertyLoadingFinished(props.propertyName);
        },
      });

    const clearPropertyValue = () => {
      // the field state won't be cleared if you only unset the parent prop value
      if (propertyMap) {
        Object.keys(propertyMap).forEach((childPropName) => {
          form.setValue(
            prependPrefixToPropertyName({
              propertyName: `${props.propertyName}.${childPropName}`,
              prefix: propertyPrefix,
            }),
            null,
            {
              //never validate for each prop, it can be a long list of props and cause the browser to freeze
              shouldValidate: false,
            },
          );
        });
      }
      form.setValue(
        prependPrefixToPropertyName({
          propertyName: props.propertyName,
          prefix: propertyPrefix,
        }),
        null,
        {
          shouldValidate: true,
        },
      );
    };
    useDeepCompareEffectNoCheck(() => {
      const propertyPath = prependPrefixToPropertyName({
        propertyName: props.propertyName,
        prefix: propertyPrefix,
      });
      const currentValue = form.getValues(propertyPath);
      if (!isNil(currentValue)) {
        lastKnownValue.current = { ...currentValue };
      }
      if (!deepEqual(previousRefresherValues.current, refresherValues)) {
        clearPropertyValue();
      }
      previousRefresherValues.current = refresherValues;
      const requestId = ++optionsRequestId.current;
      const restoreLastKnownValue = () => {
        if (!isNil(lastKnownValue.current)) {
          form.setValue(propertyPath, lastKnownValue.current, {
            shouldValidate: true,
          });
        }
      };
      mutate(
        {
          request: {
            projectId: authenticationSession.getProjectId()!,
            connectorName: props.connectorName,
            connectorVersion: props.connectorVersion,
            componentType: props.componentType,
            propertyName: props.propertyName,
            actionOrTriggerName: props.actionOrTriggerName,
            input: refresherValues,
            workflowVersionId: workflowVersion.id,
            workflowId: workflowVersion.workflowId,
          },
          propertyType: PropertyType.DYNAMIC,
        },
        {
          onSuccess: (response) => {
            if (requestId !== optionsRequestId.current) {
              return;
            }
            const defaultValue = formUtils.getDefaultValueForProperties({
              props: response.options,
              existingInput: lastKnownValue.current ?? {},
              propertySettings: props.propertySettings ?? {},
            });
            setPropertyMap(response.options);
            const schemaWithoutDropdownOptions =
              removeOptionsFromDropdownPropertiesSchema(response.options);
            props.updateFormSchema?.(
              propertyPath,
              schemaWithoutDropdownOptions,
            );

            if (!readonly && props.updatePropertySettingsSchema) {
              props.updatePropertySettingsSchema(
                schemaWithoutDropdownOptions,
                props.propertyName,
                form,
              );
            }
            form.setValue(propertyPath, defaultValue, {
              shouldValidate: true,
              shouldDirty: true,
            });
          },
          onError: () => {
            if (requestId !== optionsRequestId.current) {
              return;
            }
            restoreLastKnownValue();
          },
        },
      );
    }, [refresherValues]);

    return (
      <>
        {isPending && (
          <SkeletonList numberOfItems={3} className="h-7"></SkeletonList>
        )}
        {!isPending && propertyMap && (
          <GenericPropertiesForm
            prefixValue={prependPrefixToPropertyName({
              propertyName: props.propertyName,
              prefix: propertyPrefix,
            })}
            props={propertyMap}
            useMentionTextInput={!isNil(props.propertySettings)}
            disabled={props.disabled}
            propertySettings={props.propertySettings}
            dynamicPropsInfo={null}
            onValueChange={() => {
              form.trigger();
            }}
          ></GenericPropertiesForm>
        )}
      </>
    );
  },
);

const DynamicProperties = React.memo((props: DynamicPropertiesProps) => {
  return (
    <DynamicPropertiesErrorBoundary>
      <DynamicPropertiesImplementation {...props} />
    </DynamicPropertiesErrorBoundary>
  );
});
DynamicPropertiesImplementation.displayName = 'DynamicPropertiesImplementation';
DynamicProperties.displayName = 'DynamicProperties';
export { DynamicProperties };

const prependPrefixToPropertyName = ({
  propertyName,
  prefix,
}: {
  propertyName: string;
  prefix: string;
}) => {
  return prefix.length === 0 ? propertyName : `${prefix}.${propertyName}`;
};

type DynamicPropertiesProps = {
  refreshers: string[];
  propertyName: string;
  connectorName?: string;
  connectorVersion?: string;
  componentType?: string;
  actionOrTriggerName: string;
  disabled: boolean;
  placedInside: 'stepSettings' | 'predefinedAgentInputs';
  updateFormSchema:
    | ((key: string, newFieldSchema: ConnectorPropertyMap) => void)
    | null;
  propertySettings: Record<string, PropertySettings> | null;
  updatePropertySettingsSchema:
    | ((
        schema: ConnectorPropertyMap,
        propertyName: string,
        form: UseFormReturn,
      ) => void)
    | null;
};
