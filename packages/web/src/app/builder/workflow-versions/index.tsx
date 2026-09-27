import { t } from 'i18next';
import { GitCompare } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { LeftSideBarType } from '@/app/builder/types';
import { CardList, CardListItemSkeleton } from '@/components/custom/card-list';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { workflowHooks } from '@/features/workflows';

import { SidebarHeader } from '../sidebar-header';

import { CompareVersionsDialog } from './compare-versions-dialog';
import { versionNumbers } from './version-numbers';
import { WorkflowVersionDetailsCard } from './workflow-versions-card';

const WorkflowVersionsList = () => {
  const [workflow, setLeftSidebar, selectedWorkflowVersion] =
    useBuilderStateContext((state) => [
      state.workflow,
      state.setLeftSidebar,
      state.workflowVersion,
    ]);

  const {
    data: workflowVersionPage,
    isLoading,
    isError,
  } = workflowHooks.useListWorkflowVersions(workflow.id);
  const numbers = useMemo(
    () => versionNumbers.numberVersions(workflowVersionPage?.data ?? []),
    [workflowVersionPage],
  );
  const [compare, setCompare] = useState<{
    left: string | null;
    right: string | null;
  } | null>(null);

  return (
    <>
      <SidebarHeader onClose={() => setLeftSidebar(LeftSideBarType.NONE)}>
        <span className="grow">{t('Version History')}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          disabled={(workflowVersionPage?.data.length ?? 0) < 2}
          onClick={() => setCompare({ left: null, right: null })}
        >
          <GitCompare className="size-3.5" />
          {t('Compare')}
        </Button>
      </SidebarHeader>
      <CompareVersionsDialog
        open={compare !== null}
        onOpenChange={(open) => !open && setCompare(null)}
        workflowId={workflow.id}
        leftVersionId={compare?.left ?? null}
        rightVersionId={compare?.right ?? null}
      />
      <CardList>
        {isLoading && <CardListItemSkeleton numberOfCards={10} />}
        {isError && <div>{t('Error, please try again.')}</div>}
        {workflowVersionPage && workflowVersionPage.data && (
          <ScrollArea className="w-full h-full">
            {workflowVersionPage.data.map((workflowVersion) => (
              <WorkflowVersionDetailsCard
                selected={workflowVersion.id === selectedWorkflowVersion?.id}
                publishedVersionId={workflow.publishedVersionId}
                workflowVersion={workflowVersion}
                workflowVersionNumber={numbers[workflowVersion.id] ?? 0}
                onCompare={() =>
                  setCompare({
                    left: workflowVersion.id,
                    right:
                      workflowVersionPage.data[0]?.id === workflowVersion.id
                        ? workflowVersionPage.data[1]?.id ?? null
                        : workflowVersionPage.data[0]?.id ?? null,
                  })
                }
                key={workflowVersion.id}
              />
            ))}
          </ScrollArea>
        )}
      </CardList>
    </>
  );
};

WorkflowVersionsList.displayName = 'WorkflowVersionsList';

export { WorkflowVersionsList };
