import {
  formErrors,
  isNil,
  SolutionConfigItem,
  SolutionConfigType,
  SolutionPackage,
  solutionUtils,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import { Skeleton } from '@/components/ui/skeleton';
import { solutionsHooks, solutionsUtils } from '@/features/solutions';
import { cn } from '@/lib/utils';

import { WizardFooter } from './wizard-parts';

function ConfigStep({
  solutionId,
  projectId,
  pkg,
  config,
  onBack,
  onNext,
}: ConfigStepProps) {
  const items = pkg.config;
  const linked = items.some((item) => !isNil(item.workflowFrom));
  const preview = solutionsHooks.useInstallPreview({
    id: solutionId,
    request: { projectId, connections: {}, config: {} },
    enabled: linked,
  });
  const choicesOf = (key: string) =>
    preview.data?.configChoices.find((choice) => choice.key === key)?.options ??
    [];
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
                <FormLabel>
                  {item.label}
                  {solutionsUtils.isConfigRequired(item) && (
                    <span className="text-destructive"> *</span>
                  )}
                </FormLabel>
                {isNil(item.workflowFrom) ? (
                  <ConfigInput
                    item={item}
                    value={field.value}
                    onChange={field.onChange}
                  />
                ) : (
                  <LinkedWorkflowInput
                    solutionId={item.workflowFrom.solutionId}
                    options={choicesOf(item.key)}
                    loading={preview.isLoading}
                    refreshing={preview.isFetching}
                    onRefresh={() => void preview.refetch()}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
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

function LinkedWorkflowInput({
  solutionId,
  options,
  loading,
  refreshing,
  onRefresh,
  value,
  onChange,
}: LinkedWorkflowInputProps) {
  const { data: official } = solutionsHooks.useOfficialSolutions();
  const name =
    official?.find((solution) => solution.id === solutionId)?.name ?? null;
  if (loading) {
    return <Skeleton className="h-9 w-full max-w-80" />;
  }
  if (options.length === 0) {
    return (
      <Alert data-testid="linked-workflow-missing">
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>
            {name
              ? t('linkedSolutionMissingNamed', { name })
              : t('linkedSolutionMissing')}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button asChild type="button" size="sm" variant="outline">
              <Link
                to={`/solutions/${solutionId}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-4" />
                {name
                  ? t('Install {name} first', { name })
                  : t('Install that solution first')}
              </Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              loading={refreshing}
              onClick={onRefresh}
            >
              <RefreshCw className="size-4" />
              {t('Check again')}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Select
      value={value.length > 0 ? value : EMPTY_CHOICE}
      onValueChange={(next) => onChange(next === EMPTY_CHOICE ? '' : next)}
    >
      <SelectTrigger className="w-full max-w-80">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={EMPTY_CHOICE}>
          {t('solutionConfigLeaveEmpty')}
        </SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
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
        <span>
          {t('Affects: {names}', {
            names: solutionsUtils.joinLabels(affected),
          })}
        </span>
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

const EMPTY_CHOICE = '__empty__';

export { ConfigStep };

type ConfigFormValues = {
  values: string[];
};

type ConfigStepProps = {
  solutionId: string;
  projectId: string;
  pkg: SolutionPackage;
  config: Record<string, string>;
  onBack: () => void;
  onNext: (config: Record<string, string>) => void;
};

type LinkedWorkflowInputProps = {
  solutionId: string;
  options: { value: string; label: string }[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  value: string;
  onChange: (value: string) => void;
};

type ConfigInputProps = {
  item: SolutionConfigItem;
  value: string;
  onChange: (value: string) => void;
};
