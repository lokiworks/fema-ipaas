import { t } from 'i18next';
import React, { useState } from 'react';

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

export function TypeToConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  actionLabel,
  onConfirm,
  isPending,
  blockedReason,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  actionLabel: string;
  onConfirm: () => void;
  isPending: boolean;
  blockedReason?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <ConfirmBody
          key={open ? 'open' : 'closed'}
          title={title}
          description={description}
          confirmText={confirmText}
          actionLabel={actionLabel}
          onConfirm={onConfirm}
          isPending={isPending}
          blockedReason={blockedReason}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ConfirmBody({
  title,
  description,
  confirmText,
  actionLabel,
  onConfirm,
  isPending,
  blockedReason,
  onCancel,
}: {
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  actionLabel: string;
  onConfirm: () => void;
  isPending: boolean;
  blockedReason?: string | null;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const needsTyping = confirmText !== undefined && confirmText.length > 0;
  const matches = !needsTyping || typed.trim() === confirmText.trim();
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription asChild>
          <div className="text-sm text-muted-foreground">{description}</div>
        </DialogDescription>
      </DialogHeader>
      {blockedReason && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {blockedReason}
        </p>
      )}
      {needsTyping && !blockedReason && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            {t('Type {name} to confirm', { name: confirmText })}
          </p>
          <Input
            autoFocus
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={confirmText}
          />
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          loading={isPending}
          disabled={!matches || Boolean(blockedReason)}
          onClick={onConfirm}
        >
          {actionLabel}
        </Button>
      </DialogFooter>
    </>
  );
}
