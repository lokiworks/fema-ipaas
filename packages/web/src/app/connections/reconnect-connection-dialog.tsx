import { isNil } from '@fema-ipaas/core-utils';
import { ConnectionScope } from '@fema-ipaas/shared';

import { CreateOrEditConnectionDialog } from '@/app/connections/create-edit-connection-dialog';
import { connectionsQueries } from '@/features/connections/hooks/connections-hooks';
import { connectorsHooks } from '@/features/connectors';

export function ReconnectConnectionDialog({
  connectionId,
  open,
  onOpenChange,
  onReconnected,
}: {
  connectionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReconnected: () => void;
}) {
  const { data: connection } = connectionsQueries.useConnectionDetail({
    connectionId,
    enabled: open,
  });
  const { connectorModel, isLoading } = connectorsHooks.useConnector({
    name: connection?.connectorName ?? '',
    version: connection?.connectorVersion,
    enabled: open && !isNil(connection),
  });

  if (!open || isNil(connection) || isLoading || !connectorModel) {
    return null;
  }

  return (
    <CreateOrEditConnectionDialog
      key={`reconnect-${connection.id}-${open}`}
      reconnectConnection={connection}
      isGlobalConnection={connection.scope === ConnectionScope.TENANT}
      connector={connectorModel}
      open={open}
      setOpen={(nextOpen, reconnected) => {
        onOpenChange(nextOpen);
        if (reconnected) {
          onReconnected();
        }
      }}
    />
  );
}
