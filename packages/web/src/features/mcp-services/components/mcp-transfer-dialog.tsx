import {
  McpService,
  TransferMcpServiceRequestBody,
  UserStatus,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';

import { Empty, EmptyDescription, EmptyTitle } from '@/components/custom/empty';
import { UserBadge } from '@/components/custom/user-badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { tenantUserHooks } from '@/features/tenant-admin/hooks/tenant-user-hooks';

import { mcpServicesHooks } from '../hooks/mcp-services-hooks';

function McpTransferDialog({
  service,
  open,
  onOpenChange,
}: {
  service: McpService;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <TransferForm
          key={open ? 'open' : 'closed'}
          service={service}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function TransferForm({
  service,
  onOpenChange,
}: {
  service: McpService;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: usersPage } = tenantUserHooks.useUsers();
  const candidates = (usersPage?.data ?? []).filter(
    (user) => user.status === UserStatus.ACTIVE && user.id !== service.ownerId,
  );
  const form = useForm<TransferMcpServiceRequestBody>({
    resolver: zodResolver(TransferMcpServiceRequestBody),
    mode: 'onChange',
    defaultValues: { ownerId: '' },
  });
  const { mutate: transfer, isPending } = mcpServicesHooks.useTransfer(
    service.id,
  );

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          transfer(values, { onSuccess: () => onOpenChange(false) }),
        )}
      >
        <DialogHeader>
          <DialogTitle>{t('Transfer ownership')}</DialogTitle>
          <DialogDescription>{service.name}</DialogDescription>
        </DialogHeader>
        <Alert variant="warning">
          <AlertDescription>
            {t(
              'After the transfer you can no longer edit, publish or delete this service. The new owner manages its tools, connections and API key.',
            )}
          </AlertDescription>
        </Alert>
        {candidates.length === 0 ? (
          <Empty>
            <EmptyTitle>{t('No one to transfer to')}</EmptyTitle>
            <EmptyDescription>
              {t(
                'Only active members with the MCP services module permission can receive a service. Grant it from the admin console first.',
              )}
            </EmptyDescription>
          </Empty>
        ) : (
          <FormField
            control={form.control}
            name="ownerId"
            render={({ field }) => (
              <FormItem>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('Choose a member')} />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        <UserBadge
                          id={user.id}
                          size="small"
                          includeAvatar
                          includeName
                        />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type="submit"
            disabled={candidates.length === 0 || !form.watch('ownerId')}
            loading={isPending}
          >
            {t('Transfer')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export { McpTransferDialog };
