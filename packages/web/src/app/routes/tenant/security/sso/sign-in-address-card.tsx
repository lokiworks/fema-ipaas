import { t } from 'i18next';
import { Pencil } from 'lucide-react';
import { useState } from 'react';

import { CopyButton } from '@/components/custom/clipboard/copy-button';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  SlugDialog,
  tenantAccessHooks,
  tenantAccessUtils,
} from '@/features/tenant-access';
import { tenantHooks } from '@/hooks/tenant-hooks';

export function SignInAddressCard() {
  const { tenant } = tenantHooks.useCurrentTenant();
  const [open, setOpen] = useState(false);
  const update = tenantAccessHooks.useUpdateSlug({
    onSaved: () => setOpen(false),
  });
  const url = tenantAccessUtils.tenantLoginUrl({
    origin: window.location.origin,
    slug: tenant.slug,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Sign-in address')}</CardTitle>
        <CardDescription>
          {t(
            'Share this address with your members. It shows your name and the sign-in methods you turned on.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <code
          className="min-w-0 break-all rounded-md border bg-muted/40 px-3 py-1.5 text-sm"
          data-testid="tenant-sign-in-url"
        >
          {url}
        </code>
        <CopyButton textToCopy={url} variant="outline" type="button" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          data-testid="change-slug"
        >
          <Pencil className="size-3.5" />
          {t('Change')}
        </Button>
      </CardContent>
      <SlugDialog
        open={open}
        onOpenChange={setOpen}
        currentSlug={tenant.slug}
        pending={update.isPending}
        onSubmit={(slug) =>
          update.mutate({ tenantId: tenant.id, request: { slug } })
        }
      />
    </Card>
  );
}
