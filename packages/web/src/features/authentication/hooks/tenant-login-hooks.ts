import { PublicTenantInfo, TenantMembershipOption } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';

import { authenticationApi } from '@/api/authentication-api';
import { HttpError } from '@/lib/api';

function usePublicTenant(slugOrId: string | null) {
  return useQuery<PublicTenantInfo, HttpError>({
    queryKey: ['public-tenant', slugOrId],
    queryFn: () => authenticationApi.publicTenant(slugOrId ?? ''),
    enabled: slugOrId !== null,
    retry: false,
    staleTime: 60 * 1000,
  });
}

function useTenantSelectionOptions(selectionToken: string) {
  return useQuery<TenantMembershipOption[], HttpError>({
    queryKey: ['tenant-selection-options', selectionToken],
    queryFn: async () => {
      const response = await authenticationApi.tenantSelectionOptions({
        selectionToken,
      });
      return response.tenants;
    },
    retry: false,
    staleTime: Infinity,
  });
}

export const tenantLoginHooks = {
  usePublicTenant,
  useTenantSelectionOptions,
};
