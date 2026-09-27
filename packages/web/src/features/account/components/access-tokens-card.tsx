import { isNil } from '@fema-ipaas/core-utils';
import { PersonalAccessToken } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { KeyRound, Plus } from 'lucide-react';
import { useState } from 'react';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import { accountHooks } from '../hooks/account-hooks';
import { accountUtils } from '../utils/account-utils';

import { CreateAccessTokenDialog } from './create-access-token-dialog';

export function AccessTokensCard() {
  const [creating, setCreating] = useState(false);
  const { data: tokens, isLoading } = accountHooks.useTokens();
  const revoke = accountHooks.useRevokeToken();
  const now = new Date();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Personal access tokens')}</CardTitle>
        <CardDescription>
          {t(
            'Use a token to call the platform API from scripts. It has all of your permissions. Send it in the Authorization header as Bearer followed by the token.',
          )}
        </CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {t('New token')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (tokens ?? []).length === 0 ? (
          <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <KeyRound className="size-5" />
            {t('No access tokens yet')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Name')}</TableHead>
                <TableHead>{t('Created')}</TableHead>
                <TableHead>{t('Expires')}</TableHead>
                <TableHead>{t('Last used')}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tokens ?? []).map((token) => (
                <TokenRow
                  key={token.id}
                  token={token}
                  expired={accountUtils.isExpired({
                    expiresAt: token.expiresAt,
                    now,
                  })}
                  onRevoke={() => revoke.mutateAsync(token.id)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CreateAccessTokenDialog open={creating} onOpenChange={setCreating} />
    </Card>
  );
}

function TokenRow({
  token,
  expired,
  onRevoke,
}: {
  token: PersonalAccessToken;
  expired: boolean;
  onRevoke: () => Promise<void>;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        {token.name}
        <span className="ml-2 font-mono text-xs text-muted-foreground">
          …{token.tokenHint}
        </span>
      </TableCell>
      <TableCell>
        {formatUtils.formatDateOnly(new Date(token.created))}
      </TableCell>
      <TableCell className={cn(expired && 'text-destructive')}>
        {isNil(token.expiresAt)
          ? t('Never expires')
          : formatUtils.formatDateOnly(new Date(token.expiresAt))}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {isNil(token.lastUsedAt)
          ? t('Never used')
          : formatUtils.formatDateToAgo(new Date(token.lastUsedAt))}
      </TableCell>
      <TableCell>
        <ConfirmationDeleteDialog
          title={t('Revoke token "{name}"?', { name: token.name })}
          message={t(
            'Scripts and tools that use this token will stop working immediately.',
          )}
          entityName={token.name}
          buttonText={t('Revoke')}
          mutationFn={onRevoke}
        >
          <Button size="sm" variant="ghost" className="text-destructive">
            {t('Revoke')}
          </Button>
        </ConfirmationDeleteDialog>
      </TableCell>
    </TableRow>
  );
}
