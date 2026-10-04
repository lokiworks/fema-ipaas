import { OptionalServiceStatus, SetupStatus } from '@fema-ipaas/shared';
import { UseQueryResult } from '@tanstack/react-query';
import { t } from 'i18next';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  serviceMeta,
  ServiceCheck,
  ServiceProblem,
  ServiceStatusBadge,
  systemApi,
} from '@/features/system';

export function ServicesStep({
  status,
}: {
  status: UseQueryResult<SetupStatus>;
}) {
  if (status.isLoading || !status.data) {
    return <Skeleton className="h-72 w-full" />;
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {status.data.services.map((service) => (
          <ServiceCard key={service.kind} service={service} />
        ))}
      </div>
      <Alert>
        <AlertDescription>
          {t(
            'These services are set with environment variables on the server and take effect after a restart. Your answers so far are kept while you restart, except the password.',
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}

function ServiceCard({ service }: { service: OptionalServiceStatus }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {serviceMeta.name({ kind: service.kind })}
        </span>
        <ServiceStatusBadge service={service} />
        {service.enabled && service.detail && (
          <span className="truncate text-xs text-muted-foreground">
            {service.detail}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {service.enabled
          ? serviceMeta.whenEnabled({ kind: service.kind })
          : t('Skipped for now. {effect}', {
              effect: serviceMeta.whenDisabled({ kind: service.kind }),
            })}
      </p>
      {service.problem && <ServiceProblem problem={service.problem} />}
      {service.enabled ? (
        <ServiceCheck
          kind={service.kind}
          check={({ kind }) => systemApi.checkSetupService({ kind })}
        />
      ) : (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">
            {t('How to turn it on')}
          </summary>
          <div className="mt-2 flex flex-col gap-1.5">
            <span>
              {t('Set these variables on the server and restart the app:')}
            </span>
            <CopyToClipboardInput
              useInput
              textToCopy={serviceMeta.variables({ kind: service.kind })}
            />
          </div>
        </details>
      )}
    </div>
  );
}
