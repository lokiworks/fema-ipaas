import { useQuery } from '@tanstack/react-query';

import { ConnectorsOAuth2AppsMap } from '@/features/connections/utils/oauth2-utils';

export const oauthAppsQueries = {
  useOAuthAppConfigured(_connectorName: string) {
    return {
      refetch: () => Promise.resolve(),
      oauth2App: undefined,
    };
  },
  useConnectorsOAuth2AppsMap() {
    return useQuery<ConnectorsOAuth2AppsMap, Error>({
      queryKey: ['connector-oauth2-apps'],
      queryFn: async () => ({}),
      staleTime: Infinity,
    });
  },
};
