import { useQuery } from '@tanstack/react-query';

import { PiecesOAuth2AppsMap } from '@/features/connections/utils/oauth2-utils';

export const oauthAppsQueries = {
  useOAuthAppConfigured(_pieceName: string) {
    return {
      refetch: () => Promise.resolve(),
      oauth2App: undefined,
    };
  },
  usePiecesOAuth2AppsMap() {
    return useQuery<PiecesOAuth2AppsMap, Error>({
      queryKey: ['connector-oauth2-apps'],
      queryFn: async () => ({}),
      staleTime: Infinity,
    });
  },
};
