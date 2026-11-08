import {
  GrantInstanceOperatorRequestBody,
  InstanceOperator,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  ConsolePage,
  ConsoleTableFrame,
} from '@/components/custom/console-page';
import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { internalErrorMessage } from '@/components/ui/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { operatorHooks } from '@/features/operator';
import { FormServerError } from '@/features/tenant-access';
import { api } from '@/lib/api';

export function OperatorOperatorsPage() {
  const { data, isLoading } = operatorHooks.useOperators();
  const revoke = operatorHooks.useRevokeOperator();
  const [grantRound, setGrantRound] = useState(0);
  const [removing, setRemoving] = useState<InstanceOperator | null>(null);
  const operators = data ?? [];

  return (
    <ConsolePage
      title={t('Operators')}
      description={t(
        'People who run this instance: they see every tenant, the instance settings and the infrastructure pages. The person must already have an account.',
      )}
    >
      <GrantForm
        key={grantRound}
        onGranted={() => setGrantRound((round) => round + 1)}
      />
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <ConsoleTableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Name')}</TableHead>
                <TableHead>{t('Contact')}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {operators.map((operator) => (
                <TableRow
                  key={operator.identityId}
                  data-testid={`operator-${operator.identityId}`}
                >
                  <TableCell className="font-medium">{operator.name}</TableCell>
                  <TableCell>{operator.contact ?? '-'}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={operators.length <= 1}
                      onClick={() => setRemoving(operator)}
                    >
                      {t('Remove')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ConsoleTableFrame>
      )}
      {operators.length <= 1 && operators.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('The last operator cannot be removed.')}
        </p>
      )}
      {removing && (
        <ConfirmationDeleteDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setRemoving(null);
            }
          }}
          title={t('Remove {name} as operator?', { name: removing.name })}
          message={t(
            'They keep their account and tenant access but lose the operations pages.',
          )}
          entityName={removing.name}
          mutationFn={async () => {
            await revoke.mutateAsync(removing.identityId);
          }}
        />
      )}
    </ConsolePage>
  );
}

function GrantForm({ onGranted }: { onGranted: () => void }) {
  const form = useForm<GrantInstanceOperatorRequestBody>({
    mode: 'onChange',
    resolver: zodResolver(GrantInstanceOperatorRequestBody),
    defaultValues: { email: '' },
  });
  const { mutate: grant, isPending } = operatorHooks.useGrantOperator({
    onGranted,
    onError: (error) =>
      form.setError('root.serverError', {
        type: 'manual',
        message: api.extractServerErrorMessage(error, internalErrorMessage()),
      }),
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-wrap items-start gap-2"
        onSubmit={form.handleSubmit((values) => {
          form.clearErrors('root.serverError');
          grant(values);
        })}
      >
        <div className="flex flex-col gap-1">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    {...field}
                    className="w-80 max-w-full"
                    placeholder="name@example.com"
                    aria-label={t('Email address')}
                    data-testid="operator-email"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormServerError
            message={form.formState.errors.root?.serverError?.message}
          />
        </div>
        <Button type="submit" loading={isPending} data-testid="operator-grant">
          {t('Add operator')}
        </Button>
      </form>
    </Form>
  );
}
