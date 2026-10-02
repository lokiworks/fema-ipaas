import { t } from 'i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function DiscardChangesDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Discard unpublished changes?')}</DialogTitle>
          <DialogDescription>
            {t(
              'The draft goes back to the live version. Edits made since then are lost and cannot be restored. The live version keeps running unchanged.',
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('Cancel')}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            {t('Discard changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
