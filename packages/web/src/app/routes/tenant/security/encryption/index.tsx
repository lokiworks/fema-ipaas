import { EncryptionKeySource } from '@fema-ipaas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';

import { CenteredPage } from '@/app/components/centered-page';
import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { FormattedDate } from '@/components/custom/formatted-date';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/custom/item';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { internalErrorToast } from '@/components/ui/sonner';
import { tenantAccessHooks, tenantAccessKeys } from '@/features/tenant-access';
import { api } from '@/lib/api';

const EncryptionPage = () => {
  const queryClient = useQueryClient();
  const { data: status, isLoading } = tenantAccessHooks.useEncryptionStatus();
  const { mutateAsync: rotate, isPending } = useMutation({
    mutationFn: () => api.post<RotationReport>('/v1/encryption/rotate', {}),
    onSuccess: (report) => {
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.encryption });
      const rotated = report.connections.rotated + report.variables.rotated;
      const failed = report.connections.failed + report.variables.failed;
      if (failed > 0) {
        toast.error(t('rotationFinishedWithFailures', { rotated, failed }));
        return;
      }
      toast.success(t('rotationFinished', { count: rotated }));
    },
    onError: () => internalErrorToast(),
  });

  return (
    <CenteredPage
      widthClassName="max-w-[48rem]"
      title={t('Encryption')}
      description={t(
        'Connection credentials and variable values are encrypted before they are stored.',
      )}
    >
      {isLoading || !status ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          {status.rotationRecommended && (
            <Alert variant="warning">
              <AlertTitle>
                {t('This key has been in use for {days} days', {
                  days: status.ageDays ?? 0,
                })}
              </AlertTitle>
              <AlertDescription>
                {t('Rotating the key every 90 days is recommended. Follow the steps below.')}
              </AlertDescription>
            </Alert>
          )}
          {status.source === EncryptionKeySource.MISSING && (
            <Alert variant="destructive">
              <AlertDescription>
                {t(
                  'No encryption key is configured. Set FEMA_ENCRYPTION_KEY before storing connections.',
                )}
              </AlertDescription>
            </Alert>
          )}
          <Card>
            <CardHeader>
              <CardTitle>{t('Encryption key')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">{t('Algorithm')}</dt>
                <dd>{status.algorithm}</dd>
                <dt className="text-muted-foreground">{t('Key source')}</dt>
                <dd>
                  {status.source === EncryptionKeySource.ENVIRONMENT
                    ? t('Environment variable FEMA_ENCRYPTION_KEY')
                    : status.source === EncryptionKeySource.GENERATED_FILE
                    ? t('Generated on first start and kept in the data directory')
                    : t('Not configured')}
                </dd>
                <dt className="text-muted-foreground">{t('Key fingerprint')}</dt>
                <dd className="font-mono">{status.keyId ?? '—'}</dd>
                <dt className="text-muted-foreground">{t('In use since')}</dt>
                <dd>
                  {status.firstObservedAt ? (
                    <>
                      <FormattedDate date={new Date(status.firstObservedAt)} />
                      <span className="text-muted-foreground">
                        {' '}
                        {t('(first seen by this platform, {days} days ago)', {
                          days: status.ageDays ?? 0,
                        })}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </dd>
                <dt className="text-muted-foreground">{t('Retired keys')}</dt>
                <dd>
                  {t('{count} still accepted for reading', {
                    count: status.retiredKeys,
                  })}
                </dd>
                <dt className="text-muted-foreground">
                  {t('Last re-encryption')}
                </dt>
                <dd>
                  {status.lastReencryptedAt ? (
                    <FormattedDate date={new Date(status.lastReencryptedAt)} />
                  ) : (
                    t('Never')
                  )}
                </dd>
                <dt className="text-muted-foreground">{t('Backups')}</dt>
                <dd>
                  {t(
                    'The key is not part of database backups. Keep a copy of it next to every backup.',
                  )}
                </dd>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('How to rotate the key')}</CardTitle>
              <CardDescription>
                {t(
                  'The platform cannot swap its own key while running; rotation is done in the deployment.',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
                <li>
                  {t(
                    'Generate a new key with openssl rand -hex 16 and set it as FEMA_ENCRYPTION_KEY.',
                  )}
                </li>
                <li>
                  {t(
                    'Move the old key into FEMA_RETIRED_ENCRYPTION_KEYS (comma separated) so existing secrets can still be read.',
                  )}
                </li>
                <li>{t('Restart the app and every worker.')}</li>
                <li>
                  {t(
                    'Click Re-encrypt below so every stored secret is written with the new key.',
                  )}
                </li>
                <li>
                  {t(
                    'Keep the retired key for at least 7 days, then remove it from FEMA_RETIRED_ENCRYPTION_KEYS.',
                  )}
                </li>
              </ol>
            </CardContent>
          </Card>
          <Item variant="outline">
            <ItemMedia variant="icon">
              <KeyRound />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t('Re-encrypt stored secrets')}</ItemTitle>
              <ItemDescription>
                {t(
                  'Run this after changing the encryption key so existing connections and variables are re-encrypted with it. Rows already on the current key are skipped, so it is safe to run more than once.',
                )}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <ConfirmationDeleteDialog
                title={t('Re-encrypt stored secrets')}
                message={t(
                  'Every connection and variable still on an older key is decrypted and written back with the current one. Do this during a quiet period.',
                )}
                entityName={t('secrets')}
                buttonText={t('Re-encrypt')}
                mutationFn={async () => {
                  await rotate();
                }}
              >
                <Button variant="outline" size="sm" loading={isPending}>
                  {t('Re-encrypt')}
                </Button>
              </ConfirmationDeleteDialog>
            </ItemActions>
          </Item>
        </div>
      )}
    </CenteredPage>
  );
};

EncryptionPage.displayName = 'EncryptionPage';

type TableRotationReport = {
  scanned: number;
  rotated: number;
  failed: number;
};

type RotationReport = {
  connections: TableRotationReport;
  variables: TableRotationReport;
};

export { EncryptionPage };
