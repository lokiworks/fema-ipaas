import { SAFE_STRING_PATTERN } from '@fema-ipaas/core-utils';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { SubmitHandler, useForm } from 'react-hook-form';

import { tenantApi } from '@/api/tenants-api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authenticationSession } from '@/lib/authentication-session';

type CreateTenantSchema = {
  name: string;
};

function CreateTenantDialogForm({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm<CreateTenantSchema>({
    defaultValues: { name: '' },
    mode: 'onChange',
  });

  const { mutate, isPending } = useMutation({
    mutationFn: tenantApi.createTenant,
    onSuccess: (data) => {
      authenticationSession.saveResponse(data, false);
      window.location.href = '/';
    },
    onError: () => {
      form.setError('root.serverError', {
        message: t('Something went wrong, please try again later'),
      });
    },
  });

  const onSubmit: SubmitHandler<CreateTenantSchema> = (data) => {
    form.clearErrors('root.serverError');
    mutate({ name: data.name.trim() });
  };

  return (
    <Form {...form}>
      <form className="grid space-y-4">
        <FormField
          control={form.control}
          name="name"
          rules={{
            required: t('Tenant name is required'),
            maxLength: {
              value: 100,
              message: t('Tenant name is too long'),
            },
            pattern: {
              value: new RegExp(SAFE_STRING_PATTERN),
              message: t('Tenant name cannot contain "." or "/"'),
            },
          }}
          render={({ field }) => (
            <FormItem className="grid space-y-2">
              <Label htmlFor="createTenantName">{t('Tenant Name')}</Label>
              <Input
                {...field}
                required
                id="createTenantName"
                type="text"
                placeholder={t('My Tenant')}
                className="rounded-sm"
                autoFocus
              />
              <FormMessage />
            </FormItem>
          )}
        />
        {form?.formState?.errors?.root?.serverError && (
          <FormMessage>
            {form.formState.errors.root.serverError.message}
          </FormMessage>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            loading={isPending}
            onClick={(e) => form.handleSubmit(onSubmit)(e)}
          >
            {t('Create Tenant')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function CreateTenantDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Create Tenant')}</DialogTitle>
        </DialogHeader>
        <CreateTenantDialogForm
          key={open ? 'open' : 'closed'}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}
