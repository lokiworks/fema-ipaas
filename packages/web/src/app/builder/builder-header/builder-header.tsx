import { isNil } from '@fema-ipaas/core-utils';
import {
  FlagId,
  Permission,
  WorkflowOperationType,
  WorkflowVersionState,
  supportUrl,
} from '@fema-ipaas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { CircleHelp, PencilLine, Workflow } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { useBuilderSnapshotVersionId } from '@/app/builder/snapshot-context';
import { ActiveUsersWidget } from '@/components/custom/active-users-widget';
import EditableText from '@/components/custom/editable-text';
import { HomeButton } from '@/components/custom/home-button';
import { PageHeader } from '@/components/custom/page-header';
import { useEmbedding } from '@/components/providers/embed-provider';
import { Button } from '@/components/ui/button';
import { AiAssistantButton } from '@/features/ai';
import { WorkflowMoreMenu } from '@/features/project-workspace/components/workflow-more-menu';
import { useWorkspaceContext } from '@/features/project-workspace/hooks/use-workspace-context';
import { projectCollectionUtils } from '@/features/projects';
import { workflowHooks } from '@/features/workflows';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { flagsHooks } from '@/hooks/flags-hooks';
import { useNewWindow } from '@/lib/navigation-utils';
import { NEW_WORKFLOW_QUERY_PARAM } from '@/lib/route-utils';
import { cn } from '@/lib/utils';

import { workflowCanvasConsts } from '../workflow-canvas/utils/consts';

import { DebugButton } from './debug-button';
import { usePublishGuard } from './publish-guard';
import { BuilderPublishSection } from './publish-section';
import { RunStateChip } from './run-state-chip';
import { useAssistantBridge } from './use-assistant-bridge';
import { useDraftChanged } from './use-draft-changed';
import { WorkflowMetaLine, WorkflowStateTags } from './workflow-header-status';
import { EditWorkflowOrViewDraftButton } from './workflow-status/view-draft-or-edit-workflow-button';

export const BuilderHeader = () => {
  const [queryParams] = useSearchParams();
  const queryClient = useQueryClient();
  const openNewWindow = useNewWindow();
  const { data: showSupport } = flagsHooks.useFlag<boolean>(
    FlagId.SHOW_COMMUNITY,
  );

  const [
    workflow,
    workflowVersion,
    applyOperation,
    isValid,
    isSaving,
    editLockHolder,
  ] = useBuilderStateContext((state) => [
    state.workflow,
    state.workflowVersion,
    state.applyOperation,
    state.workflowVersion.valid,
    state.saving,
    state.editLockHolder,
  ]);
  const publishGuard = usePublishGuard({
    lockedByName: editLockHolder?.userDisplayName ?? null,
  });
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const draftChanged = useDraftChanged({
    baselineVersionId: workflow.publishedVersionId,
  });

  const assistantBridge = useAssistantBridge();
  const snapshotVersionId = useBuilderSnapshotVersionId();
  const { embedState } = useEmbedding();
  const { project } = projectCollectionUtils.useCurrentProject();
  const workspace = useWorkspaceContext(project);
  const treeRow = workspace.tree.data?.workflows.find(
    (row) => row.id === workflow.id,
  );
  const { checkAccess } = useAuthorization();

  const isLatestVersion =
    workflowVersion.state === WorkflowVersionState.DRAFT ||
    workflowVersion.id === workflow.publishedVersionId;
  const [isEditingWorkflowName, setIsEditingWorkflowName] = useState(
    () => queryParams.get(NEW_WORKFLOW_QUERY_PARAM) === 'true',
  );

  const menuWorkflow = treeRow && {
    ...treeRow,
    hasUnpublishedChanges:
      isLatestVersion &&
      workflowVersion.state === WorkflowVersionState.DRAFT &&
      treeRow.published &&
      !isNil(draftChanged)
        ? draftChanged
        : treeRow.hasUnpublishedChanges,
  };
  const publishDisabledReason = isSaving
    ? t('Saving...')
    : publishGuard.blockedReason ??
      (isValid ? null : t('You have incomplete steps'));

  const titleContent = (
    <div className="flex min-w-0 items-center gap-2.5 px-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Workflow className="size-4" />
      </span>
      <div className="flex min-w-0 flex-col justify-center gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {!embedState.hideWorkflowNameInBuilder && (
            <div
              className={cn(
                'flex min-w-[7rem] items-center gap-0.5 overflow-hidden text-sm font-medium',
                { 'max-w-[420px]': !isEditingWorkflowName },
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
              {isLatestVersion && !isEditingWorkflowName && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('Rename')}
                  className="size-6 shrink-0 text-muted-foreground"
                  onClick={() => setIsEditingWorkflowName(true)}
                >
                  <PencilLine className="size-3.5" />
                </Button>
              )}
            </div>
          )}
          <div className="flex min-w-0 shrink-[4] items-center gap-1.5 overflow-hidden">
            <RunStateChip />
            <WorkflowStateTags />
          </div>
        </div>
        <WorkflowMetaLine />
      </div>
    </div>
  );

  const rightContent = (
    <div className="flex shrink-0 flex-nowrap items-center justify-center gap-2">
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
      {menuWorkflow && isNil(snapshotVersionId) && (
        <WorkflowMoreMenu
          workflow={menuWorkflow}
          context={workspace}
          triggerClassName="size-8 border"
          publishAction={
            project.releasesEnabled
              ? 'hidden'
              : {
                  onSelect: () =>
                    publishGuard.run(() => setPublishDialogOpen(true)),
                  disabledReason: publishDisabledReason,
                }
          }
        />
      )}
      {checkAccess(Permission.READ_WORKFLOW) && (
        <AiAssistantButton
          projectId={workflow.projectId}
          workflowId={workflow.id}
          bridge={assistantBridge}
        />
      )}
      {isNil(snapshotVersionId) && (
        <EditWorkflowOrViewDraftButton onCanvas={false} />
      )}
      {isNil(snapshotVersionId) && <DebugButton />}
      {isNil(snapshotVersionId) && (
        <div data-tour="builder-publish" className="flex items-center">
          <BuilderPublishSection
            guard={publishGuard}
            publishDialogOpen={publishDialogOpen}
            onPublishDialogOpenChange={setPublishDialogOpen}
          />
        </div>
      )}
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
