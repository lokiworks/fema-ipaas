import { isNil, Permission } from '@fema-ipaas/core-utils';
import {
  Execution,
  FlagId,
  PopulatedWorkflow,
  WorkflowVersion,
  WorkflowVersionState,
} from '@fema-ipaas/shared';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { LeftSideBarType, RightSideBarType } from '@/app/builder/types';
import { LoadingSpinner } from '@/components/custom/spinner';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { projectCollectionUtils } from '@/features/projects';
import {
  EnvironmentStatus,
  ReleaseRequestDialog,
  releasesHooks,
  releaseUiUtils,
} from '@/features/releases';
import { workflowHooks, workflowsApi } from '@/features/workflows';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { flagsHooks } from '@/hooks/flags-hooks';

import { DiscardChangesDialog } from './discard-changes-dialog';
import { usePublishGuard } from './publish-guard';
import { useDraftChanged } from './use-draft-changed';

export const BuilderPublishSection = () => {
  const { project } = projectCollectionUtils.useCurrentProject();
  if (project.releasesEnabled) {
    return <EnvironmentsPublishSection projectId={project.id} />;
  }
  return <SingleEnvironmentPublishSection />;
};

function SingleEnvironmentPublishSection() {
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
    editLockHolder,
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
    state.editLockHolder,
  ]);
  const guard = usePublishGuard({
    lockedByName: editLockHolder?.userDisplayName ?? null,
  });
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
  const { mutateAsync: publish } = workflowHooks.useChangeWorkflowStatus({
    workflowId: workflow.id,
    change: 'publish',
    onSuccess: (updatedWorkflow: PopulatedWorkflow) => {
      setWorkflow(updatedWorkflow);
      setVersion(updatedWorkflow.version);
    },
    setIsPublishing,
  });
  const { mutateAsync: overWriteDraftWithVersion } =
    workflowHooks.useOverWriteDraftWithVersion({
      onSuccess: (updatedWorkflow) => {
        setVersion(updatedWorkflow.version);
        setRightSidebar(RightSideBarType.NONE);
        setLeftSidebar(LeftSideBarType.NONE);
      },
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

  if (!canPublish) {
    if (isNil(run) && isViewingPublishedVersion) {
      return (
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
          <CircleCheck className="size-3.5 text-success" />
          {t('Published')}
        </span>
      );
    }
    return null;
  }

  const isBusy = isPublishing || isDiscardingChanges || isSaving;
  const statusText = pickStatusText({
    isDiscardingChanges,
    isPublishing,
    isSaving,
    hasNoChanges,
  });
  const canDiscard =
    !isNil(workflow.publishedVersionId) &&
    !isBusy &&
    !hasNoChanges &&
    workflow.publishedVersionId !== workflowVersion.id;

  return (
    <div className="flex items-center gap-2">
      <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
        {isBusy && (
          <LoadingSpinner className="size-3 stroke-muted-foreground" />
        )}
        {statusText}
      </span>
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
              onClick={() => guard.run(() => publish())}
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
    </div>
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
    setVersion,
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
    state.setVersion,
    state.workflowVersion,
    state.run,
    state.editLockHolder,
  ]);
  const guard = usePublishGuard({
    lockedByName: editLockHolder?.userDisplayName ?? null,
  });
  const hasNoChangesToDeploy =
    useDraftChanged({ baselineVersionId: workflow.testVersionId }) === false;
  const { checkAccess } = useAuthorization();
  const canDeploy = checkAccess(Permission.WRITE_WORKFLOW);
  const canPromote = checkAccess(Permission.WRITE_PROJECT_RELEASE);
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const { data: webhookUrlPrefix } = flagsHooks.useFlag<string>(
    FlagId.WEBHOOK_URL_PREFIX,
  );
  const { data: overview } = releasesHooks.useEnvironments({
    projectId,
    enabled: canPromote,
    showErrorDialog: false,
  });
  const { mutateAsync: deployToTest } = releasesHooks.useDeployToTest();
  const { mutate: deploy } = useMutation({
    mutationFn: async () => {
      setIsPublishing(true);
      try {
        await deployToTest({ projectId, workflowId: workflow.id });
        return await workflowsApi.get(workflow.id);
      } finally {
        setIsPublishing(false);
      }
    },
    onSuccess: (updatedWorkflow) => {
      setWorkflow(updatedWorkflow);
      setVersion(updatedWorkflow.version);
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
                onClick={() => guard.run(() => deploy())}
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
  hasNoChanges,
}: {
  isDiscardingChanges: boolean;
  isPublishing: boolean;
  isSaving: boolean;
  hasNoChanges: boolean;
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
  return hasNoChanges ? t('No unpublished changes') : t('Unpublished changes');
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
