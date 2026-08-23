import { ApFlagId, ConnectorSyncMode } from '@fema/shared';
import { RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { platformConnectorsMutations } from '@/features/platform-admin';
import { flagsHooks } from '@/hooks/flags-hooks';

const SyncConnectorsButton = () => {
  const { data: connectorsSyncMode } = flagsHooks.useFlag<string>(
    ApFlagId.CONNECTORS_SYNC_MODE,
  );
  const { mutate: syncConnectors, isPending } =
    platformConnectorsMutations.useSyncConnectors();

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
