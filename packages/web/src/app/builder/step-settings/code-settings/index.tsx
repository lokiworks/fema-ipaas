import { CodeAction, MarkdownVariant } from '@fema-ipaas/shared';
import { t } from 'i18next';
import React from 'react';
import { useFormContext } from 'react-hook-form';

import { DictionaryInput } from '@/components/custom/dictionary-input';
import { Markdown } from '@/components/custom/markdown';
import {
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

import { TextInputWithMentions } from '../../connector-properties/text-input-with-mentions';

import { CodeEditor } from './code-editor';

type CodeSettingsProps = {
  readonly: boolean;
};

const CodeSettings = React.memo(({ readonly }: CodeSettingsProps) => {
  const form = useFormContext<CodeAction>();
  const markdown = t('codeStepInputsHelp');
  const warningMarkdown = t('codeStepEntryWarning');

  return (
    <div className="flex flex-col gap-4">
      <FormField
        control={form.control}
        name="settings.input"
        render={({ field }) => (
          <FormItem>
            <div className="pb-4">
              <Markdown markdown={markdown} variant={MarkdownVariant.INFO} />
            </div>
            <div className="flex items-center justify-between mb-2!">
              <FormLabel>{t('Inputs')}</FormLabel>
            </div>

            <DictionaryInput
              disabled={readonly}
              values={field.value}
              onChange={field.onChange}
              keyInputClassName="h-[38px]"
              renderValueInput={({ value, onChange, disabled }) => (
                <TextInputWithMentions
                  initialValue={value}
                  disabled={disabled}
                  onChange={onChange}
                />
              )}
            />
            <FormMessage />
          </FormItem>
        )}
      />

      <div>
        <Markdown
          markdown={warningMarkdown}
          variant={MarkdownVariant.WARNING}
        />
      </div>
      <FormField
        control={form.control}
        name="settings.sourceCode"
        render={({ field }) => (
          <FormItem>
            <CodeEditor
              sourceCode={field.value}
              onChange={field.onChange}
              readonly={readonly}
            ></CodeEditor>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
});
CodeSettings.displayName = 'CodeSettings';
export { CodeSettings };
