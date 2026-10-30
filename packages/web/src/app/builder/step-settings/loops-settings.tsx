import { LoopOnItemsAction } from '@fema-ipaas/shared';
import { t } from 'i18next';
import React from 'react';
import { useFormContext } from 'react-hook-form';

import { Markdown } from '@/components/custom/markdown';
import { FormField, FormItem, FormLabel } from '@/components/ui/form';
import { cn } from '@/lib/utils';

import { TextInputWithMentions } from '../connector-properties/text-input-with-mentions';

import { useShowFieldError } from './field-error-reveal';

type LoopsSettingsProps = {
  readonly: boolean;
};

const LoopsSettings = React.memo(({ readonly }: LoopsSettingsProps) => {
  const form = useFormContext<LoopOnItemsAction>();
  const markdown = t(
    'Select the items to iterate over from the previous step by clicking on the **Items** input, which should be a **list** of items.\n\nThe loop will iterate over each item in the list and execute the next step for every item.',
  );

  return (
    <FormField
      control={form.control}
      name="settings.items"
      render={({ field }) => (
        <FormItem className="flex flex-col gap-2">
          <Markdown markdown={markdown} />
          <ItemsLabel />
          <TextInputWithMentions
            disabled={readonly}
            onChange={field.onChange}
            initialValue={field.value}
            placeholder={t('Select an array of items')}
          ></TextInputWithMentions>
        </FormItem>
      )}
    />
  );
});

function ItemsLabel() {
  const showError = useShowFieldError();
  return (
    <FormLabel
      showRequiredIndicator
      className={cn(!showError && 'data-[error=true]:text-foreground')}
    >
      {t('Items')}
    </FormLabel>
  );
}

LoopsSettings.displayName = 'LoopsSettings';
export { LoopsSettings };
