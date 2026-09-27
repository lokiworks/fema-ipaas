import { DataStoreSummary } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  const open = store !== null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {store && (
          <DeleteConfirmation
            key={store.id}
            store={store}
            onOpenChange={onOpenChange}
            onDeleted={onDeleted}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirmation({
  store,
  onOpenChange,
  onDeleted,
}: {
  store: DataStoreSummary;
  onOpenChange: (open: boolean) => void;
  onDeleted: (store: DataStoreSummary) => void;
}) {
  const [typed, setTyped] = useState('');
  const { mutate: deleteStore, isPending } =
    dataStoresHooks.useDeleteDataStore();
  const matches = typed === store.name;
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>
          {t('Delete data store "{name}"?', { name: store.name })}
        </DialogTitle>
        <DialogDescription>
          {t('dataStoreDeleteConsequences', { count: store.recordCount })}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm-data-store-name">
          {t('Type {name} to confirm', { name: store.name })}
        </Label>
        <Input
          id="confirm-data-store-name"
          value={typed}
          autoComplete="off"
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => onOpenChange(false)}
        >
          {t('Cancel')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={!matches}
          loading={isPending}
          onClick={() =>
            deleteStore(store.id, {
              onSuccess: () => {
                onOpenChange(false);
                onDeleted(store);
              },
            })
          }
        >
          <TriangleAlert className="size-4 mr-2" />
          {t('Delete')}
        </Button>
      </DialogFooter>
    </div>
  );
}
