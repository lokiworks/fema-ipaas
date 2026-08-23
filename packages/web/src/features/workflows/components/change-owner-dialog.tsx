import { WorkflowOperationType, PopulatedWorkflow } from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { useEffect, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { FormField, FormItem, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { workflowsApi } from '../api/workflows-api';

const ChangeOwnerFormSchema = z.object({
  ownerId: z.string({ message: t('Please select an owner') }),
});

type ChangeOwnerFormSchema = z.infer<typeof ChangeOwnerFormSchema>;

type ChangeOwnerDialogProps = {
  children: React.ReactNode;
  workflow: PopulatedWorkflow;
  onOwnerChange: () => void;
};

const ChangeOwnerDialog = ({
  children,
  workflow,
  onOwnerChange,
}: ChangeOwnerDialogProps) => {
  const workspaceMembers: {
    userId: string;
    user: { firstName: string; lastName: string; email: string };
  }[] = [];
  const isLoading = false;
  const [isDialogOpened, setIsDialogOpened] = useState(false);

  const form = useForm<ChangeOwnerFormSchema>({
    resolver: zodResolver(ChangeOwnerFormSchema),
    defaultValues: {
      ownerId: workflow.ownerId ?? '',
    },
  });

  useEffect(() => {
    if (isDialogOpened) {
      form.reset({
        ownerId: workflow.ownerId ?? '',
      });
    }
  }, [isDialogOpened, workflow.ownerId, form]);
  const { mutate, isPending } = useMutation<
    PopulatedWorkflow,
    Error,
    ChangeOwnerFormSchema
  >({
    mutationFn: async (data) => {
      return await workflowsApi.update(workflow.id, {
        type: WorkflowOperationType.UPDATE_OWNER,
        request: {
          ownerId: data.ownerId,
        },
      });
    },
    onSuccess: () => {
      onOwnerChange();
      setIsDialogOpened(false);
      toast.success(t('Workflow owner has been updated'));
    },
  });

  return (
    <Dialog onOpenChange={setIsDialogOpened} open={isDialogOpened}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Change Workflow Owner')}</DialogTitle>
          <DialogDescription>
            {t('Select a team member to take ownership of this workflow.')}
          </DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit((data) => mutate(data))}>
            <FormField
              control={form.control}
              name="ownerId"
              render={({ field }) => (
                <FormItem>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || undefined}
                    disabled={
                      isLoading ||
                      !workspaceMembers ||
                      workspaceMembers.length === 0
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('Select Owner')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {workspaceMembers &&
                          workspaceMembers.length > 0 &&
                          workspaceMembers.map((member) => (
                            <SelectItem
                              key={member.userId}
                              value={member.userId}
                            >
                              {member.user.firstName} {member.user.lastName} (
                              {member.user.email})
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
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
              <Button type="submit" loading={isPending}>
                {t('Transfer')}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
};

export { ChangeOwnerDialog };
