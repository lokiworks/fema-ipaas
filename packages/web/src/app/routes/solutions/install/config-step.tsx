import {
  formErrors,
  SolutionConfigItem,
  SolutionConfigType,
  SolutionPackage,
  solutionUtils,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { WizardFooter } from './wizard-parts';

function ConfigStep({ pkg, config, onBack, onNext }: ConfigStepProps) {
  const items = pkg.config;
  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(buildSchema(items)),
    mode: 'onChange',
    defaultValues: defaultValues({ items, config }),
  });

  return (
    <Form {...form}>
      <form
        className="flex max-w-3xl flex-col gap-6"
        onSubmit={form.handleSubmit((values) =>
          onNext(toConfig({ items, values: values.values })),
        )}
      >
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('This solution has nothing to configure.')}
          </p>
        )}
        {items.map((item, index) => (
          <FormField
            key={item.key}
            control={form.control}
            name={`values.${index}`}
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2">
                <FormLabel>{item.label}</FormLabel>
                <ConfigInput
                  item={item}
                  value={field.value}
                  onChange={field.onChange}
                />
                <ConfigHint item={item} pkg={pkg} />
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
        <WizardFooter
          onBack={onBack}
          nextType="submit"
          nextDisabled={!form.formState.isValid}
        />
      </form>
    </Form>
  );
}

function ConfigInput({ item, value, onChange }: ConfigInputProps) {
  switch (item.type) {
    case SolutionConfigType.TEXT:
      return (
        <Input
          className="w-full max-w-80"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case SolutionConfigType.SELECT:
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="w-full max-w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {item.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case SolutionConfigType.RADIO:
      return (
        <RadioGroup value={value} onValueChange={onChange}>
          {item.options.map((option) => {
            const id = `solution-config-${item.key}-${option.value}`;
            return (
              <div key={option.value} className="flex items-start gap-2">
                <RadioGroupItem id={id} value={option.value} className="mt-1" />
                <Label
                  htmlFor={id}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className={cn(option.danger && 'text-destructive')}>
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="text-xs font-normal text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      );
  }
}

function ConfigHint({
  item,
  pkg,
}: {
  item: SolutionConfigItem;
  pkg: SolutionPackage;
}) {
  const affected = item.affectsWorkflows.map(
    (key) =>
      pkg.workflows.find((workflow) => workflow.key === key)?.name ?? key,
  );
  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      {item.hint && <span>{item.hint}</span>}
      {affected.length > 0 && (
        <span>{t('Affects: {names}', { names: affected.join(', ') })}</span>
      )}
    </div>
  );
}

function buildSchema(items: SolutionConfigItem[]) {
  return z.object({ values: z.array(z.string()) }).superRefine((data, ctx) => {
    const resolved = solutionUtils.resolveConfig({
      items,
      provided: toConfig({ items, values: data.values }),
    });
    resolved.errors.forEach((error) => {
      ctx.addIssue({
        code: 'custom',
        path: ['values', items.findIndex((item) => item.key === error.key)],
        message:
          error.message === 'required'
            ? formErrors.required
            : 'Choose one of the listed options',
      });
    });
  });
}

function defaultValues({
  items,
  config,
}: {
  items: SolutionConfigItem[];
  config: Record<string, string>;
}): ConfigFormValues {
  return { values: items.map((item) => config[item.key] ?? item.defaultValue) };
}

function toConfig({
  items,
  values,
}: {
  items: SolutionConfigItem[];
  values: string[];
}): Record<string, string> {
  return Object.fromEntries(
    items.map((item, index) => [item.key, values[index] ?? '']),
  );
}

export { ConfigStep };

type ConfigFormValues = {
  values: string[];
};

type ConfigStepProps = {
  pkg: SolutionPackage;
  config: Record<string, string>;
  onBack: () => void;
  onNext: (config: Record<string, string>) => void;
};

type ConfigInputProps = {
  item: SolutionConfigItem;
  value: string;
  onChange: (value: string) => void;
};
