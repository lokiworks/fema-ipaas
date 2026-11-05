import { t } from 'i18next';
import { useState } from 'react';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
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
import {
  LimitField,
  LimitFields,
  LimitInputs,
  operatorHooks,
  operatorUtils,
} from '@/features/operator';
import { tenantAccessUtils } from '@/features/tenant-access';

export function CreateTenantDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <CreateTenantForm
          key={open ? 'open' : 'closed'}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function CreateTenantForm({ onClose }: { onClose: () => void }) {
  const {
    mutate: create,
    isPending,
    data: created,
  } = operatorHooks.useCreateTenant();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [contact, setContact] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [limits, setLimits] = useState<LimitInputs>(EMPTY_LIMITS);
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<LimitField | null>(null);

  if (created) {
    return (
      <div className="flex flex-col gap-4" data-testid="tenant-created">
        <DialogHeader>
          <DialogTitle>{t('Tenant created')}</DialogTitle>
          <DialogDescription>
            {created.ownerInvitationUrl
              ? t(
                  'Send this link to the owner so they can activate the account. It expires after 7 days.',
                )
              : t('The owner can sign in right away.')}
          </DialogDescription>
        </DialogHeader>
        {created.ownerInvitationUrl && (
          <CopyToClipboardInput
            textToCopy={created.ownerInvitationUrl}
            useInput={true}
          />
        )}
        <DialogFooter>
          <Button onClick={onClose}>{t('Done')}</Button>
        </DialogFooter>
      </div>
    );
  }

  const submit = (): void => {
    const owner = operatorUtils.buildOwnerInput({
      contact,
      firstName,
      lastName,
    });
    if (name.trim().length === 0) {
      setError(t('Name is required'));
      return;
    }
    const slugValue = slug.trim();
    if (slugValue.length > 0 && tenantAccessUtils.slugError(slugValue)) {
      setError(t('tenantSlugInvalid'));
      return;
    }
    if (owner === null) {
      setError(t('Enter the owner email address or mobile number'));
      return;
    }
    const built = operatorUtils.buildLimitsUpdate(limits);
    if (!built.ok) {
      setInvalidField(built.field);
      setError(t('Limits must be whole numbers of 0 or more.'));
      return;
    }
    setError(null);
    setInvalidField(null);
    create({
      name: name.trim(),
      ...(slugValue.length > 0 ? { slug: slugValue.toLowerCase() } : {}),
      owner,
      limits: built.limits,
    });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t('New tenant')}</DialogTitle>
        <DialogDescription>
          {t(
            'Create an organization and invite its owner. The owner then manages members and sign-in themselves.',
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tenant-name">{t('Tenant name')}</Label>
        <Input
          id="tenant-name"
          value={name}
          data-testid="tenant-name"
          onChange={(event) => {
            setName(event.target.value);
            if (!slugTouched) {
              setSlug(operatorUtils.slugFromName(event.target.value));
            }
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tenant-slug">{t('Sign-in address')}</Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">/t/</span>
          <Input
            id="tenant-slug"
            value={slug}
            placeholder="acme"
            data-testid="tenant-slug"
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            '3 to 40 lowercase letters, digits or hyphens. Leave empty to generate one.',
          )}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tenant-owner">
          {t('Owner email or mobile number')}
        </Label>
        <Input
          id="tenant-owner"
          value={contact}
          placeholder="owner@example.com / 13800138000"
          data-testid="tenant-owner"
          onChange={(event) => setContact(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            value={lastName}
            aria-label={t('Last name')}
            placeholder={t('Last name')}
            onChange={(event) => setLastName(event.target.value)}
          />
          <Input
            value={firstName}
            aria-label={t('First name')}
            placeholder={t('First name')}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label>{t('Limits')}</Label>
        <LimitFields
          value={limits}
          onChange={setLimits}
          invalidField={invalidField}
        />
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('Cancel')}
        </Button>
        <Button
          type="submit"
          loading={isPending}
          data-testid="tenant-create-submit"
        >
          {t('Create tenant')}
        </Button>
      </DialogFooter>
    </form>
  );
}

const EMPTY_LIMITS: LimitInputs = {
  usersLimit: '',
  projectsLimit: '',
  activeWorkflowsLimit: '',
  concurrentExecutionsLimit: '',
  workerGroupId: '',
};
