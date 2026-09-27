import {
  OptionalServiceKind,
  SetupCheck,
  SetupCheckKind,
  SetupCheckLevel,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import { systemHooks } from '../hooks/system-hooks';

import { CheckLevel, CheckRow } from './check-row';

export function InstallChecksPanel() {
  const { data } = systemHooks.useSetupStatus({ enabled: true });
  if (!data || data.initialized) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3 p-6">
      <div className="flex flex-col gap-1">
        <span className="text-base font-medium">{t('Installation check')}</span>
        <span className="text-xs text-muted-foreground">
          {t(
            'The first account becomes the platform owner. Optional services can be set up later; until then their features stay switched off.',
          )}
        </span>
      </div>
      <div className="flex flex-col divide-y">
        {data.checks.map((check) => (
          <CheckRow
            key={check.kind}
            level={levelOf(check.level)}
            title={checkTitle(check.kind)}
          >
            {checkText(check)}
          </CheckRow>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium">{t('Optional services')}</span>
        {data.services.map((service) => (
          <span key={service.kind} className="text-xs text-muted-foreground">
            {serviceName(service.kind)}
            {' · '}
            {service.enabled ? t('Enabled') : t('Not configured')}
          </span>
        ))}
      </div>
    </div>
  );
}

function levelOf(level: SetupCheckLevel): CheckLevel {
  switch (level) {
    case SetupCheckLevel.OK:
      return 'ok';
    case SetupCheckLevel.WARNING:
      return 'warning';
    case SetupCheckLevel.ERROR:
      return 'error';
  }
}

function checkTitle(kind: SetupCheckKind): string {
  switch (kind) {
    case SetupCheckKind.DATABASE:
      return 'PostgreSQL';
    case SetupCheckKind.REDIS:
      return t('Queue');
    case SetupCheckKind.ENCRYPTION_KEY:
      return t('Encryption key');
    case SetupCheckKind.FILE_STORAGE:
      return t('Files');
    case SetupCheckKind.WORKERS:
      return t('Workers');
  }
}

function checkText(check: SetupCheck): string {
  switch (check.kind) {
    case SetupCheckKind.DATABASE:
      return check.level === SetupCheckLevel.OK
        ? t('Connected · {version}', { version: check.detail ?? '' })
        : t('Not reachable. Check the FEMA_POSTGRES_* settings.');
    case SetupCheckKind.REDIS:
      return check.level === SetupCheckLevel.OK
        ? t('Connected · {version}', { version: check.detail ?? '' })
        : t('Not reachable. Check the FEMA_REDIS_* settings.');
    case SetupCheckKind.ENCRYPTION_KEY:
      if (check.level === SetupCheckLevel.ERROR) {
        return t('No encryption key is configured. Set FEMA_ENCRYPTION_KEY.');
      }
      return check.level === SetupCheckLevel.WARNING
        ? t(
            'Generated automatically in {path}. Back it up now, apart from database backups.',
            { path: check.detail ?? '' },
          )
        : t('Set through FEMA_ENCRYPTION_KEY.');
    case SetupCheckKind.FILE_STORAGE:
      return check.detail === 'S3'
        ? t('Object storage')
        : t('Stored in the database');
    case SetupCheckKind.WORKERS:
      return check.level === SetupCheckLevel.OK
        ? t('{count} online', { count: Number(check.detail ?? 0) })
        : t(
            'No worker online yet. The built-in worker usually connects within a minute.',
          );
  }
}

function serviceName(kind: OptionalServiceKind): string {
  switch (kind) {
    case OptionalServiceKind.SMTP:
      return t('Email (SMTP)');
    case OptionalServiceKind.OBJECT_STORAGE:
      return t('Object storage');
    case OptionalServiceKind.CONNECTOR_REGISTRY:
      return t('Connector registry');
    case OptionalServiceKind.TEMPLATE_REGISTRY:
      return t('Template registry');
  }
}
