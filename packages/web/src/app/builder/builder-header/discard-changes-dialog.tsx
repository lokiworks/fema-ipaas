import { isNil } from '@fema-ipaas/core-utils';
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
  liveVersionLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  liveVersionLabel: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Discard unpublished changes?')}</DialogTitle>
          <DialogDescription>
            {isNil(liveVersionLabel)
              ? t(
                  'All edits made since the last publish will be discarded and the workflow goes back to the live version. This cannot be undone.',
                )
              : t(
                  'All edits made since the last publish will be discarded and the workflow goes back to live version {version}. This cannot be undone.',
                  { version: liveVersionLabel },
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
