import { ConnectorBlueprintDetail } from '@fema-ipaas/shared';

import { BlueprintAuthDevWizard } from './auth-dev-wizard';
import { BlueprintAuthOverview } from './auth-overview';

export function BlueprintAuthSection({
  detail,
  sub,
}: {
  detail: ConnectorBlueprintDetail;
  sub: string | undefined;
}) {
  if (sub === 'dev') {
    return <BlueprintAuthDevWizard detail={detail} />;
  }
  return <BlueprintAuthOverview detail={detail} />;
}
