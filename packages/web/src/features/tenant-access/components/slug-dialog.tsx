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
import { Input } from '@/components/ui/input';

import { tenantAccessUtils } from '../utils/tenant-access-utils';

export function SlugDialog({
  open,
  onOpenChange,
  currentSlug,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSlug: string;
  pending: boolean;
  onSubmit: (slug: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <SlugForm
          key={open ? currentSlug : 'closed'}
          currentSlug={currentSlug}
          pending={pending}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function SlugForm({
  currentSlug,
  pending,
  onSubmit,
  onCancel,
}: {
  currentSlug: string;
  pending: boolean;
  onSubmit: (slug: string) => void;
  onCancel: () => void;
}) {
  const [slug, setSlug] = useState(currentSlug);
  const [touched, setTouched] = useState(false);
  const errorKey = tenantAccessUtils.slugError(slug);
  const unchanged = slug.trim().toLowerCase() === currentSlug;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (errorKey === null && !unchanged) {
          onSubmit(slug.trim().toLowerCase());
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{t('Change sign-in address')}</DialogTitle>
        <DialogDescription>
          {t(
            'The old address stops working right away. Tell members the new one.',
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {tenantAccessUtils.tenantLoginPath('')}
        </span>
        <Input
          value={slug}
          aria-label={t('Sign-in address')}
          data-testid="slug-input"
          onChange={(event) => {
            setTouched(true);
            setSlug(event.target.value);
          }}
        />
      </div>
      <p
        className={
          touched && errorKey
            ? 'text-sm text-destructive'
            : 'text-xs text-muted-foreground'
        }
      >
        {touched && errorKey
          ? t(errorKey)
          : t('3 to 40 lowercase letters, digits or hyphens.')}
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button
          type="submit"
          loading={pending}
          disabled={unchanged}
          data-testid="slug-save"
        >
          {t('Save')}
        </Button>
      </DialogFooter>
    </form>
  );
}
