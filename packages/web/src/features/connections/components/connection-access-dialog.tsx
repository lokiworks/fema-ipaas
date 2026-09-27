import { isNil } from '@fema-ipaas/core-utils';
import {
  ConnectionDetail,
  TenantRole,
  UpdateConnectionAccessRequestBody,
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  connectionsMutations,
  connectionsQueries,
} from '@/features/connections/hooks/connections-hooks';
import { projectCollectionUtils } from '@/features/projects';
import { userHooks } from '@/hooks/user-hooks';

export function ConnectionAccessDialog({
  connectionId,
  open,
  onOpenChange,
}: {
  connectionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <ConnectionAccessForm
          key={open ? 'open' : 'closed'}
          connectionId={connectionId}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ConnectionAccessForm({
  connectionId,
  onDone,
}: {
  connectionId: string;
  onDone: () => void;
}) {
  const { data: detail } = connectionsQueries.useConnectionDetail({
    connectionId,
  });

  if (isNil(detail)) {
    return null;
  }

  return (
    <ConnectionAccessFormFields
      connectionId={connectionId}
      detail={detail}
      onDone={onDone}
    />
  );
}

function ConnectionAccessFormFields({
  connectionId,
  detail,
  onDone,
}: {
  connectionId: string;
  detail: ConnectionDetail;
  onDone: () => void;
}) {
  const { data: myProjects } = projectCollectionUtils.useAll();
  const tenantRole = userHooks.getCurrentUserTenantRole();
  const isTenantAdmin = tenantRole === TenantRole.ADMIN;
  const { mutateAsync, isPending } =
    connectionsMutations.useUpdateConnectionAccess({ connectionId });

  const form = useForm<UpdateConnectionAccessRequestBody>({
    resolver: zodResolver(UpdateConnectionAccessRequestBody),
    defaultValues: {
      allProjects: detail.allProjects,
      projectIds: detail.projectIds,
      projectMembersPermission: detail.projectMembersPermission,
    },
    mode: 'onChange',
  });

  const allProjects = form.watch('allProjects');
  const projectIds = form.watch('projectIds');

  const { data: impact } = connectionsQueries.useConnectionAccessImpact({
    connectionId,
    allProjects,
    projectIds,
    enabled: !allProjects,
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    await mutateAsync(values);
    onDone();
  });

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <DialogHeader>
          <DialogTitle>{t('Available projects')}</DialogTitle>
          <DialogDescription>
            {t(
              'Choose which projects can select this connection in their workflows.',
            )}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="allProjects"
          render={({ field }) => (
            <FormItem>
              <RadioGroup
                value={field.value ? 'ALL' : 'SPECIFIC'}
                onValueChange={(value) => field.onChange(value === 'ALL')}
                className="flex flex-col gap-2"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="SPECIFIC" />
                  {t('Specific projects')}
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label
                      className="flex items-center gap-2 text-sm aria-disabled:opacity-60"
                      aria-disabled={!isTenantAdmin}
                    >
                      <RadioGroupItem value="ALL" disabled={!isTenantAdmin} />
                      {t('All projects')}
                    </label>
                  </TooltipTrigger>
                  {!isTenantAdmin && (
                    <TooltipContent>
                      {t(
                        'Only tenant admins can make a connection available to all projects',
                      )}
                    </TooltipContent>
                  )}
                </Tooltip>
              </RadioGroup>
            </FormItem>
          )}
        />
        {!allProjects && (
          <FormField
            control={form.control}
            name="projectIds"
            render={({ field }) => (
              <FormItem>
                <MultiSelect
                  value={field.value}
                  onValueChange={(value) => field.onChange(value)}
                  items={myProjects.map((project) => ({
                    value: project.id,
                    label: project.displayName,
                  }))}
                >
                  <MultiSelectTrigger>
                    <MultiSelectValue
                      placeholder={t(
                        'Select projects that can use this connection',
                      )}
                    />
                  </MultiSelectTrigger>
                  <MultiSelectContent>
                    <MultiSelectSearch placeholder={t('Search...')} />
                    <MultiSelectList>
                      <MultiSelectEmpty>{t('No results')}</MultiSelectEmpty>
                      {myProjects.map((project) => (
                        <MultiSelectItem key={project.id} value={project.id}>
                          {project.displayName}
                        </MultiSelectItem>
                      ))}
                    </MultiSelectList>
                  </MultiSelectContent>
                </MultiSelect>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        {impact &&
          impact.lostWorkflows.length + impact.hiddenLostWorkflowCount > 0 && (
            <Alert variant="warning">
              <AlertDescription>
                {t(
                  'After this change, {count} workflows will no longer be able to use this connection because their project is not in scope anymore.',
                  {
                    count:
                      impact.lostWorkflows.length +
                      impact.hiddenLostWorkflowCount,
                  },
                )}
              </AlertDescription>
            </Alert>
          )}
        {form.formState.errors.root?.serverError && (
          <FormMessage>
            {form.formState.errors.root.serverError.message}
          </FormMessage>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
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
