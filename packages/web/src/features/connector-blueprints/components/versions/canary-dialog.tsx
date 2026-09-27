import {
  BlueprintVersionView,
  UpdateBlueprintCanaryRequest,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';

import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectSearch,
  MultiSelectTrigger,
  MultiSelectValue,
} from '@/components/custom/multi-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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

import { connectorBlueprintHooks } from '../../hooks/connector-blueprint-hooks';

export function BlueprintCanaryDialog({
  open,
  onOpenChange,
  blueprintId,
  version,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blueprintId: string;
  version: BlueprintVersionView | null;
}) {
  const { data: projects } = connectorBlueprintHooks.useBlueprintProjects(
    open ? blueprintId : null,
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {version && (
          <CanaryForm
            key={open ? version.id : 'closed'}
            blueprintId={blueprintId}
            version={version}
            projects={projects ?? []}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CanaryForm({
  blueprintId,
  version,
  projects,
  onOpenChange,
}: {
  blueprintId: string;
  version: BlueprintVersionView;
  projects: { id: string; name: string }[];
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate, isPending } =
    connectorBlueprintHooks.useUpdateBlueprintCanary({
      id: blueprintId,
      onSuccess: () => onOpenChange(false),
    });
  const form = useForm<UpdateBlueprintCanaryRequest>({
    resolver: zodResolver(UpdateBlueprintCanaryRequest),
    mode: 'onChange',
    defaultValues: { projectIds: version.canaryProjectIds },
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          mutate({ versionId: version.id, request: values }),
        )}
      >
        <DialogHeader>
          <DialogTitle>
            {t('Adjust canary projects for {version}', {
              version: version.version,
            })}
          </DialogTitle>
        </DialogHeader>
        <FormField
          control={form.control}
          name="projectIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Canary projects')}</FormLabel>
              <MultiSelect
                value={field.value}
                onValueChange={field.onChange}
                items={projects.map((project) => ({
                  value: project.id,
                  label: project.name,
                }))}
              >
                <MultiSelectTrigger>
                  <MultiSelectValue placeholder={t('Select projects')} />
                </MultiSelectTrigger>
                <MultiSelectContent>
                  <MultiSelectSearch placeholder={t('Search...')} />
                  <MultiSelectList>
                    <MultiSelectEmpty>{t('No results')}</MultiSelectEmpty>
                    {projects.map((project) => (
                      <MultiSelectItem key={project.id} value={project.id}>
                        {project.name}
                      </MultiSelectItem>
                    ))}
                  </MultiSelectList>
                </MultiSelectContent>
              </MultiSelect>
              <p className="text-xs text-muted-foreground">
                {t(
                  'These projects use the canary version by default for newly added nodes. Other projects keep using the current fully released version',
                )}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
        <Alert variant="warning">
          <AlertDescription>
            {t(
              'Projects removed from the canary will fail at run time if nodes already use this version there',
            )}
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isPending}>
            {t('Save')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
