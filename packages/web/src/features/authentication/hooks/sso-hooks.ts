import { useQuery } from '@tanstack/react-query';

import { authenticationApi } from '@/api/authentication-api';

function useProviders() {
  return useQuery({
    queryKey: ['sso-providers'],
    queryFn: () => authenticationApi.ssoProviders(),
    staleTime: 30 * 1000,
  });
}

export const ssoHooks = {
  useProviders,
};
