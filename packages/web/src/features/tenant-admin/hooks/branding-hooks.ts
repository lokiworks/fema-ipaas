import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { tenantApi } from '@/api/tenants-api';

export const brandingMutations = {
  useUpdateAppearance: ({ tenantId }: { tenantId: string }) => {
    return useMutation({
      mutationFn: async (formData: FormData) => {
        await tenantApi.updateWithFormData(formData, tenantId);
        window.location.reload();
      },
      onSuccess: () => {
        toast.success(t('Your changes have been saved.'), { duration: 3000 });
      },
    });
  },
};
