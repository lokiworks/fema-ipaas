import {
  GrantInstanceOperatorRequestBody,
  InstanceOperator,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

import {
  ConsolePage,
  ConsoleTableFrame,
} from '@/components/custom/console-page';
import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { operatorHooks } from '@/features/operator';

export function OperatorOperatorsPage() {
  const { data, isLoading } = operatorHooks.useOperators();
  const revoke = operatorHooks.useRevokeOperator();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<InstanceOperator | null>(null);
  const { mutate: grant, isPending } = operatorHooks.useGrantOperator({
    onGranted: () => setEmail(''),
  });
  const operators = data ?? [];

  return (
    <ConsolePage
      title={t('Operators')}
      description={t(
        'People who run this instance: they see every tenant, the instance settings and the infrastructure pages. The person must already have an account.',
      )}
    >
      <form
        className="flex flex-wrap items-start gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = GrantInstanceOperatorRequestBody.safeParse({ email });
          if (!parsed.success) {
            setError(t(parsed.error.issues[0]?.message ?? 'invalidEmail'));
            return;
          }
          setError(null);
          grant(parsed.data);
        }}
      >
        <div className="flex flex-col gap-1">
          <Input
            className="w-80 max-w-full"
            value={email}
            placeholder="name@example.com"
            aria-label={t('Email address')}
            data-testid="operator-email"
            onChange={(event) => setEmail(event.target.value)}
          />
          {error && (
            <span className="text-sm text-destructive" role="alert">
              {error}
            </span>
          )}
        </div>
        <Button type="submit" loading={isPending} data-testid="operator-grant">
          {t('Add operator')}
        </Button>
      </form>
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
