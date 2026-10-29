import { isNil, Permission } from '@fema-ipaas/core-utils';
import {
  Execution,
  FlagId,
  WorkflowVersion,
  WorkflowVersionState,
} from '@fema-ipaas/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { LeftSideBarType, RightSideBarType } from '@/app/builder/types';
import { versionNumbers } from '@/app/builder/workflow-versions/version-numbers';
import { LoadingSpinner } from '@/components/custom/spinner';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  WORKSPACE_KEY,
  projectWorkspaceHooks,
} from '@/features/project-workspace/hooks/project-workspace-hooks';
import { projectCollectionUtils } from '@/features/projects';
import {
  DeployToTestDialog,
  EnvironmentStatus,
  ReleaseRequestDialog,
  releasesHooks,
  releaseUiUtils,
} from '@/features/releases';
import { workflowHooks, workflowsApi } from '@/features/workflows';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { flagsHooks } from '@/hooks/flags-hooks';

import { DiscardChangesDialog } from './discard-changes-dialog';
import { PublishDialog } from './publish-dialog';
import { PublishGuard, usePublishGuard } from './publish-guard';
import { useDraftChanged } from './use-draft-changed';
import { useSetVersionKeepingSelection } from './use-set-version-keeping-selection';

export const BuilderPublishSection = ({
  guard,
  publishDialogOpen,
  onPublishDialogOpenChange,
}: {
  guard: PublishGuard;
  publishDialogOpen: boolean;
  onPublishDialogOpenChange: (open: boolean) => void;
}) => {
  const { project } = projectCollectionUtils.useCurrentProject();
  if (project.releasesEnabled) {
    return <EnvironmentsPublishSection projectId={project.id} />;
  }
  return (
    <SingleEnvironmentPublishSection
      guard={guard}
      publishDialogOpen={publishDialogOpen}
      onPublishDialogOpenChange={onPublishDialogOpenChange}
    />
  );
};

function SingleEnvironmentPublishSection({
  guard,
  publishDialogOpen,
  onPublishDialogOpenChange,
}: {
  guard: PublishGuard;
  publishDialogOpen: boolean;
  onPublishDialogOpenChange: (open: boolean) => void;
}) {
  const [
    isSaving,
    isPublishing,
    setIsPublishing,
    isValid,
    workflow,
    setWorkflow,
    setVersion,
    setRightSidebar,
    setLeftSidebar,
    workflowVersion,
    run,
  ] = useBuilderStateContext((state) => [
    state.saving,
    state.isPublishing,
    state.setIsPublishing,
    state.workflowVersion.valid,
    state.workflow,
    state.setWorkflow,
    state.setVersion,
    state.setRightSidebar,
    state.setLeftSidebar,
    state.workflowVersion,
    state.run,
  ]);
  const draftChanged = useDraftChanged({
    baselineVersionId: workflow.publishedVersionId,
  });
  const hasNoChanges = draftChanged === false;
  const canPublish = useCanPublish({
    workflowVersion,
    isPublishing,
    run,
    isSaving,
  });
  const { mutate: publishBatch } = projectWorkspaceHooks.useBatchPublish();
  const { rememberSelection, setVersionKeepingSelection } =
    useSetVersionKeepingSelection();
  const queryClient = useQueryClient();
  const publish = (description: string | undefined) => {
    rememberSelection();
    setIsPublishing(true);
    publishBatch(
      {
        projectId: workflow.projectId,
        workflowIds: [workflow.id],
        description,
      },
      {
        onSuccess: async (response) => {
          const failure = response.items.find((item) => !item.success);
          if (!isNil(failure)) {
            setIsPublishing(false);
            toast.error(t(failure.error ?? 'Publish failed'));
            return;
          }
          const updatedWorkflow = await workflowsApi.get(workflow.id);
          setWorkflow(updatedWorkflow);
          setVersionKeepingSelection(updatedWorkflow.version);
          setIsPublishing(false);
          void queryClient.invalidateQueries({
            queryKey: ['workflow-versions', workflow.id],
          });
          onPublishDialogOpenChange(false);
          toast.success(t('Published. The workflow is now running.'));
        },
        onError: () => setIsPublishing(false),
      },
    );
  };
  const { mutateAsync: overWriteDraftWithVersion } =
    workflowHooks.useOverWriteDraftWithVersion({
      onSuccess: (updatedWorkflow) => {
        void queryClient.invalidateQueries({ queryKey: [WORKSPACE_KEY] });
        setVersion(updatedWorkflow.version);
        setRightSidebar(RightSideBarType.NONE);
        setLeftSidebar(LeftSideBarType.NONE);
      },
    });
  const { data: versionList } = workflowHooks.useListWorkflowVersions(
    workflow.id,
  );
  const liveVersionLabel = versionNumbers.label({
    numbers: versionNumbers.numberVersions(versionList?.data ?? []),
    versionId: workflow.publishedVersionId,
  });
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const { mutate: discardChange, isPending: isDiscardingChanges } = useMutation(
    {
      mutationFn: async () => {
        if (!workflow.publishedVersionId) {
          return;
        }
        await overWriteDraftWithVersion({
          workflowId: workflow.id,
          versionId: workflow.publishedVersionId,
        });
      },
    },
  );

  const isViewingPublishedVersion =
    !isNil(workflow.publishedVersionId) &&
    workflow.publishedVersionId === workflowVersion.id;

  const isBusy = isPublishing || isDiscardingChanges || isSaving;
  const isUpToDateWithLive =
    isNil(run) &&
    !isNil(workflow.publishedVersionId) &&
    !isBusy &&
    (isViewingPublishedVersion || hasNoChanges);

  if (isUpToDateWithLive) {
    return <PublishedIndicator />;
  }

  if (!canPublish) {
    return null;
  }

  const statusText = pickStatusText({
    isDiscardingChanges,
    isPublishing,
    isSaving,
  });
  const canDiscard =
    !isNil(workflow.publishedVersionId) &&
    !isBusy &&
    !hasNoChanges &&
    workflow.publishedVersionId !== workflowVersion.id;

  return (
    <div className="flex items-center gap-2">
      {(isBusy || !isNil(statusText)) && (
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
          {isBusy && (
            <LoadingSpinner className="size-3 stroke-muted-foreground" />
          )}
          {statusText}
        </span>
      )}
      {canDiscard && (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => setDiscardDialogOpen(true)}
        >
          {t('Discard changes')}
        </Button>
      )}
      <DiscardChangesDialog
        open={discardDialogOpen}
        liveVersionLabel={liveVersionLabel}
        onCancel={() => setDiscardDialogOpen(false)}
        onConfirm={() => {
          setDiscardDialogOpen(false);
          discardChange();
        }}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="tooltip-wrapper">
            <Button
              size="sm"
              variant="default"
              loading={isSaving}
              name="Publish"
              onClick={() => guard.run(() => onPublishDialogOpenChange(true))}
              disabled={
                !isValid ||
                isBusy ||
                hasNoChanges ||
                !isNil(guard.blockedReason)
              }
            >
              {t('Publish')}
            </Button>
          </div>
        </TooltipTrigger>
        {isSaving ? (
          <TooltipContent>{t('Saving...')}</TooltipContent>
        ) : !isNil(guard.blockedReason) ? (
          <TooltipContent>{guard.blockedReason}</TooltipContent>
        ) : hasNoChanges ? (
          <TooltipContent>
            {t('Nothing to publish, the live version is already up to date')}
          </TooltipContent>
        ) : (
          !isValid && (
            <TooltipContent>{t('You have incomplete steps')}</TooltipContent>
          )
        )}
      </Tooltip>
      {guard.dialog}
      <PublishDialog
        open={publishDialogOpen}
        onOpenChange={onPublishDialogOpenChange}
        isPublishing={isPublishing}
        onConfirm={publish}
      />
    </div>
  );
}

function PublishedIndicator() {
  return (
    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
      <CircleCheck className="size-3.5 text-success" />
      {t('Published')}
    </span>
  );
}

function EnvironmentsPublishSection({ projectId }: { projectId: string }) {
  const [
    isSaving,
    isPublishing,
    setIsPublishing,
    isValid,
    workflow,
    setWorkflow,
    workflowVersion,
    run,
    editLockHolder,
  ] = useBuilderStateContext((state) => [
    state.saving,
    state.isPublishing,
    state.setIsPublishing,
    state.workflowVersion.valid,
    state.workflow,
    state.setWorkflow,
    state.workflowVersion,
    state.run,
    state.editLockHolder,
  ]);
  const guard = usePublishGuard({
    lockedByName: editLockHolder?.userDisplayName ?? null,
    target: 'test',
  });
  const hasNoChangesToDeploy =
    useDraftChanged({ baselineVersionId: workflow.testVersionId }) === false;
  const { checkAccess } = useAuthorization();
  const canDeploy = checkAccess(Permission.WRITE_WORKFLOW);
  const canPromote = checkAccess(Permission.WRITE_PROJECT_RELEASE);
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const { data: webhookUrlPrefix } = flagsHooks.useFlag<string>(
    FlagId.WEBHOOK_URL_PREFIX,
  );
  const { data: overview } = releasesHooks.useEnvironments({
    projectId,
    enabled: canPromote,
    showErrorDialog: false,
  });
  const { mutateAsync: deployToTest } = releasesHooks.useDeployToTest();
  const { rememberSelection, setVersionKeepingSelection } =
    useSetVersionKeepingSelection();
  const { mutate: deploy } = useMutation({
    mutationFn: async (note: string | undefined) => {
      rememberSelection();
      setIsPublishing(true);
      try {
        await deployToTest({ projectId, workflowId: workflow.id, note });
        return await workflowsApi.get(workflow.id);
      } finally {
        setIsPublishing(false);
      }
    },
    onSuccess: (updatedWorkflow) => {
      setWorkflow(updatedWorkflow);
      setVersionKeepingSelection(updatedWorkflow.version);
      toast.success(t('Deployed to test'), {
        description: releaseUiUtils.isWebhookTrigger(
          updatedWorkflow.version.trigger,
        )
          ? t('Send test requests to {url}', {
              url: releaseUiUtils.testWebhookUrl({
                webhookUrlPrefix,
                workflowId: updatedWorkflow.id,
              }),
            })
          : undefined,
      });
    },
  });
  const { mutate: refreshWorkflow } = useMutation({
    mutationFn: () => workflowsApi.get(workflow.id),
    onSuccess: (updatedWorkflow) => setWorkflow(updatedWorkflow),
  });

  if (!isNil(run)) {
    return null;
  }

  const isDraft = workflowVersion.state === WorkflowVersionState.DRAFT;
  const isBusy = isPublishing || isSaving;
  const pendingReleaseId =
    overview?.workflows.find((row) => row.workflowId === workflow.id)
      ?.pendingReleaseId ?? null;
  const blocker = releaseUiUtils.promotionBlocker({
    testVersionId: workflow.testVersionId,
    productionVersionId: workflow.publishedVersionId,
    pendingReleaseId,
  });
  const promoteDisabledReason = isPublishing
    ? t('Deploying to test...')
    : !isNil(editLockHolder)
    ? guard.blockedReason
    : isNil(blocker)
    ? null
    : releaseUiUtils.promotionBlockerText(blocker);
  const deployDisabledReason = isSaving
    ? t('Saving...')
    : !isNil(guard.blockedReason)
    ? guard.blockedReason
    : !isValid
    ? t('You have incomplete steps')
    : hasNoChangesToDeploy
    ? t('Nothing to deploy, test already runs this version')
    : null;
  const status = releaseUiUtils.environmentStatus({
    versionId: workflowVersion.id,
    isDraft,
    testVersionId: workflow.testVersionId,
    productionVersionId: workflow.publishedVersionId,
  });

  return (
    <div className="flex items-center gap-2">
      <EnvironmentStatusText
        status={status}
        isSaving={isSaving}
        isDeploying={isPublishing}
        hasNoChangesToDeploy={hasNoChangesToDeploy}
      />
      {canDeploy && isDraft && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="tooltip-wrapper">
              <Button
                size="sm"
                variant="default"
                loading={isBusy}
                name="Deploy to test"
                onClick={() => guard.run(() => setDeployDialogOpen(true))}
                disabled={!isNil(deployDisabledReason) || isBusy}
              >
                {t('Deploy to test')}
              </Button>
            </div>
          </TooltipTrigger>
          {!isNil(deployDisabledReason) && (
            <TooltipContent>{deployDisabledReason}</TooltipContent>
          )}
        </Tooltip>
      )}
      {canPromote && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="tooltip-wrapper">
              <Button
                size="sm"
                variant={isDraft && canDeploy ? 'outline' : 'default'}
                name="Promote to production"
                onClick={() => setPromoteDialogOpen(true)}
                disabled={!isNil(promoteDisabledReason)}
              >
                {t('Promote to production')}
              </Button>
            </div>
          </TooltipTrigger>
          {!isNil(promoteDisabledReason) && (
            <TooltipContent>{promoteDisabledReason}</TooltipContent>
          )}
        </Tooltip>
      )}
      {guard.dialog}
      <DeployToTestDialog
        open={deployDialogOpen}
        onOpenChange={setDeployDialogOpen}
        onConfirm={(note) => {
          setDeployDialogOpen(false);
          deploy(note);
        }}
      />
      <ReleaseRequestDialog
        open={promoteDialogOpen}
        onOpenChange={setPromoteDialogOpen}
        workflowId={workflow.id}
        onPromoted={() => refreshWorkflow()}
      />
    </div>
  );
}

function EnvironmentStatusText({
  status,
  isSaving,
  isDeploying,
  hasNoChangesToDeploy,
}: {
  status: EnvironmentStatus;
  isSaving: boolean;
  isDeploying: boolean;
  hasNoChangesToDeploy: boolean;
}) {
  if (isSaving || isDeploying) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
        <LoadingSpinner className="size-3 stroke-muted-foreground" />
        {isSaving ? t('Saving...') : t('Deploying to test...')}
      </span>
    );
  }
  if (status === EnvironmentStatus.NONE) {
    return null;
  }
  if (status === EnvironmentStatus.NOT_DEPLOYED) {
    return (
      <span className="flex shrink-0 items-center whitespace-nowrap text-xs text-muted-foreground">
        {hasNoChangesToDeploy
          ? t('No changes to deploy to test')
          : t('Changes not deployed to test')}
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
      <CircleCheck className="size-3.5 text-success" />
      {DEPLOYED_STATUS_LABELS[status]()}
    </span>
  );
}

const useCanPublish = ({
  workflowVersion,
  isPublishing,
  run,
  isSaving,
}: {
  workflowVersion: WorkflowVersion;
  isPublishing: boolean;
  run: Execution | null;
  isSaving: boolean;
}) => {
  const { checkAccess } = useAuthorization();
  const permissionToEditWorkflow = checkAccess(Permission.WRITE_WORKFLOW);
  const isViewingPublishableVersion =
    workflowVersion.state === WorkflowVersionState.DRAFT;
  return (
    ((permissionToEditWorkflow && isViewingPublishableVersion) ||
      isPublishing ||
      isSaving) &&
    isNil(run)
  );
};

function pickStatusText({
  isDiscardingChanges,
  isPublishing,
  isSaving,
}: {
  isDiscardingChanges: boolean;
  isPublishing: boolean;
  isSaving: boolean;
}) {
  if (isSaving) {
    return t('Saving...');
  }
  if (isDiscardingChanges) {
    return t('Discarding changes...');
  }
  if (isPublishing) {
    return t('Publishing...');
  }
  return null;
}

const DEPLOYED_STATUS_LABELS: Record<
  | EnvironmentStatus.TEST
  | EnvironmentStatus.PRODUCTION
  | EnvironmentStatus.TEST_AND_PRODUCTION,
  () => string
> = {
  [EnvironmentStatus.TEST]: () => t('In test'),
  [EnvironmentStatus.PRODUCTION]: () => t('In production'),
  [EnvironmentStatus.TEST_AND_PRODUCTION]: () => t('In test and production'),
};
