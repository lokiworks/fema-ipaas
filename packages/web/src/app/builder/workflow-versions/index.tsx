import { t } from 'i18next';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { LeftSideBarType } from '@/app/builder/types';
import { CardList, CardListItemSkeleton } from '@/components/custom/card-list';
import { ScrollArea } from '@/components/ui/scroll-area';
import { workflowHooks } from '@/features/workflows';

import { SidebarHeader } from '../sidebar-header';

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

  return (
    <>
      <SidebarHeader onClose={() => setLeftSidebar(LeftSideBarType.NONE)}>
        {t('Version History')}
      </SidebarHeader>
      <CardList>
        {isLoading && <CardListItemSkeleton numberOfCards={10} />}
        {isError && <div>{t('Error, please try again.')}</div>}
        {workflowVersionPage && workflowVersionPage.data && (
          <ScrollArea className="w-full h-full">
            {workflowVersionPage.data.map((workflowVersion, index) => (
              <WorkflowVersionDetailsCard
                selected={workflowVersion.id === selectedWorkflowVersion?.id}
                publishedVersionId={workflow.publishedVersionId}
                workflowVersion={workflowVersion}
                workflowVersionNumber={workflowVersionPage.data.length - index}
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
