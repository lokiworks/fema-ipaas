import { Permission } from '@fema/core-utils';
import { WorkflowVersionState } from '@fema/shared';
import { t } from 'i18next';
import { EyeIcon, PencilIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from 'react-use';

import { Button } from '@/components/ui/button';
import { useAuthorization } from '@/hooks/authorization-hooks';

import { useBuilderStateContext } from '../../builder-hooks';
import { workflowCanvasHooks } from '../../workflow-canvas/hooks';
import { AboveTriggerButton } from '../../workflow-canvas/widgets/above-trigger-button';

const EditWorkflowOrViewDraftButton = ({ onCanvas }: { onCanvas: boolean }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { checkAccess } = useAuthorization();
  const { switchToDraft, isSwitchingToDraftPending } =
    workflowCanvasHooks.useSwitchToDraft();
  const [workflowVersion, workflowId, readonly, run] = useBuilderStateContext(
    (state) => [
      state.workflowVersion,
      state.workflow.id,
      state.readonly,
      state.run,
    ],
  );
  const isViewingDraft = workflowVersion.state === WorkflowVersionState.DRAFT;
  const permissionToEditWorkflow = checkAccess(Permission.WRITE_WORKFLOW);
  if (!readonly || (isViewingDraft && !run)) {
    return null;
  }
  const handleClick = () => {
    if (location.pathname?.includes('/runs')) {
      navigate(`/workflows/${workflowId}`);
    } else {
      switchToDraft();
    }
  };
  const { text, icon } = getButtonTextAndIcon({
    hasPermissionToEditWorkflow: permissionToEditWorkflow,
  });

  return (
    <>
      {onCanvas && (
        <AboveTriggerButton
          shortCutIsEscape={true}
          showPrimaryBg={false}
          onClick={handleClick}
          text={text}
        ></AboveTriggerButton>
      )}

      {!onCanvas && (
        <Button
          size={'sm'}
          variant={'basic'}
          loading={isSwitchingToDraftPending}
          className="gap-2"
          onClick={() => {
            if (location.pathname?.includes('/runs')) {
              navigate(`/workflows/${workflowId}`);
            } else {
              switchToDraft();
            }
          }}
        >
          {icon}
          {text}
        </Button>
      )}
    </>
  );
};
EditWorkflowOrViewDraftButton.displayName = 'EditWorkflowOrViewDraftButton';
export { EditWorkflowOrViewDraftButton };
function getButtonTextAndIcon({
  hasPermissionToEditWorkflow,
}: {
  hasPermissionToEditWorkflow: boolean;
}) {
  const text = hasPermissionToEditWorkflow
    ? t('Edit workflow')
    : t('View draft');

  if (hasPermissionToEditWorkflow) {
    return {
      icon: <PencilIcon className="size-4" />,
      text,
    };
  }
  return {
    icon: <EyeIcon className="size-4" />,
    text,
  };
}
