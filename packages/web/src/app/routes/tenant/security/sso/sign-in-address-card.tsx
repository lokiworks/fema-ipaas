import { t } from 'i18next';
import { Pencil } from 'lucide-react';
import { useState } from 'react';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { internalErrorMessage } from '@/components/ui/sonner';
import {
  SlugDialog,
  tenantAccessHooks,
  tenantAccessUtils,
} from '@/features/tenant-access';
import { tenantHooks } from '@/hooks/tenant-hooks';
import { api } from '@/lib/api';

export function SignInAddressCard() {
  const { tenant } = tenantHooks.useCurrentTenant();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const update = tenantAccessHooks.useUpdateSlug({
    onSaved: () => setOpen(false),
    onError: (error) =>
      setServerError(
        api.extractServerErrorMessage(error, internalErrorMessage()),
      ),
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
      <CardContent className="flex flex-col gap-2">
        <div data-testid="tenant-sign-in-url">
          <CopyToClipboardInput textToCopy={url} useInput={true} />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
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
        serverError={serverError}
        onSubmit={(slug) => {
          setServerError(null);
          update.mutate({ tenantId: tenant.id, request: { slug } });
        }}
      />
    </Card>
  );
}
