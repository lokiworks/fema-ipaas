import {
  McpClientContextKey,
  McpServiceTool,
  McpToolParamMode,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { mcpServiceUiUtils } from '../utils/mcp-service-ui-utils';

function buildToolFormSchema(siblingNames: string[]) {
  return McpServiceTool.omit({ inputSchema: true }).superRefine((tool, ctx) => {
    const errors = mcpServiceUiUtils.toolErrors({ tool, siblingNames });
    if (errors.name) {
      ctx.addIssue({ code: 'custom', path: ['name'], message: errors.name });
    }
    if (errors.title) {
      ctx.addIssue({
        code: 'custom',
        path: ['title'],
        message: errors.title,
      });
    }
    if (errors.description) {
      ctx.addIssue({
        code: 'custom',
        path: ['description'],
        message: errors.description,
      });
    }
    tool.params.forEach((param, index) => {
      const message = errors.params?.[param.name];
      if (message) {
        ctx.addIssue({
          code: 'custom',
          path: ['params', index, 'value'],
          message,
        });
      }
    });
  });
}

const PARAM_MODES = [
  McpToolParamMode.AI,
  McpToolParamMode.FIXED,
  McpToolParamMode.REFERENCE,
  McpToolParamMode.CLIENT_CONTEXT,
];

const CONTEXT_KEYS = [
  McpClientContextKey.USER_EMAIL,
  McpClientContextKey.USER_ID,
  McpClientContextKey.USER_NAME,
  McpClientContextKey.CLIENT_NAME,
];

function McpToolForm({
  source,
  removedParamNames = [],
}: {
  source: ReactNode;
  removedParamNames?: string[];
}) {
  const form = useFormContext<ToolFormValues>();
  const params = useWatch({ control: form.control, name: 'params' });

  return (
    <div className="flex flex-col gap-4">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Tool name')}</FormLabel>
            <FormControl>
              <Input {...field} maxLength={64} className="font-mono" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="title"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Display name')}</FormLabel>
            <FormControl>
              <Input {...field} maxLength={30} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Tool description')}</FormLabel>
            <FormControl>
              <Textarea {...field} rows={3} maxLength={500} />
            </FormControl>
            <p className="text-xs text-muted-foreground">
              {t(
                'Say when the AI should call this tool and what it returns. Under {count} characters is a warning.',
                { count: 10 },
              )}
            </p>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t('Source')}</span>
        {source}
      </div>
      {removedParamNames.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            {t(
              'The source no longer has {names}. Saving removes them from this tool.',
              { names: removedParamNames.join('、') },
            )}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium">
          {t('Tool params ({count})', { count: params?.length ?? 0 })}
        </span>
        {(params ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t('This tool has no params')}
          </p>
        )}
        {(params ?? []).map((param, index) => (
          <ParamRow key={param.name} index={index} />
        ))}
      </div>
    </div>
  );
}

function ParamRow({ index }: { index: number }) {
  const form = useFormContext<ToolFormValues>();
  const mode = useWatch({
    control: form.control,
    name: `params.${index}.mode`,
  });
  const params = useWatch({ control: form.control, name: 'params' });
  const name = params?.[index]?.name ?? '';
  const description = params?.[index]?.description ?? '';
  const otherNames = (params ?? [])
    .filter((param, other) => other !== index)
    .map((param) => param.name);

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm">{name}</span>
        {description && (
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {description}
          </span>
        )}
        <FormField
          control={form.control}
          name={`params.${index}.mode`}
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value);
                if (value === McpToolParamMode.CLIENT_CONTEXT) {
                  form.setValue(
                    `params.${index}.value`,
                    McpClientContextKey.USER_EMAIL,
                  );
                } else if (value === McpToolParamMode.AI) {
                  form.setValue(`params.${index}.value`, undefined);
                } else {
                  form.setValue(`params.${index}.value`, '');
                }
              }}
            >
              <SelectTrigger size="sm" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARAM_MODES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {mcpServiceUiUtils.paramModeLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      {mode === McpToolParamMode.AI && (
        <FormField
          control={form.control}
          name={`params.${index}.hint`}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  maxLength={200}
                  placeholder={t('Hint for the AI (optional)')}
                />
              </FormControl>
            </FormItem>
          )}
        />
      )}
      {mode === McpToolParamMode.FIXED && (
        <FormField
          control={form.control}
          name={`params.${index}.value`}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  placeholder={t('Fixed value, hidden from the AI')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      {mode === McpToolParamMode.REFERENCE && (
        <FormField
          control={form.control}
          name={`params.${index}.value`}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  className="font-mono"
                  placeholder={
                    otherNames[0]
                      ? `{{${otherNames[0]}}}`
                      : t('For example: {example}', { example: '{{summary}}' })
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      {mode === McpToolParamMode.CLIENT_CONTEXT && (
        <FormField
          control={form.control}
          name={`params.${index}.value`}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger size="sm" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTEXT_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {mcpServiceUiUtils.contextKeyLabel(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      )}
    </div>
  );
}

export { buildToolFormSchema, McpToolForm };

export type ToolFormValues = z.infer<ReturnType<typeof buildToolFormSchema>>;
