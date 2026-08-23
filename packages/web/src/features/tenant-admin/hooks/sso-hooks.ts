import { UpdateTenantRequestBody } from '@fema-ipaas/shared';
import { useMutation } from '@tanstack/react-query';

import { tenantApi } from '@/api/tenants-api';

export const ssoMutations = {
  useUpdateTenantSso: ({
    tenantId,
    refetch,
    onSuccess,
  }: {
    tenantId: string;
    refetch: () => Promise<void>;
    onSuccess?: () => void;
  }) => {
    return useMutation({
      mutationFn: async (request: UpdateTenantRequestBody) => {
        await tenantApi.update(request, tenantId);
        await refetch();
      },
      onSuccess: () => {
        if (onSuccess) {
          onSuccess();
        }
      },
    });
  },
};
