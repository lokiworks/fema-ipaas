import {
  ConnectionWithoutSensitiveData,
  CreatePlatformWorkspaceRequest,
  WorkspaceWithLimits,
} from '@fema/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SkeletonList } from '@/components/ui/skeleton';
import { internalErrorToast } from '@/components/ui/sonner';
import { globalConnectionsQueries } from '@/features/connections';
import { workspaceCollectionUtils } from '@/features/workspaces';
import { platformHooks } from '@/hooks/platform-hooks';

type NewWorkspaceDialogProps = {
  children: React.ReactNode;
  onCreate?: (workspace: WorkspaceWithLimits) => void;
};

export const NewWorkspaceDialog = (props: NewWorkspaceDialogProps) => {
  const [open, setOpen] = useState(false);
  const { platform } = platformHooks.useCurrentPlatform();
  const globalConnectionsEnabled = platform.plan.globalConnectionsEnabled;

  const { data: globalConnectionsPage, isLoading: isLoadingConnections } =
    globalConnectionsQueries.useGlobalConnections({
      request: { limit: 9999 },
      extraKeys: [],
    });

  const globalConnections = globalConnectionsPage?.data ?? [];

  return (
    <Dialog key={open ? 'open' : 'closed'} open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{props.children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Create Workspace')}</DialogTitle>
          <DialogDescription>
            {t(
              'Set up a new workspace to organize your automations and connections.',
            )}
          </DialogDescription>
        </DialogHeader>
        {(!isLoadingConnections || !globalConnectionsEnabled) && (
          <NewWorkspaceForm
            setOpen={setOpen}
            globalConnections={globalConnections}
            globalConnectionsEnabled={globalConnectionsEnabled}
            onCreate={props.onCreate}
          />
        )}
        {isLoadingConnections && globalConnectionsEnabled && (
          <SkeletonList numberOfItems={3} className="h-10" />
        )}
      </DialogContent>
    </Dialog>
  );
};

const NewWorkspaceForm = ({
  onCreate,
  setOpen,
}: Omit<NewWorkspaceDialogProps, 'children'> & {
  setOpen: (open: boolean) => void;
  globalConnections: ConnectionWithoutSensitiveData[];
  globalConnectionsEnabled: boolean;
}) => {
  const queryClient = useQueryClient();

  const form = useForm<CreatePlatformWorkspaceRequest>({
    resolver: zodResolver(
      z.object({
        displayName: z.string().min(1, t('Name is required')),
        alertReceiverEmail: z
          .email(t('Invalid email'))
          .nullable()
          .optional()
          .or(z.literal('')),
      }),
    ),
    defaultValues: {},
  });

  const handleCreate = () => {
    mutate(form.getValues());
  };

  const { mutate, isPending } = workspaceCollectionUtils.useCreateWorkspace(
    (data) => {
      onCreate?.(data);
      setOpen(false);
      queryClient.invalidateQueries({
        queryKey: globalConnectionsQueries.getGlobalConnectionsQueryKey([]),
      });
    },
    (error) => {
      console.error(error);
      internalErrorToast();
    },
  );

  return (
    <>
      <Form {...form}>
        <form
          className="grid space-y-4"
          onSubmit={(e) => form.handleSubmit(handleCreate)(e)}
        >
          <FormField
            name="displayName"
            render={({ field }) => (
              <FormItem className="grid space-y-2">
                <Label htmlFor="displayName" showRequiredIndicator>
                  {t('Workspace Name')}
                </Label>
                <Input
                  {...field}
                  id="displayName"
                  placeholder={t('Workspace Name')}
                  className="rounded-sm"
                />
              </FormItem>
            )}
          />
          <FormField
            name="alertReceiverEmail"
            render={({ field }) => (
              <FormItem className="grid space-y-2">
                <Label htmlFor="alertReceiverEmail">
                  {t('Alert Receiver Email')}
                </Label>
                <Input
                  {...field}
                  id="alertReceiverEmail"
                  type="email"
                  placeholder="alerts@example.com"
                  className="rounded-sm"
                  value={field.value ?? ''}
                />
                <span className="text-xs text-muted-foreground">
                  {t('Receives workflow failure emails for this workspace.')}
                </span>
                <FormMessage />
              </FormItem>
            )}
          />
          {form?.formState?.errors?.root?.serverError && (
            <FormMessage>
              {form.formState.errors.root.serverError.message}
            </FormMessage>
          )}
          <DialogFooter>
            <Button
              variant={'outline'}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setOpen(false);
              }}
            >
              {t('Cancel')}
            </Button>
            <Button
              disabled={isPending}
              loading={isPending}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                form.handleSubmit(handleCreate)(e);
              }}
            >
              {t('Create Workspace')}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
};
