import {
  CONNECTOR_DEMAND_APP_NAME_MAX_LENGTH,
  CONNECTOR_DEMAND_CAPABILITY_MAX_LENGTH,
  CreateConnectorDemandRequestBody,
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { connectorDemandMutations } from '@/features/connector-demands/hooks/connector-demand-hooks';
import { api } from '@/lib/api';

export function ConnectorRequestDialog({
  open,
  onOpenChange,
  presetCapability,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetCapability?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <ConnectorRequestForm
          key={open ? 'open' : 'closed'}
          presetCapability={presetCapability}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ConnectorRequestForm({
  presetCapability,
  onDone,
}: {
  presetCapability?: string;
  onDone: () => void;
}) {
  const form = useForm<CreateConnectorDemandRequestBody>({
    resolver: zodResolver(CreateConnectorDemandRequestBody),
    defaultValues: {
      appName: '',
      capability:
        presetCapability?.slice(0, CONNECTOR_DEMAND_CAPABILITY_MAX_LENGTH) ??
        '',
    },
    mode: 'onChange',
  });
  const { mutate, isPending } =
    connectorDemandMutations.useCreateConnectorDemand({
      onSuccess: () => {
        toast.success(t('The request has been submitted to the tenant admins'));
        onDone();
      },
      onError: (error) => {
        form.setError('root.serverError', {
          type: 'manual',
          message: api.extractServerErrorMessage(
            error,
            'Failed to submit the connector request',
          ),
        });
      },
    });

  const appName = form.watch('appName');
  const capability = form.watch('capability');

  const handleSubmit = form.handleSubmit((values) => {
    form.clearErrors('root.serverError');
    mutate(values);
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
          <DialogTitle>{t('Request a connector')}</DialogTitle>
          <DialogDescription>
            {t(
              'The tenant admins will review the request and decide whether to build a new connector or extend an existing one.',
            )}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="appName"
          render={({ field }) => (
            <FormItem>
              <FormLabel showRequiredIndicator>{t('App name')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoFocus
                  maxLength={CONNECTOR_DEMAND_APP_NAME_MAX_LENGTH}
                  placeholder={t('e.g. DingTalk Yida')}
                />
              </FormControl>
              <div className="text-xs text-muted-foreground text-right">
                {appName.length}/{CONNECTOR_DEMAND_APP_NAME_MAX_LENGTH}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="capability"
          render={({ field }) => (
            <FormItem>
              <FormLabel showRequiredIndicator>
                {t('Capability needed')}
              </FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={4}
                  maxLength={CONNECTOR_DEMAND_CAPABILITY_MAX_LENGTH}
                  placeholder={t(
                    'e.g. Trigger a workflow when a form is submitted; query form entries by condition',
                  )}
                />
              </FormControl>
              <div className="text-xs text-muted-foreground text-right">
                {capability.length}/{CONNECTOR_DEMAND_CAPABILITY_MAX_LENGTH}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
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
            {t('Submit')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
