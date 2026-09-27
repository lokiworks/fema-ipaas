import { GlobalSearchResponse } from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const globalSearchApi = {
  search(query: string): Promise<GlobalSearchResponse> {
    return api.get<GlobalSearchResponse>('/v1/global-search', { query });
  },
};
