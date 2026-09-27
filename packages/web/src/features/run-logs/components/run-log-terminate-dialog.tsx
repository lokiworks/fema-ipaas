import { t } from 'i18next';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

export function RunLogTerminateDialog({
  open,
  childRunCount,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  childRunCount: number;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (request: { stopChildRuns: boolean }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {open && (
          <TerminateChoice
            childRunCount={childRunCount}
            pending={pending}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TerminateChoice({
  childRunCount,
  pending,
  onCancel,
  onConfirm,
}: {
  childRunCount: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (request: { stopChildRuns: boolean }) => void;
}) {
  const [stopChildRuns, setStopChildRuns] = useState(true);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('Terminate this run?')}</DialogTitle>
        <DialogDescription>
          {t(
            'The run stops waiting and will not continue. Steps that already ran are not rolled back, and pending agent approvals for this run expire.',
          )}
        </DialogDescription>
      </DialogHeader>
      {childRunCount > 0 && (
        <div className="flex items-start gap-2">
          <Checkbox
            id="terminate-child-runs"
            checked={stopChildRuns}
            onCheckedChange={(value) => setStopChildRuns(value === true)}
          />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="terminate-child-runs">
              {t('Also stop subflow runs')}
            </Label>
            <span className="text-xs text-muted-foreground">
              {t(
                '{count, plural, =1 {1 subflow run is still queued or waiting} other {# subflow runs are still queued or waiting}}',
                { count: childRunCount },
              )}
            </span>
          </div>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          loading={pending}
          onClick={() =>
            onConfirm({ stopChildRuns: childRunCount > 0 && stopChildRuns })
          }
        >
          {t('Terminate')}
        </Button>
      </DialogFooter>
    </>
  );
}
