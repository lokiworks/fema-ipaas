import { t } from 'i18next';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function ResolveIssueDialog({
  open,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (note: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {open && (
          <ResolveIssueForm
            pending={pending}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResolveIssueForm({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('Mark this issue as resolved?')}</DialogTitle>
        <DialogDescription>
          {t('resolveIssueConfirmDescription')}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="resolve-issue-note">{t('resolveIssueNoteLabel')}</Label>
        <Textarea
          id="resolve-issue-note"
          value={note}
          maxLength={NOTE_MAX_LENGTH}
          placeholder={t('resolveIssueNotePlaceholder')}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button
          type="button"
          loading={pending}
          onClick={() => onConfirm(note.trim())}
        >
          {t('Mark resolved')}
        </Button>
      </DialogFooter>
    </>
  );
}

const NOTE_MAX_LENGTH = 500;
