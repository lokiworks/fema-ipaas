import { isNil, Permission } from '@fema/core-utils';
import {
  Execution,
  WorkflowVersion,
  WorkflowVersionState,
  PopulatedWorkflow,
} from '@fema/shared';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { Info } from 'lucide-react';

import { RightSideBarType } from '@/app/builder/types';
import { LoadingSpinner } from '@/components/custom/spinner';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { workflowHooks } from '@/features/workflows';
import { useAuthorization } from '@/hooks/authorization-hooks';

import { useBuilderStateContext } from '../../builder-hooks';

import LargeWidgetWrapper from './large-widget-wrapper';

const PublishWorkflowReminderWidget = () => {
  const [
    isSaving,
    isPublishing,
    setIsPublishing,
    isValid,
    workflow,
    setWorkflow,
    setVersion,
    setRightSidebar,
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
    state.workflowVersion,
    state.run,
  ]);
  const showShouldPublishButton = useShouldShowPublishButton({
    workflowVersion,
    isPublishing,
    run,
    isSaving,
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
  const { mutateAsync: publish } = workflowHooks.useChangeWorkflowStatus({
    workflowId: workflow.id,
    change: 'publish',
    onSuccess: (updatedWorkflow: PopulatedWorkflow) => {
      setWorkflow(updatedWorkflow);
      setVersion(updatedWorkflow.version);
    },
    setIsPublishing: setIsPublishing,
  });
  const { mutateAsync: overWriteDraftWithVersion } =
    workflowHooks.useOverWriteDraftWithVersion({
      onSuccess: (updatedWorkflow) => {
        setVersion(updatedWorkflow.version);
        setRightSidebar(RightSideBarType.NONE);
      },
    });

  if (!showShouldPublishButton) {
    return null;
  }
  const showLoading = isPublishing || isDiscardingChanges || isSaving;
  const loadingText = pickLoadingText({
    isDiscardingChanges,
    isPublishing,
    isSaving,
  });
  return (
    <LargeWidgetWrapper>
      <div className="flex items-center gap-2">
        <Info className="size-5" />
        {showLoading ? loadingText : t('You have unpublished changes')}
      </div>
      {showLoading ? (
        <LoadingSpinner className="size-5 stroke-foreground" />
      ) : (
        <div className="flex items-center gap-2">
          {!isNil(workflow.publishedVersionId) && !isSaving && (
            <Button
              size="sm"
              variant="ghost"
              className="hover:bg-gray-300/10 text-foreground"
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
                  className="z-50"
                  loading={isSaving}
                  //for e2e tests
                  name="Publish"
                  onClick={() => publish()}
                  disabled={!isValid}
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
      )}
    </LargeWidgetWrapper>
  );
};

PublishWorkflowReminderWidget.displayName = 'PublishWorkflowReminderWidget';
export { PublishWorkflowReminderWidget };

const useShouldShowPublishButton = ({
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

function pickLoadingText({
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
  return '';
}
