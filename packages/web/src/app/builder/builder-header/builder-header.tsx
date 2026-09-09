import {
  FlagId,
  WorkflowOperationType,
  WorkflowVersionState,
  supportUrl,
  UncategorizedFolderId,
} from '@fema-ipaas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { ChevronDown, CircleHelp } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  createSearchParams,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { LeftSideBarType } from '@/app/builder/types';
import { ActiveUsersWidget } from '@/components/custom/active-users-widget';
import EditableText from '@/components/custom/editable-text';
import { HomeButton } from '@/components/custom/home-button';
import { PageHeader } from '@/components/custom/page-header';
import { useEmbedding } from '@/components/providers/embed-provider';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { foldersHooks } from '@/features/folders';
import { getProjectName, projectCollectionUtils } from '@/features/projects';
import { workflowHooks } from '@/features/workflows';
import { WorkflowCreatedByBadge } from '@/features/workflows/components/workflow-created-by-badge';
import { flagsHooks } from '@/hooks/flags-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { useNewWindow } from '@/lib/navigation-utils';
import { NEW_WORKFLOW_QUERY_PARAM } from '@/lib/route-utils';
import { cn } from '@/lib/utils';

import WorkflowActionMenu from '../../components/workflow-actions-menu';
import { workflowCanvasConsts } from '../workflow-canvas/utils/consts';

import { DebugButton } from './debug-button';
import { BuilderPublishSection } from './publish-section';
import { RunStateChip } from './run-state-chip';
import { BuilderWorkflowStatusSection } from './workflow-status';

export const BuilderHeader = () => {
  const [queryParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const openNewWindow = useNewWindow();
  const { data: showSupport } = flagsHooks.useFlag<boolean>(
    FlagId.SHOW_COMMUNITY,
  );

  const [
    workflow,
    workflowVersion,
    moveToFolderClientSide,
    applyOperation,
    setLeftSidebar,
  ] = useBuilderStateContext((state) => [
    state.workflow,
    state.workflowVersion,
    state.moveToFolderClientSide,
    state.applyOperation,
    state.setLeftSidebar,
  ]);

  const { embedState } = useEmbedding();
  const { project } = projectCollectionUtils.useCurrentProject();

  const { data: folderData } = foldersHooks.useFolder(
    workflow.folderId ?? UncategorizedFolderId,
  );

  const isLatestVersion =
    workflowVersion.state === WorkflowVersionState.DRAFT ||
    workflowVersion.id === workflow.publishedVersionId;
  const [isEditingWorkflowName, setIsEditingWorkflowName] = useState(false);
  useEffect(() => {
    setIsEditingWorkflowName(
      queryParams.get(NEW_WORKFLOW_QUERY_PARAM) === 'true',
    );
  }, []);

  const goToWorkflowsPage = () => {
    navigate({
      pathname: authenticationSession.appendProjectRoutePrefix('/automations'),
      search: createSearchParams({
        folderId: folderData?.id ?? UncategorizedFolderId,
      }).toString(),
    });
  };

  const titleContent = (
    <div className="flex min-w-0 items-center gap-2 px-4">
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="min-w-0 flex-nowrap">
          {!embedState.disableNavigationInBuilder && (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink
                  onClick={goToWorkflowsPage}
                  className="cursor-pointer whitespace-nowrap text-sm"
                >
                  {getProjectName(project)}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          {!embedState.hideWorkflowNameInBuilder && (
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="min-w-0">
                <div
                  className={cn(
                    'flex min-w-0 items-center gap-1 overflow-hidden text-sm',
                    { 'max-w-[500px]': !isEditingWorkflowName },
                  )}
                >
                  <EditableText
                    className="hover:cursor-text"
                    value={workflowVersion.displayName}
                    readonly={!isLatestVersion}
                    onValueChange={(value) => {
                      applyOperation(
                        {
                          type: WorkflowOperationType.CHANGE_NAME,
                          request: {
                            displayName: value,
                          },
                        },
                        () => {
                          workflowHooks.invalidateWorkflowsQuery(queryClient);
                        },
                      );
                    }}
                    isEditing={isEditingWorkflowName}
                    setIsEditing={setIsEditingWorkflowName}
                    tooltipContent=""
                  />
                  <WorkflowActionMenu
                    onVersionsListClick={() => {
                      setLeftSidebar(LeftSideBarType.VERSIONS);
                    }}
                    insideBuilder={true}
                    workflow={workflow}
                    workflowVersion={workflowVersion}
                    readonly={!isLatestVersion}
                    onDelete={goToWorkflowsPage}
                    onRename={() => {
                      setIsEditingWorkflowName(true);
                    }}
                    onMoveTo={(folderId) => moveToFolderClientSide(folderId)}
                    onDuplicate={() => {}}
                  >
                    <Button
                      variant="ghost"
                      aria-label={t('More actions')}
                      className="size-6 flex items-center justify-center"
                    >
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </WorkflowActionMenu>
                </div>
              </BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
        <RunStateChip />
      </Breadcrumb>
    </div>
  );

  const rightContent = (
    <div className="flex shrink-0 flex-nowrap items-center justify-center gap-4">
      {showSupport && (
        <Button
          variant="ghost"
          className="gap-2 px-2"
          onClick={() => openNewWindow(supportUrl)}
        >
          <CircleHelp className="w-4 h-4"></CircleHelp>
          {t('Support')}
        </Button>
      )}
      {!embedState.hideActiveUsers && (
        <ActiveUsersWidget resourceId={workflow.id} />
      )}
      <BuilderWorkflowStatusSection></BuilderWorkflowStatusSection>
      <WorkflowCreatedByBadge createdBy={workflow.createdBy} />
      <Separator orientation="vertical" className="h-5" />
      <DebugButton />
      <BuilderPublishSection />
    </div>
  );

  const leftContent = embedState.isEmbedded ? <HomeButton /> : null;

  return (
    <div
      style={{
        height: `${workflowCanvasConsts.BUILDER_HEADER_HEIGHT}px`,
      }}
    >
      <PageHeader
        title={titleContent}
        rightContent={rightContent}
        leftContent={leftContent}
        className="select-none border-b"
      />
    </div>
  );
};
