import { isNil } from '@fema-ipaas/core-utils';
import { Permission, WorkflowStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { useDraftChanged } from '@/app/builder/builder-header/use-draft-changed';
import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { useDebugRunProgress } from '@/app/builder/debug/use-debug-run-progress';
import { connectorSelectorUtils } from '@/features/connectors';
import { projectWorkspaceHooks } from '@/features/project-workspace/hooks/project-workspace-hooks';
import { workflowHooks } from '@/features/workflows';
import { useAuthorization } from '@/hooks/authorization-hooks';

import { AboveTriggerButton } from './above-trigger-button';

const TestWorkflowWidget = () => {
  const [workflowVersion, hideTestWidget, workflow] = useBuilderStateContext(
    (state) => [state.workflowVersion, state.hideTestWidget, state.workflow],
  );
  const { data: tree } = projectWorkspaceHooks.useTree(workflow.projectId);
  const publishedVersionId = workflow.publishedVersionId;
  const workflowStatus =
    tree?.workflows.find((row) => row.id === workflow.id)?.status ??
    workflow.status;

  const { checkAccess } = useAuthorization();
  const userHasPermissionToRun = checkAccess(Permission.WRITE_RUN);

  const isManualTrigger = connectorSelectorUtils.isManualTrigger({
    connectorName: workflowVersion.trigger.settings.connectorName,
    triggerName: workflowVersion.trigger.settings.triggerName,
  });

  const draftChanged = useDraftChanged({
    baselineVersionId: publishedVersionId,
  });
  const isLiveContent =
    !isNil(publishedVersionId) &&
    (publishedVersionId === workflowVersion.id || draftChanged === false);

  const progress = useDebugRunProgress({ returnsToEditing: !isManualTrigger });
  const { mutate: runWorkflow, isPending: isTestingWorkflow } =
    workflowHooks.useTestWorkflowOrStartManualTrigger({
      workflowVersionId: publishedVersionId ?? workflowVersion.id,
      isForManualTrigger: isManualTrigger,
      onUpdateRun: progress.onUpdateRun,
    });

  if (
    !isManualTrigger ||
    !workflowVersion.valid ||
    hideTestWidget ||
    !userHasPermissionToRun ||
    !isLiveContent ||
    workflowStatus !== WorkflowStatus.ENABLED
  ) {
    return null;
  }

  return (
    <AboveTriggerButton
      onClick={() => {
        progress.rememberSelection();
        runWorkflow();
      }}
      text={t('Run Workflow')}
      loading={isTestingWorkflow}
    />
  );
};

TestWorkflowWidget.displayName = 'TestWorkflowWidget';

export { TestWorkflowWidget };
