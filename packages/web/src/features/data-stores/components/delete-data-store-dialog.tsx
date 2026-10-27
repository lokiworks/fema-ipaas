import { DataStoreSummary } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';

import { dataStoresHooks } from '../hooks/data-stores-hooks';

export function DeleteDataStoreDialog({
  store,
  onOpenChange,
  onDeleted,
}: {
  store: DataStoreSummary | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: (store: DataStoreSummary) => void;
}) {
  const { mutateAsync: deleteStore } = dataStoresHooks.useDeleteDataStore();
  return (
    <ConfirmationDeleteDialog
      title={t('Delete data store')}
      message={t('dataStoreDeleteConsequences', {
        count: store?.recordCount ?? 0,
      })}
      entityName={store?.name ?? ''}
      targetName={store?.name ?? ''}
      buttonText={t('Delete')}
      isDanger
      showToast
      open={store !== null}
      onOpenChange={onOpenChange}
      mutationFn={async () => {
        if (!store) {
          return;
        }
        await deleteStore(store.id);
        onDeleted(store);
      }}
    />
  );
}
