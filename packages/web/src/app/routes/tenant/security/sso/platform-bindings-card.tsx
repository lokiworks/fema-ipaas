import { PlatformAppBindingView, SsoSettings } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Link2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { FormattedDate } from '@/components/custom/formatted-date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { tenantAccessHooks } from '@/features/tenant-access';

export function PlatformBindingsCard({ sso }: { sso: SsoSettings | null }) {
  const start = tenantAccessHooks.useStartPlatformBinding();
  const remove = tenantAccessHooks.useRemovePlatformBinding();
  const [unbinding, setUnbinding] = useState<PlatformAppBindingView | null>(
    null,
  );
  const kinds = sso?.availablePlatformApps ?? [];
  if (sso === null || kinds.length === 0) {
    return null;
  }
  return (
    <Card data-testid="platform-bindings">
      <CardHeader>
        <CardTitle>{t('Link your company')}</CardTitle>
        <CardDescription>
          {t(
            'Scan a code as the administrator of your Feishu, WeCom or DingTalk company. Its people can then sign in with that account, without you creating an app.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {kinds.map((kind) => {
          const binding =
            sso.platformAppBindings.find((item) => item.kind === kind) ?? null;
          return (
            <div
              key={kind}
              className="flex items-center justify-between gap-4 rounded-md border p-3"
              data-testid={`platform-binding-${kind}`}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {platformLabel(kind)}
                  <Badge variant={binding ? 'success' : 'outline'}>
                    {binding ? t('Linked') : t('Not linked')}
                  </Badge>
                </span>
                {binding && (
                  <span className="text-xs text-muted-foreground">
                    {binding.enterpriseName} ·{' '}
                    <FormattedDate date={new Date(binding.boundAt)} />
                  </span>
                )}
              </div>
              {binding ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setUnbinding(binding)}
                  data-testid={`platform-unbind-${kind}`}
                >
                  {t('Unlink')}
                </Button>
              ) : (
                <Button
                  size="sm"
                  loading={start.isPending && start.variables === kind}
                  onClick={() => start.mutate(kind)}
                  data-testid={`platform-bind-${kind}`}
                >
                  <Link2 className="size-4" />
                  {t('Link organization')}
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
      {unbinding && (
        <ConfirmationDeleteDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setUnbinding(null);
            }
          }}
          title={t('Unlink {name}?', { name: unbinding.enterpriseName })}
          message={t(
            'People of that company can no longer sign in to this tenant with the platform account.',
          )}
          entityName={unbinding.enterpriseName}
          buttonText={t('Unlink')}
          mutationFn={async () => {
            await remove.mutateAsync(unbinding.kind);
          }}
        />
      )}
    </Card>
  );
}

function platformLabel(kind: PlatformAppBindingView['kind']): string {
  switch (kind) {
    case 'FEISHU':
      return t('Feishu');
    case 'WECOM':
      return t('WeCom');
    case 'DINGTALK':
      return t('DingTalk');
  }
}
