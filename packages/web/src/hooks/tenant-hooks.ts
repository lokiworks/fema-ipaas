import { TenantWithoutSensitiveData } from '@fema-ipaas/shared';
import {
  QueryClient,
  useMutation,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { t } from 'i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { tenantApi } from '@/api/tenants-api';
import { authenticationSession } from '@/lib/authentication-session';

import { flagsHooks } from './flags-hooks';

export const tenantHooks = {
  useDeleteTenant: () => {
    const navigate = useNavigate();
    return useMutation({
      mutationFn: async () => {
        await tenantApi.deleteTenant();
      },
      onSuccess: () => {
        toast.success(t('Tenant deleted successfully'));
        navigate('/sign-in');
      },
      onError: () => {
        toast.error(t('Failed to delete tenant. Please try again.'));
      },
    });
  },
  useCurrentTenant: () => {
    const currentTenantId = authenticationSession.getTenantId();
    const query = useSuspenseQuery({
      queryKey: ['tenant', currentTenantId],
      queryFn: tenantApi.getCurrentTenant,
      staleTime: 10 * 1000,
    });
    return {
      tenant: query.data,
      refetch: async () => {
        await query.refetch();
      },
      setCurrentTenant: (
        queryClient: QueryClient,
        tenant: TenantWithoutSensitiveData,
      ) => {
        queryClient.setQueryData(['tenant', currentTenantId], tenant);
      },
    };
  },
  useUpdateLisenceKey: (queryClient: QueryClient) => {
    const currentTenantId = authenticationSession.getTenantId();

    return useMutation({
      mutationFn: async (tempLicenseKey: string) => {
        if (tempLicenseKey.trim() === '') return;
        await tenantApi.activateLicenseKey(tempLicenseKey.trim());
      },
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: ['tenant', currentTenantId],
        });
        queryClient.invalidateQueries({
          queryKey: flagsHooks.queryKey,
        });
        queryClient.invalidateQueries({
          queryKey: ['tenant-billing-subscription'],
        });
        toast.success(t('License activated successfully!'));
      },
      onError: () => {
        toast.error(t('Activation failed, invalid license key'));
      },
    });
  },
};
