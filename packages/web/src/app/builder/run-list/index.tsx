import { SeekPage } from '@fema-ipaas/core-utils';
import { Execution, isExecutionStateTerminal } from '@fema-ipaas/shared';
import { InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import React, { useMemo } from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { RightSideBarType } from '@/app/builder/types';
import {
  CardListEmpty,
  CardListItemSkeleton,
} from '@/components/custom/card-list';
import { Button } from '@/components/ui/button';
import { VirtualizedScrollArea } from '@/components/ui/virtualized-scroll-area';
import { executionsApi } from '@/features/executions';
import { authenticationSession } from '@/lib/authentication-session';

import { SidebarHeader } from '../sidebar-header';

import { WORKFLOW_CARD_HEIGHT, ExecutionCard } from './execution-card';

type RunsListItem =
  | { type: 'execution'; run: Execution }
  | { type: 'loadMoreButton'; id: 'loadMoreButton' };
const RunsList = React.memo(() => {
  const [workflow, setRightSidebar, run] = useBuilderStateContext((state) => [
    state.workflow,
    state.setRightSidebar,
    state.run,
  ]);

  const {
    data: runs,
    isLoading,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<
    SeekPage<Execution>,
    Error,
    InfiniteData<SeekPage<Execution>>
  >({
    queryKey: ['executions', workflow.id],
    getNextPageParam: (lastPage) => lastPage.next,
    initialPageParam: undefined,
    queryFn: ({ pageParam }) =>
      executionsApi.list({
        workflowId: [workflow.id],
        workspaceId: authenticationSession.getWorkspaceId()!,
        limit: 15,
        cursor: pageParam as string | undefined,
      }),
    refetchOnMount: true,
    staleTime: 0,
    refetchInterval: (query) => {
      const allRuns = query.state.data?.pages.flatMap((page) => page.data);
      const runningRuns = allRuns?.filter(
        (run) =>
          !isExecutionStateTerminal({
            status: run.status,
            ignoreInternalError: false,
          }),
      );
      return runningRuns?.length ? 15 * 1000 : false;
    },
  });

  const dedupedRuns: Execution[] = useMemo(() => {
    const seen = new Set<string>();
    return (runs?.pages.flatMap((page) => page.data) ?? []).filter((run) => {
      if (seen.has(run.id)) {
        return false;
      }
      seen.add(run.id);
      return true;
    });
  }, [runs]);

  const allViewedRuns: RunsListItem[] = useMemo(() => {
    const allRuns = dedupedRuns.map((run) => ({
      type: 'execution' as const,
      run,
    }));
    if (hasNextPage) {
      return [
        ...allRuns,
        { type: 'loadMoreButton' as const, id: 'loadMoreButton' },
      ];
    }
    return allRuns;
  }, [dedupedRuns, hasNextPage]);

  return (
    <div className="h-full w-full flex flex-col">
      <SidebarHeader onClose={() => setRightSidebar(RightSideBarType.NONE)}>
        {t('Recent Runs')}
      </SidebarHeader>
      {isLoading && <CardListItemSkeleton numberOfCards={10} />}

      {isError && <div>{t('Error, please try again.')}</div>}

      {runs && dedupedRuns.length === 0 && !isLoading && !isRefetching && (
        <CardListEmpty message={t('No runs found')} />
      )}

      {runs && dedupedRuns.length > 0 && (
        <VirtualizedScrollArea
          className="w-full grow max-w-[calc(100%-6px)]"
          items={allViewedRuns}
          estimateSize={() => WORKFLOW_CARD_HEIGHT}
          getItemKey={(index) => index}
          renderItem={(item) => {
            if (item.type === 'execution') {
              return (
                <ExecutionCard
                  refetchRuns={() => {
                    refetch();
                  }}
                  run={item.run}
                  key={item.run.id + item.run.status}
                  viewedRunId={run?.id}
                ></ExecutionCard>
              );
            }
            return (
              <div className="mx-5 h-full flex items-center ">
                <Button
                  className="w-full"
                  variant={'accent'}
                  onClick={() => fetchNextPage()}
                  loading={isFetchingNextPage}
                >
                  {t('More...')}
                </Button>
              </div>
            );
          }}
        ></VirtualizedScrollArea>
      )}
    </div>
  );
});

RunsList.displayName = 'RunsList';
export { RunsList };
