import { OperatorTenantSummary } from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { internalErrorMessage } from '@/components/ui/sonner';
import {
  LimitFields,
  LimitsFormValues,
  operatorHooks,
  operatorSchemas,
  operatorUtils,
} from '@/features/operator';
import { FormServerError } from '@/features/tenant-access';
import { api } from '@/lib/api';

export function LimitsDialog({
  tenant,
  open,
  onOpenChange,
}: {
  tenant: OperatorTenantSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <LimitsForm
          key={open ? tenant.id : 'closed'}
          tenant={tenant}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function LimitsForm({
  tenant,
  onClose,
}: {
  tenant: OperatorTenantSummary;
  onClose: () => void;
}) {
  const form = useForm<LimitsFormValues>({
    mode: 'onChange',
    resolver: zodResolver(operatorSchemas.limitsForm),
    defaultValues: { limits: operatorUtils.limitsInputsOf(tenant) },
  });
  const { mutate: save, isPending } = operatorHooks.useUpdateLimits({
    onSaved: onClose,
    onError: (error) =>
      form.setError('root.serverError', {
        type: 'manual',
        message: api.extractServerErrorMessage(error, internalErrorMessage()),
      }),
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) => {
          form.clearErrors('root.serverError');
          const built = operatorUtils.buildLimitsUpdate(values.limits);
          if (built.ok) {
            save({ id: tenant.id, request: built.limits });
          }
        })}
      >
        <DialogHeader>
          <DialogTitle>{t('Edit limits')}</DialogTitle>
          <DialogDescription>
            {t('Limits for {name}. They apply to new items right away.', {
              name: tenant.name,
            })}
          </DialogDescription>
        </DialogHeader>
        <LimitFields />
        <FormServerError
          message={form.formState.errors.root?.serverError?.message}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isPending} data-testid="limits-save">
            {t('Save')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
