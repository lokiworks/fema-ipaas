import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';

import { CenteredPage } from '@/app/components/centered-page';
import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from '@/components/custom/item';
import { Button } from '@/components/ui/button';
import { internalErrorToast } from '@/components/ui/sonner';
import { api } from '@/lib/api';

const EncryptionPage = () => {
  const { mutateAsync: rotate, isPending } = useMutation({
    mutationFn: () => api.post<RotationReport>('/v1/encryption/rotate', {}),
    onSuccess: (report) => {
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
      title={t('Encryption')}
      description={t('Manage the key that protects stored secrets')}
    >
      <div className="flex flex-col gap-4">
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
