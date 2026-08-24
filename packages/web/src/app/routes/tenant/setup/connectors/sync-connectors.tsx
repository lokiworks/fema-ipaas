import { FlagId, ConnectorSyncMode } from '@fema-ipaas/shared';
import { RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { tenantConnectorsMutations } from '@/features/tenant-admin';
import { flagsHooks } from '@/hooks/flags-hooks';

const SyncConnectorsButton = () => {
  const { data: connectorsSyncMode } = flagsHooks.useFlag<string>(
    FlagId.CONNECTORS_SYNC_MODE,
  );
  const { mutate: syncConnectors, isPending } =
    tenantConnectorsMutations.useSyncConnectors();

  return (
    <>
      {connectorsSyncMode === ConnectorSyncMode.OFFICIAL_AUTO && (
        <Button
          variant={'outline'}
          onClick={() => syncConnectors()}
          loading={isPending}
          size={'sm'}
        >
          <RefreshCcw className="w-4 h-4 mr-2" /> Sync from Cloud
        </Button>
      )}
    </>
  );
};

SyncConnectorsButton.displayName = 'SyncConnectorsButton';
export { SyncConnectorsButton };
