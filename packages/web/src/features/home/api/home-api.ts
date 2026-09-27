import { HomeSummary } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

function summary(since: string): Promise<HomeSummary> {
  return api.get<HomeSummary>('/v1/home/summary', { since });
}

export const homeApi = {
  summary,
};

export const homeHooks = {
  useSummary: ({ since }: { since: string }) =>
    useQuery({
      queryKey: [HOME_SUMMARY_QUERY_KEY, since],
      queryFn: () => summary(since),
      refetchInterval: SUMMARY_REFRESH_MS,
      meta: { showErrorDialog: true, loadSubsetOptions: {} },
    }),
};

const SUMMARY_REFRESH_MS = 60 * 1000;

export const HOME_SUMMARY_QUERY_KEY = 'home-summary';
