import { ComponentAction } from '@fema-ipaas/shared';
import { t } from 'i18next';
import React from 'react';

import { componentsHooks } from '@/features/components';

import { ActionErrorHandlingForm } from '../connector-properties/action-error-handling';
import { GenericPropertiesForm } from '../connector-properties/generic-properties-form';

import { useStepSettingsContext } from './step-settings-context';

const ComponentSettings = React.memo(
  ({ step, readonly }: ComponentSettingsProps) => {
    const { selectedStep, updateFormSchema, updatePropertySettingsSchema } =
      useStepSettingsContext();
    const { data: components, isLoading } = componentsHooks.useComponents();

    const component = components?.find(
      (candidate) => candidate.type === step.settings.componentType,
    );

    if (isLoading) {
      return null;
    }

    if (!component) {
      return (
        <div className="text-sm text-muted-foreground">
          {t('This core component is not available on this instance.')}
        </div>
      );
    }

    const hasProps = Object.keys(component.props).length > 0;

    return (
      <div className="flex flex-col gap-4 w-full">
        {hasProps && (
          <GenericPropertiesForm
            key={component.type}
            prefixValue={'settings.input'}
            props={component.props}
            propertySettings={selectedStep.settings.propertySettings}
            disabled={readonly}
            useMentionTextInput={true}
            dynamicPropsInfo={{
              componentType: component.type,
              actionOrTriggerName: component.type,
              placedInside: 'stepSettings',
              updateFormSchema,
              updatePropertySettingsSchema,
            }}
          />
        )}
        <ActionErrorHandlingForm
          hideContinueOnFailure={false}
          hideRetryOnFailure={false}
          disabled={readonly}
        />
      </div>
    );
  },
);

ComponentSettings.displayName = 'ComponentSettings';
export { ComponentSettings };

type ComponentSettingsProps = {
  step: ComponentAction;
  readonly: boolean;
};
