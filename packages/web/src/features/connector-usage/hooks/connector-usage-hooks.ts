import { ConnectorUsageEntry } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { connectorUsageApi } from '../api/connector-usage-api';

export const connectorUsageHooks = {
  useConnectorUsageSummary: () => {
    const query = useQuery({
      queryKey: ['connector-usage-summary'],
      queryFn: () => connectorUsageApi.summary(),
      staleTime: 60 * 1000,
    });
    const byConnectorName = useMemo(
      () => indexByConnectorName(query.data?.data ?? []),
      [query.data],
    );
    return {
      usage: query.data?.data,
      byConnectorName,
      isLoading: query.isLoading,
    };
  },
  useConnectorWorkflowUsage: (connectorName: string) => {
    return useQuery({
      queryKey: ['connector-usage-workflows', connectorName],
      queryFn: () => connectorUsageApi.workflows(connectorName),
      enabled: connectorName.length > 0,
    });
  },
};

function indexByConnectorName(
  entries: ConnectorUsageEntry[],
): Record<string, ConnectorUsageEntry> {
  return Object.fromEntries(
    entries.map((entry) => [entry.connectorName, entry]),
  );
}
