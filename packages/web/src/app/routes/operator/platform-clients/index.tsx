import { PlatformClient } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import {
  ConsolePage,
  ConsoleTableFrame,
} from '@/components/custom/console-page';
import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { FormattedDate } from '@/components/custom/formatted-date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { operatorHooks, operatorUtils } from '@/features/operator';

import { CreatePlatformClientDialog } from './create-platform-client-dialog';

export function OperatorPlatformClientsPage() {
  const { data, isLoading } = operatorHooks.usePlatformClients();
  const revoke = operatorHooks.useRevokePlatformClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [revoking, setRevoking] = useState<PlatformClient | null>(null);
  const clients = data ?? [];

  return (
    <ConsolePage
      title={t('Platform clients')}
      description={t(
        'Other systems that provision tenants and members through the platform API. Use an API key, or trust the tokens of an identity provider you run.',
      )}
      actions={
        <Button
          onClick={() => setCreateOpen(true)}
          data-testid="create-platform-client"
        >
          <Plus className="size-4" />
          {t('New client')}
        </Button>
      }
    >
      {isLoading ? (
        <Skeleton className="h-60 w-full" />
      ) : (
        <ConsoleTableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Name')}</TableHead>
                <TableHead>{t('Type')}</TableHead>
                <TableHead>{t('Identifier')}</TableHead>
                <TableHead>{t('Permissions')}</TableHead>
                <TableHead>{t('Last used')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {t('No platform clients yet')}
                  </TableCell>
                </TableRow>
              ) : (
                clients.map((client) => (
                  <TableRow key={client.id} data-testid={`client-${client.id}`}>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell>
                      {operatorUtils.clientKindLabel(client.kind)}
                    </TableCell>
                    <TableCell>
                      <code className="break-all text-xs">
                        {client.keyPrefix
                          ? `fpk_${client.keyPrefix}…`
                          : client.issuer}
                      </code>
                      {client.allowedSubjects.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {t('Subjects: {list}', {
                            list: client.allowedSubjects.join(', '),
                          })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {client.scopes.map((scope) => (
                          <Badge key={scope} variant="outline">
                            {operatorUtils.scopeLabel(scope)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {client.lastUsedAt ? (
                        <FormattedDate
                          date={new Date(client.lastUsedAt)}
                          includeTime
                        />
                      ) : (
                        <span className="text-muted-foreground">
                          {t('Never')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {client.revokedAt ? (
                        <Badge variant="destructive">{t('Revoked')}</Badge>
                      ) : (
                        <Badge variant="success">{t('Active')}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!client.revokedAt && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRevoking(client)}
                          data-testid={`revoke-${client.id}`}
                        >
                          {t('Revoke')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ConsoleTableFrame>
      )}
      <CreatePlatformClientDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      {revoking && (
        <ConfirmationDeleteDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setRevoking(null);
            }
          }}
          title={t('Revoke {name}?', { name: revoking.name })}
          message={t(
            'Calls that use it start failing right away. This cannot be undone.',
          )}
          entityName={revoking.name}
          buttonText={t('Revoke')}
          mutationFn={async () => {
            await revoke.mutateAsync(revoking.id);
          }}
        />
      )}
    </ConsolePage>
  );
}
