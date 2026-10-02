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

export function AllMatchConfirmDialog({
  open,
  branchCount,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  branchCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Run every matching branch?')}</DialogTitle>
          <DialogDescription>
            {t(
              'With {count} branches, one record can match several of them and each matching branch runs. If those branches write to the same system, the same person may be written more than once. The default branch still runs only when no other branch matches.',
              { count: branchCount },
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('Cancel')}
          </Button>
          <Button type="button" onClick={onConfirm}>
            {t('Run every matching branch')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
