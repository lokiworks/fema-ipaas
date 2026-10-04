import { OptionalServiceStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { Badge } from '@/components/ui/badge';

export function ServiceStatusBadge({
  service,
}: {
  service: OptionalServiceStatus;
}) {
  if (service.problem) {
    return <Badge variant="destructive">{t('Needs attention')}</Badge>;
  }
  return (
    <Badge variant={service.enabled ? 'success' : 'outline'}>
      {service.enabled ? t('Enabled') : t('Not enabled')}
    </Badge>
  );
}
