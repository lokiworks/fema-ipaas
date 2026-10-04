import { RevealExecutionPayloadResponse } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { EyeOff } from 'lucide-react';
import { useState } from 'react';

import { SmartOutputViewer } from '@/components/custom/smart-output-viewer';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

import { privacyHooks } from '../hooks/privacy-hooks';

export function MaskedPayloadNotice({
  executionId,
  stepName,
  maskedFields,
  redacted,
}: {
  executionId: string;
  stepName: string;
  maskedFields: number;
  redacted: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!redacted && maskedFields === 0) {
    return null;
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground mb-2">
      <span className="inline-flex items-center gap-1.5">
        <EyeOff className="size-3.5" />
        {redacted
          ? t('Inputs and outputs are not shown by the privacy settings.')
          : t('{count} fields in this run are masked.', {
              count: maskedFields,
            })}
      </span>
      {!redacted && (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={() => setOpen(true)}
        >
          {t('View original')}
        </Button>
      )}
      <RevealDialog
        executionId={executionId}
        stepName={stepName}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}

function RevealDialog({
  executionId,
  stepName,
  open,
  onOpenChange,
}: {
  executionId: string;
  stepName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: settings } = privacyHooks.useSettings();
  const { mutate: reveal, isPending } = privacyHooks.useReveal(executionId);
  const [reason, setReason] = useState('');
  const [revealed, setRevealed] =
    useState<RevealExecutionPayloadResponse | null>(null);
  const reasonRequired = settings?.requireRawViewReason ?? true;
  const reasonValid =
    !reasonRequired || reason.trim().length >= MIN_REASON_LENGTH;

  const close = (next: boolean) => {
    if (!next) {
      setRevealed(null);
      setReason('');
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('View original values')}</DialogTitle>
          <DialogDescription>
            {t(
              'This view is recorded in the audit log with your reason. It only covers this step.',
            )}
          </DialogDescription>
        </DialogHeader>
        {revealed ? (
          <div className="flex flex-col gap-3 max-h-[60vh] overflow-auto">
            <SmartOutputViewer json={revealed.input} title={t('Input')} />
            <SmartOutputViewer json={revealed.output} title={t('Output')} />
          </div>
        ) : (
          <Textarea
            value={reason}
            maxLength={200}
            placeholder={
              reasonRequired
                ? t(
                    'Why do you need the original values? (at least 4 characters)',
                  )
                : t('Reason (optional)')
            }
            onChange={(event) => setReason(event.target.value)}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            {revealed ? t('Close and mask again') : t('Cancel')}
          </Button>
          {!revealed && (
            <Button
              disabled={!reasonValid || isPending}
              loading={isPending}
              onClick={() =>
                reveal(
                  {
                    stepName,
                    reason:
                      reason.trim().length > 0 ? reason.trim() : undefined,
                  },
                  { onSuccess: setRevealed },
                )
              }
            >
              {t('View original')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const MIN_REASON_LENGTH = 4;
