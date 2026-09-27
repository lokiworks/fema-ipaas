import {
  BlueprintAuthProblem,
  BlueprintTestStatus,
  ConnectorBlueprintDetail,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { CircleCheck, CircleDashed } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { connectorBlueprintHooks } from '../../hooks/connector-blueprint-hooks';

import { AuthConfirmDialog } from './auth-confirm-dialog';
import { authDraftUtils, AuthChecklistItemId } from './auth-draft-utils';

export function AuthStepPublish({
  detail,
  problems,
  dirty,
}: {
  detail: ConnectorBlueprintDetail;
  problems: BlueprintAuthProblem[];
  dirty: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { mutate, isPending } = connectorBlueprintHooks.usePublishBlueprintAuth(
    {
      id: detail.id,
      onSuccess: () => setConfirmOpen(false),
    },
  );
  const checklist = authDraftUtils.publishChecklist({
    problems,
    dirty,
    flowPassed:
      detail.authStatus.flowTest?.status === BlueprintTestStatus.PASSED,
    apiPassed: detail.authStatus.apiTest?.status === BlueprintTestStatus.PASSED,
  });
  const items: { id: AuthChecklistItemId; label: string }[] = [
    { id: 'basicInfo', label: t('Basic information is complete') },
    { id: 'fieldsValid', label: t('The authentication form is valid') },
    {
      id: 'flowConfigured',
      label: t('The authentication flow is fully configured'),
    },
    { id: 'saved', label: t('Changes are saved') },
    { id: 'flowTestPassed', label: t('The authentication flow test passed') },
    { id: 'apiTestPassed', label: t('The business API test passed') },
  ];
  const ready = items.every((item) => checklist[item.id]);
  const alreadyPublished = detail.authStatus.published;
  const authName = detail.definition.auth?.name ?? '';

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-4 rounded-md border p-4">
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const ok = checklist[item.id];
            return (
              <div key={item.id} className="flex items-center gap-2">
                <span
                  className={cn(ok ? 'text-success' : 'text-muted-foreground')}
                >
                  {ok ? (
                    <CircleCheck className="size-4" />
                  ) : (
                    <CircleDashed className="size-4" />
                  )}
                </span>
                <span className={cn('text-sm', !ok && 'text-muted-foreground')}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
        {alreadyPublished ? (
          <Alert variant="success">
            <AlertTitle>{t('Authentication published')}</AlertTitle>
            <AlertDescription>
              {t(
                'The current configuration is already live. Changing it requires testing and publishing it again.',
              )}
            </AlertDescription>
          </Alert>
        ) : ready ? (
          <Alert variant="success">
            <AlertTitle>{t('All tests passed, ready to publish')}</AlertTitle>
            <AlertDescription>
              {t(
                'Publishing takes effect immediately and cannot be undone. Existing connections are not affected; new connections use the new configuration.',
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="warning">
            <AlertTitle>{t('Not ready to publish yet')}</AlertTitle>
            <AlertDescription>
              {t(
                'Finish every check above before you can publish the authentication.',
              )}
            </AlertDescription>
          </Alert>
        )}
        <div>
          <Button
            disabled={alreadyPublished || !ready}
            onClick={() => setConfirmOpen(true)}
          >
            {alreadyPublished ? t('Published') : t('Publish authentication')}
          </Button>
        </div>
      </section>
      <AuthConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('Publish authentication "{name}"?', { name: authName })}
        description={t(
          'Publishing takes effect immediately and cannot be undone. Existing connections are not affected; new connections use the new configuration.',
        )}
        confirmLabel={t('Publish')}
        onConfirm={() => mutate()}
        isPending={isPending}
      />
    </div>
  );
}
