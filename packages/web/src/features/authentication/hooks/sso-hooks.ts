import { useQuery } from '@tanstack/react-query';

import { authenticationApi } from '@/api/authentication-api';
import { tenantContext } from '@/lib/tenant-context';

function useProviders() {
  const tenant = tenantContext.get();
  return useQuery({
    queryKey: ['sso-providers', tenant],
    queryFn: () => authenticationApi.ssoProviders({ tenant }),
    staleTime: 30 * 1000,
  });
}

export const ssoHooks = {
  useProviders,
};
