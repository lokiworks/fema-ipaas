import { Permission } from '@fema-ipaas/core-utils';
import { UpdateProjectTenantRequest } from '@fema-ipaas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { internalErrorToast } from '@/components/ui/sonner';
import { Switch } from '@/components/ui/switch';
import { globalConnectionsQueries } from '@/features/connections/hooks/global-connections-hooks';
import { projectCollectionUtils } from '@/features/projects/stores/project-collection';
import { useAuthorization } from '@/hooks/authorization-hooks';

interface EditProjectDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  initialValues?: {
    projectName?: string;
    externalId?: string;
    notifyWorkflowOwnerOnFailure?: boolean;
  };
}

export function EditProjectDialog({
  open,
  onClose,
  projectId,
  initialValues,
}: EditProjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          {' '}
          <DialogTitle>
            {t('Edit')} {initialValues?.projectName}
          </DialogTitle>
        </DialogHeader>

        <EditProjectForm
          onClose={onClose}
          projectId={projectId}
          initialValues={initialValues}
        />
      </DialogContent>
    </Dialog>
  );
}

const EditProjectForm = ({
  onClose,
  projectId,
  initialValues,
}: {
  onClose: () => void;
  projectId: string;
  initialValues?: EditProjectDialogProps['initialValues'];
}) => {
  const { checkAccess } = useAuthorization();
  const queryClient = useQueryClient();

  const { mutate, isPending } = projectCollectionUtils.useUpdateProject(
    () => {
      queryClient.invalidateQueries({
        queryKey: globalConnectionsQueries.getGlobalConnectionsQueryKey([]),
      });
      toast.success(t('Your changes have been saved.'), {
        duration: 3000,
      });
      onClose();
    },
    (error) => {
      console.error(error);
      internalErrorToast();
    },
  );

  const form = useForm<UpdateProjectTenantRequest>({
    defaultValues: {
      displayName: initialValues?.projectName,
      externalId: initialValues?.externalId,
      notifyWorkflowOwnerOnFailure:
        initialValues?.notifyWorkflowOwnerOnFailure ?? false,
    },
    disabled: checkAccess(Permission.WRITE_PROJECT) === false,
  });

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => {
          mutate({
            projectId,
            request: {
              displayName: values.displayName,
              externalId: values.externalId,
              notifyWorkflowOwnerOnFailure: values.notifyWorkflowOwnerOnFailure,
            },
          });
        })}
      >
        <FormField
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <Label htmlFor="displayName">{t('Project Name')}</Label>
              <Input
                {...field}
                id="displayName"
                placeholder={t('Project Name')}
                className="rounded-sm"
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          name="notifyWorkflowOwnerOnFailure"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <Label htmlFor="notifyWorkflowOwnerOnFailure">
                  {t('Email the project owner when a workflow fails')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'At most one email per workflow per hour. Requires SMTP to be configured.',
                  )}
                </p>
              </div>
              <Switch
                id="notifyWorkflowOwnerOnFailure"
                checked={field.value}
                disabled={field.disabled}
                onCheckedChange={field.onChange}
              />
            </FormItem>
          )}
        />

        <DialogFooter className="justify-end mt-6">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" disabled={isPending} loading={isPending}>
            {t('Save')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
};
