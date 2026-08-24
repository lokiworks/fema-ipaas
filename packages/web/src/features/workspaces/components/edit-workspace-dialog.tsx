import { Permission } from '@fema-ipaas/core-utils';
import {
  ConnectionWithoutSensitiveData,
  UpdateWorkspaceTenantRequest,
} from '@fema-ipaas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { GlobalConnectionWarning } from '@/components/custom/global-connection-utils';
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
import { SkeletonList } from '@/components/ui/skeleton';
import { internalErrorToast } from '@/components/ui/sonner';
import { globalConnectionsQueries } from '@/features/connections/hooks/global-connections-hooks';
import { workspaceCollectionUtils } from '@/features/workspaces/stores/workspace-collection';
import { useAuthorization } from '@/hooks/authorization-hooks';

interface EditWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  initialValues?: {
    workspaceName?: string;
    externalId?: string;
  };
}

export function EditWorkspaceDialog({
  open,
  onClose,
  workspaceId,
  initialValues,
}: EditWorkspaceDialogProps) {
  const { data: globalConnectionsPage, isLoading: isLoadingConnections } =
    globalConnectionsQueries.useGlobalConnections({
      request: { limit: 9999 },
      extraKeys: [],
    });

  const globalConnections = globalConnectionsPage?.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          {' '}
          <DialogTitle>
            {t('Edit')} {initialValues?.workspaceName}
          </DialogTitle>
        </DialogHeader>

        {!isLoadingConnections ? (
          <EditWorkspaceForm
            onClose={onClose}
            workspaceId={workspaceId}
            initialValues={initialValues}
            globalConnections={globalConnections}
          />
        ) : (
          <SkeletonList numberOfItems={3} className="h-10" />
        )}
      </DialogContent>
    </Dialog>
  );
}

const EditWorkspaceForm = ({
  onClose,
  workspaceId,
  initialValues,
}: {
  onClose: () => void;
  workspaceId: string;
  initialValues?: EditWorkspaceDialogProps['initialValues'];
  globalConnections: ConnectionWithoutSensitiveData[];
}) => {
  const { checkAccess } = useAuthorization();
  const queryClient = useQueryClient();

  const { mutate, isPending } = workspaceCollectionUtils.useUpdateWorkspace(
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

  const form = useForm<UpdateWorkspaceTenantRequest>({
    defaultValues: {
      displayName: initialValues?.workspaceName,
      externalId: initialValues?.externalId,
    },
    disabled: checkAccess(Permission.WRITE_WORKSPACE) === false,
  });

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => {
          mutate({
            workspaceId,
            request: {
              displayName: values.displayName,
              externalId: values.externalId,
            },
          });
        })}
      >
        <GlobalConnectionWarning />
        <FormField
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <Label htmlFor="displayName">{t('Workspace Name')}</Label>
              <Input
                {...field}
                id="displayName"
                placeholder={t('Workspace Name')}
                className="rounded-sm"
              />
              <FormMessage />
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
