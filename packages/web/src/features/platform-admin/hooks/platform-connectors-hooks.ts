import { ConnectorSelectorConfig } from '@fema/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { platformApi } from '@/api/platforms-api';
import { connectorCacheUtils, connectorsApi } from '@/features/connectors';

export const platformConnectorsMutations = {
  useToggleConnectorPin: ({
    platformId,
    pinnedConnectors,
    refetch,
  }: {
    platformId: string;
    pinnedConnectors: string[];
    refetch: () => Promise<void>;
  }) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (connectorName: string) => {
        const newPinnedConnectors = pinnedConnectors.includes(connectorName)
          ? pinnedConnectors.filter((name) => name !== connectorName)
          : [...pinnedConnectors, connectorName];
        await platformApi.update(
          { pinnedConnectors: newPinnedConnectors },
          platformId,
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
    platformId,
    refetch,
  }: {
    platformId: string;
    refetch: () => Promise<void>;
  }) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (
        connectorSelectorConfig: ConnectorSelectorConfig | null,
      ) => {
        await platformApi.update({ connectorSelectorConfig }, platformId);
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
