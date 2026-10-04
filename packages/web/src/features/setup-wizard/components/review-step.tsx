import { SetupStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { serviceMeta } from '@/features/system';

import { AccessAddress, WizardDraft } from '../utils/setup-wizard-utils';

export function ReviewStep({
  draft,
  status,
  access,
  failure,
}: {
  draft: WizardDraft;
  status: SetupStatus | undefined;
  access: AccessAddress;
  failure: string | null;
}) {
  const skipped = (status?.services ?? []).filter(
    (service) => !service.enabled,
  );
  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col divide-y rounded-lg border px-4 text-sm">
        <Row label={t('Administrator')}>
          {draft.fullName.trim()}
          <span className="text-muted-foreground"> · {draft.email.trim()}</span>
        </Row>
        <Row label={t('Organization')}>{draft.organizationName.trim()}</Row>
        <Row label={t('Access address')}>
          <span className="font-mono text-xs">{access.current}</span>
        </Row>
        {(status?.services ?? []).map((service) => (
          <Row
            key={service.kind}
            label={serviceMeta.name({ kind: service.kind })}
          >
            {service.enabled ? (
              service.detail ?? t('Enabled')
            ) : (
              <span className="text-muted-foreground">
                {t('Skipped for now')}
              </span>
            )}
          </Row>
        ))}
      </dl>
      {skipped.length > 0 && (
        <Alert>
          <AlertDescription>
            {t(
              'Features that need a skipped service show as not enabled. They do not fail, and you can turn the services on later under System and upgrades.',
            )}
          </AlertDescription>
        </Alert>
      )}
      {failure && (
        <Alert variant="destructive">
          <AlertTitle>{t('Setup was not completed')}</AlertTitle>
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all text-right">{children}</dd>
    </div>
  );
}
