import { isNil, Permission } from '@fema-ipaas/core-utils';
import {
  Execution,
  PopulatedWorkflow,
  WorkflowVersion,
  WorkflowVersionState,
} from '@fema-ipaas/shared';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { LeftSideBarType, RightSideBarType } from '@/app/builder/types';
import { LoadingSpinner } from '@/components/custom/spinner';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { workflowHooks } from '@/features/workflows';
import { useAuthorization } from '@/hooks/authorization-hooks';

export const BuilderPublishSection = () => {
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
        await publish();
      },
    },
  );

  if (!canPublish) {
    return null;
  }

  const isBusy = isPublishing || isDiscardingChanges || isSaving;
  const statusText = pickStatusText({
    isDiscardingChanges,
    isPublishing,
    isSaving,
  });
  const canDiscard =
    !isNil(workflow.publishedVersionId) &&
    !isBusy &&
    workflow.publishedVersionId !== workflowVersion.id;

  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
          onClick={() => discardChange()}
        >
          {t('Discard changes')}
        </Button>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="tooltip-wrapper">
            <Button
              size="sm"
              variant="default"
              loading={isSaving}
              name="Publish"
              onClick={() => publish()}
              disabled={!isValid || isBusy}
            >
              {t('Publish')}
            </Button>
          </div>
        </TooltipTrigger>
        {isSaving && <TooltipContent>{t('Saving...')}</TooltipContent>}
        {!isValid && (
          <TooltipContent>{t('You have incomplete steps')}</TooltipContent>
        )}
      </Tooltip>
    </div>
  );
};

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
  return t('Unpublished changes');
}
