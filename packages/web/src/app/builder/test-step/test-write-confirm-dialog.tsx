import { t } from 'i18next';
import { TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export const TestWriteConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
  stepDisplayName,
  appName,
  destructive,
}: TestWriteConfirmDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent data-testid="test-write-confirm-dialog">
      <DialogHeader>
        <DialogTitle>
          {t('This test writes to {app} for real', { app: appName })}
        </DialogTitle>
        <DialogDescription className="pt-2">
          {t(
            'Testing "{step}" calls {app} and writes data there. Like a debug run, write steps are not simulated.',
            { step: stepDisplayName, app: appName },
          )}
        </DialogDescription>
      </DialogHeader>
      {destructive && (
        <Alert variant="warning">
          <TriangleAlert className="size-4" />
          <AlertDescription>
            {t('This step may be irreversible.')}
          </AlertDescription>
        </Alert>
      )}
      <DialogFooter className="mt-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          {t('Cancel')}
        </Button>
        <Button
          type="button"
          onClick={() => {
            onOpenChange(false);
            onConfirm();
          }}
        >
          {t('Test and write')}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

type TestWriteConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  stepDisplayName: string;
  appName: string;
  destructive: boolean;
};
