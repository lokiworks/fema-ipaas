import { ConnectorSelectorConfig } from '@fema-ipaas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { tenantApi } from '@/api/tenants-api';
import { connectorCacheUtils, connectorsApi } from '@/features/connectors';

export const tenantConnectorsMutations = {
  useToggleConnectorPin: ({
    tenantId,
    pinnedConnectors,
    refetch,
  }: {
    tenantId: string;
    pinnedConnectors: string[];
    refetch: () => Promise<void>;
  }) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (connectorName: string) => {
        const newPinnedConnectors = pinnedConnectors.includes(connectorName)
          ? pinnedConnectors.filter((name) => name !== connectorName)
          : [...pinnedConnectors, connectorName];
        await tenantApi.update(
          { pinnedConnectors: newPinnedConnectors },
          tenantId,
        );
        await refetch();
      },
      onSuccess: () => {
        connectorCacheUtils.invalidateConnectorCaches(queryClient);
        toast.success(t('Your changes have been saved.'), { duration: 3000 });
      },
    });
  },
  useUpdateConnectorSelectorConfig: ({
    tenantId,
    refetch,
  }: {
    tenantId: string;
    refetch: () => Promise<void>;
  }) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (
        connectorSelectorConfig: ConnectorSelectorConfig | null,
      ) => {
        await tenantApi.update({ connectorSelectorConfig }, tenantId);
        await refetch();
      },
      onSuccess: () => {
        connectorCacheUtils.invalidateConnectorCaches(queryClient);
        toast.success(t('Your changes have been saved.'), { duration: 3000 });
      },
      onError: () => {
        toast.error(t('Failed to save changes. Please try again.'));
      },
    });
  },
  useSyncConnectors: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async () => {
        await connectorsApi.syncFromCloud();
      },
      onSuccess: () => {
        connectorCacheUtils.invalidateConnectorCaches(queryClient);
        toast.success(t('Connectors synced'), {
          description: t('Connectors have been synced from the fema cloud.'),
        });
      },
    });
  },
};
