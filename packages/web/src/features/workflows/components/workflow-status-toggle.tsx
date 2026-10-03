import { Permission, isNil } from '@fema-ipaas/core-utils';
import { WorkflowStatus, PopulatedWorkflow } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

import { LoadingSpinner } from '@/components/custom/spinner';
import { useAuthorization } from '@/hooks/authorization-hooks';

import { Switch } from '../../../components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../../components/ui/tooltip';
import { workflowHooks } from '../hooks/workflow-hooks';
import { ToggledStatus, toggledStatusUtils } from '../utils/toggled-status';
import { workflowsUtils } from '../utils/workflows-utils';

type WorkflowStatusToggleProps = {
  workflow: PopulatedWorkflow;
};

const WorkflowStatusToggle = ({ workflow }: WorkflowStatusToggleProps) => {
  const [toggled, setToggled] = useState<ToggledStatus | null>(null);
  const isWorkflowPublished =
    toggledStatusUtils.effectiveStatus({ workflow, toggled }) ===
    WorkflowStatus.ENABLED;

  const { checkAccess } = useAuthorization();
  const userHasPermissionToToggleWorkflowStatus = checkAccess(
    Permission.UPDATE_WORKFLOW_STATUS,
  );

  const { mutate: changeStatus, isPending: isLoading } =
    workflowHooks.useChangeWorkflowStatus({
      workflowId: workflow.id,
      change: isWorkflowPublished
        ? WorkflowStatus.DISABLED
        : WorkflowStatus.ENABLED,
      onSuccess: (updatedWorkflow: PopulatedWorkflow) => {
        setToggled(
          toggledStatusUtils.fromUpdate({ workflow, updated: updatedWorkflow }),
        );
      },
    });

  return (
    <div className="flex items-center justify-start">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center">
            <Switch
              aria-label={
                isWorkflowPublished ? t('Workflow is on') : t('Workflow is off')
              }
              checked={isWorkflowPublished}
              onCheckedChange={() => changeStatus()}
              disabled={
                isLoading ||
                !userHasPermissionToToggleWorkflowStatus ||
                isNil(workflow.publishedVersionId)
              }
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {userHasPermissionToToggleWorkflowStatus
            ? isNil(workflow.publishedVersionId)
              ? t('Please publish workflow first')
              : isWorkflowPublished
              ? t('Workflow is on')
              : t('Workflow is off')
            : t('Permission Needed')}
        </TooltipContent>
      </Tooltip>
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        isWorkflowPublished && (
          <Tooltip>
            <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
              <div className="p-2 rounded-full ">
                {workflowsUtils.workflowStatusIconRenderer(workflow)}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {workflowsUtils.workflowStatusToolTipRenderer(workflow)}
            </TooltipContent>
          </Tooltip>
        )
      )}
    </div>
  );
};

WorkflowStatusToggle.displayName = 'WorkflowStatusToggle';
export { WorkflowStatusToggle };
