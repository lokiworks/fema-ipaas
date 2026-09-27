import {
  ConnectorBlueprintDetail,
  TransferBlueprintOwnershipRequest,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';

import { connectorBlueprintHooks } from '../../hooks/connector-blueprint-hooks';

export function TransferOwnershipDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: ConnectorBlueprintDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <TransferOwnershipForm
          key={open ? 'open' : 'closed'}
          detail={detail}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function TransferOwnershipForm({
  detail,
  onDone,
}: {
  detail: ConnectorBlueprintDetail;
  onDone: () => void;
}) {
  const { data: candidates } = connectorBlueprintHooks.useBlueprintCandidates(
    detail.id,
  );
  const options = (candidates ?? []).filter(
    (person) => person.id !== detail.owner?.id,
  );
  const form = useForm<TransferBlueprintOwnershipRequest>({
    resolver: zodResolver(TransferBlueprintOwnershipRequest),
    defaultValues: { ownerId: '' },
    mode: 'onChange',
  });
  const { mutate, isPending } =
    connectorBlueprintHooks.useTransferBlueprintOwnership({
      id: detail.id,
      onSuccess: () => {
        toast.success(t('Ownership transferred'));
        onDone();
      },
      onError: (error) =>
        form.setError('root.serverError', {
          type: 'manual',
          message: api.extractServerErrorMessage(
            error,
            t('Failed to transfer ownership'),
          ),
        }),
    });
  const submit = form.handleSubmit((values) => {
    form.clearErrors('root.serverError');
    mutate(values);
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{t('Transfer ownership')}</DialogTitle>
          <DialogDescription>
            {t('Current owner: {name}', {
              name: detail.owner?.name ?? t('Deleted user'),
            })}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="ownerId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('New owner')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t('Select a member')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {options.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name}
                      {person.email ? ` · ${person.email}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                {t(
                  'Only members with the connector development permission can own a connector. The current owner stays on as a developer.',
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {form.formState.errors.root?.serverError && (
          <p className="text-sm text-destructive">
            {form.formState.errors.root.serverError.message}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isPending}>
            {t('Transfer')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
