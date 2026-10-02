import {
  formErrors,
  SOLUTION_NAME_MAX_LENGTH,
  SOLUTION_SUMMARY_MAX_LENGTH,
  SolutionVisibility,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { Plus, X } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { getProjectName, projectCollectionUtils } from '@/features/projects';
import {
  projectDirectoryHooks,
  projectDirectoryUtils,
} from '@/features/projects/api/project-directory-api';
import { authenticationSession } from '@/lib/authentication-session';

import { solutionsHooks } from '../hooks/solutions-hooks';
import { solutionsUtils } from '../utils/solutions-utils';

function GenerateSolutionDialog({
  open,
  onOpenChange,
  onCreated,
}: GenerateSolutionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <GenerateSolutionForm
          key={open ? 'open' : 'closed'}
          onCancel={() => onOpenChange(false)}
          onCreated={(id) => {
            onOpenChange(false);
            onCreated(id);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function GenerateSolutionForm({ onCancel, onCreated }: GenerateFormProps) {
  const { data: projects } = projectCollectionUtils.useAll();
  const { data: directory } = projectDirectoryHooks.useDirectory();
  const { data: existing } = solutionsHooks.useSolutions();
  const form = useForm<GenerateFormValues>({
    resolver: zodResolver(GenerateFormSchema),
    mode: 'onChange',
    defaultValues: defaultValues(),
  });
  const manualChecks = useFieldArray({
    control: form.control,
    name: 'manualChecks',
  });
  const watchedProjectId = form.watch('projectId');
  const editableIds = new Set(
    (directory ?? [])
      .filter(projectDirectoryUtils.canEdit)
      .map((project) => project.id),
  );
  const choices = projects.filter((project) => editableIds.has(project.id));
  const projectId = choices.some((project) => project.id === watchedProjectId)
    ? watchedProjectId
    : '';
  const { mutate: create, isPending } = solutionsHooks.useCreateFromProject({
    onSuccess: onCreated,
  });
  const categories = solutionsUtils.categoriesOf(existing ?? []);

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          create({
            ...values,
            manualChecks: values.manualChecks.map(({ label, who }) => ({
              label,
              ...(who.length > 0 ? { who } : {}),
            })),
          }),
        )}
      >
        <DialogHeader>
          <DialogTitle>{t('Create solution from project')}</DialogTitle>
          <DialogDescription>
            {t(
              'Package published workflows into a solution. Whoever installs it picks their own connections. Credentials, variable values and run logs are not included.',
            )}
          </DialogDescription>
        </DialogHeader>

        <FormField
          control={form.control}
          name="projectId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Source project')}</FormLabel>
              <Select
                value={projectId}
                onValueChange={(value) => {
                  field.onChange(value);
                  form.setValue('workflowIds', [], { shouldValidate: true });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('Select a project')} />
                </SelectTrigger>
                <SelectContent>
                  {choices.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {getProjectName(project)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="workflowIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Published workflows to include')}</FormLabel>
              <PublishedWorkflowPicker
                key={projectId}
                projectId={projectId}
                value={field.value}
                onChange={field.onChange}
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Name')}</FormLabel>
              <Input {...field} maxLength={SOLUTION_NAME_MAX_LENGTH} />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="summary"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Summary')}</FormLabel>
              <Textarea
                {...field}
                rows={2}
                maxLength={SOLUTION_SUMMARY_MAX_LENGTH}
                placeholder={t(
                  'What problem it solves and what happens after installing',
                )}
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Category')}</FormLabel>
              <Input {...field} />
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {categories.map((category) => (
                    <Button
                      key={category}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        form.setValue('category', category, {
                          shouldValidate: true,
                        })
                      }
                    >
                      {category}
                    </Button>
                  ))}
                </div>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="visibility"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Who can see it')}</FormLabel>
              <RadioGroup value={field.value} onValueChange={field.onChange}>
                <VisibilityOption
                  value={SolutionVisibility.TENANT}
                  label={t('Everyone in the organization')}
                  description={t(
                    'They can find it in the solution library and install it',
                  )}
                />
                <VisibilityOption
                  value={SolutionVisibility.PROJECT}
                  label={t('Members of the source project')}
                  description={t('Only people who can see the source project')}
                />
              </RadioGroup>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col gap-2">
          <Label>{t('Checks for the installer')}</Label>
          <p className="text-xs text-muted-foreground">
            {t(
              'Connection checks are added automatically. Add what an administrator of the other system has to do first.',
            )}
          </p>
          {manualChecks.fields.map((item, index) => (
            <div key={item.id} className="flex items-start gap-2">
              <FormField
                control={form.control}
                name={`manualChecks.${index}.label`}
                render={({ field }) => (
                  <FormItem className="grow">
                    <Input
                      {...field}
                      placeholder={t('For example: app has contact scope')}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`manualChecks.${index}.who`}
                render={({ field }) => (
                  <FormItem className="w-40">
                    <Input {...field} placeholder={t('Who handles it')} />
                  </FormItem>
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('Remove')}
                onClick={() => manualChecks.remove(index)}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => manualChecks.append({ label: '', who: '' })}
            >
              <Plus className="size-4" />
              {t('Add check')}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isPending}>
            {t('Create solution')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function PublishedWorkflowPicker({
  projectId,
  value,
  onChange,
}: PublishedWorkflowPickerProps) {
  const { data: workflows, isLoading } =
    solutionsHooks.usePublishedWorkflows(projectId);

  if (projectId.length === 0) {
    return null;
  }
  if (isLoading) {
    return <Skeleton className="h-16 w-full" />;
  }
  if ((workflows ?? []).length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('This project has no published workflows yet. Publish one first.')}
      </p>
    );
  }
  return (
    <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border p-2">
      {(workflows ?? []).map((workflow) => (
        <label
          key={workflow.id}
          className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-sm hover:bg-accent"
        >
          <Checkbox
            checked={value.includes(workflow.id)}
            onCheckedChange={(checked) =>
              onChange(
                checked === true
                  ? [...value, workflow.id]
                  : value.filter((id) => id !== workflow.id),
              )
            }
          />
          <span className="truncate">{workflow.version.displayName}</span>
        </label>
      ))}
    </div>
  );
}

function VisibilityOption({
  value,
  label,
  description,
}: {
  value: SolutionVisibility;
  label: string;
  description: string;
}) {
  const id = `solution-visibility-${value}`;
  return (
    <div className="flex items-start gap-2">
      <RadioGroupItem id={id} value={value} className="mt-1" />
      <Label htmlFor={id} className="flex flex-col items-start gap-0.5">
        <span>{label}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {description}
        </span>
      </Label>
    </div>
  );
}

function defaultValues(): GenerateFormValues {
  return {
    projectId: authenticationSession.getProjectId() ?? '',
    workflowIds: [],
    name: '',
    summary: '',
    category: '',
    visibility: SolutionVisibility.TENANT,
    manualChecks: [],
  };
}

const GenerateFormSchema = z.object({
  projectId: z.string().min(1, formErrors.required),
  workflowIds: z
    .array(z.string())
    .min(1, 'Select at least one published workflow'),
  name: z
    .string()
    .trim()
    .min(1, formErrors.required)
    .max(SOLUTION_NAME_MAX_LENGTH, 'Name is too long'),
  summary: z.string().max(SOLUTION_SUMMARY_MAX_LENGTH, 'Summary is too long'),
  category: z.string().trim().min(1, formErrors.required),
  visibility: z.enum(SolutionVisibility),
  manualChecks: z.array(
    z.object({
      label: z.string().trim().min(1, formErrors.required),
      who: z.string().trim(),
    }),
  ),
});

export { GenerateSolutionDialog };

type GenerateFormValues = z.infer<typeof GenerateFormSchema>;

type GenerateSolutionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
};

type GenerateFormProps = {
  onCancel: () => void;
  onCreated: (id: string) => void;
};

type PublishedWorkflowPickerProps = {
  projectId: string;
  value: string[];
  onChange: (value: string[]) => void;
};
