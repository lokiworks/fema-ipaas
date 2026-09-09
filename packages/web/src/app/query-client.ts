import { isNil } from '@fema-ipaas/core-utils';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { openQueryErrorDialog } from '@/components/custom/error-dialog/error-dialog-store';
import { internalErrorToast } from '@/components/ui/sonner';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.showErrorDialog) {
        openQueryErrorDialog(error, query.queryKey);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (err: Error, _, __, mutation) => {
      if (!isNil(mutation.options.onError)) {
        return;
      }
      internalErrorToast();
    },
  }),
});
