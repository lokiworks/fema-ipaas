import { Permission, isNil } from '@fema-ipaas/core-utils';
import { WorkflowStatus, PopulatedWorkflow } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useEffect, useState } from 'react';

import { LoadingSpinner } from '@/components/custom/spinner';
import { useAuthorization } from '@/hooks/authorization-hooks';

import { Switch } from '../../../components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../../components/ui/tooltip';
import { workflowHooks } from '../hooks/workflow-hooks';
import { workflowsUtils } from '../utils/workflows-utils';

type WorkflowStatusToggleProps = {
  workflow: PopulatedWorkflow;
};

const WorkflowStatusToggle = ({ workflow }: WorkflowStatusToggleProps) => {
  const [isWorkflowPublished, setIsWorkflowPublished] = useState(
    workflow.status === WorkflowStatus.ENABLED,
  );

  useEffect(() => {
    setIsWorkflowPublished(workflow.status === WorkflowStatus.ENABLED);
  }, [workflow]);

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
        setIsWorkflowPublished(
          updatedWorkflow.status === WorkflowStatus.ENABLED,
        );
      },
    });

  return (
    <div className="flex items-center justify-start">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center">
            <Switch
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
