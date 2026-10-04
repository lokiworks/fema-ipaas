import { isNil } from '@fema-ipaas/core-utils';
import { WorkflowTriggerType, Permission } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { EditWorkflowOrViewDraftButton } from '@/app/builder/builder-header/workflow-status/view-draft-or-edit-workflow-button';
import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { useDebugRunProgress } from '@/app/builder/debug/use-debug-run-progress';
import { connectorSelectorUtils } from '@/features/connectors';
import { workflowHooks } from '@/features/workflows';
import { useAuthorization } from '@/hooks/authorization-hooks';

import { AboveTriggerButton } from './above-trigger-button';

const TestWorkflowWidget = () => {
  const [workflowVersion, readonly, hideTestWidget, publishedVersionId] =
    useBuilderStateContext((state) => [
      state.workflowVersion,
      state.readonly,
      state.hideTestWidget,
      state.workflow.publishedVersionId,
    ]);

  const { checkAccess } = useAuthorization();
  const userHasPermissionToRun = checkAccess(Permission.WRITE_RUN);

  const triggerHasSampleData =
    workflowVersion.trigger.type === WorkflowTriggerType.CONNECTOR &&
    !isNil(workflowVersion.trigger.settings.sampleData?.lastTestDate);

  const isManualTrigger = connectorSelectorUtils.isManualTrigger({
    connectorName: workflowVersion.trigger.settings.connectorName,
    triggerName: workflowVersion.trigger.settings.triggerName,
  });

  const progress = useDebugRunProgress({ returnsToEditing: !isManualTrigger });
  const { mutate: runWorkflow, isPending: isTestingWorkflow } =
    workflowHooks.useTestWorkflowOrStartManualTrigger({
      workflowVersionId: workflowVersion.id,
      isForManualTrigger: isManualTrigger,
      onUpdateRun: progress.onUpdateRun,
    });

  if (!workflowVersion.valid) {
    return null;
  }

  if (hideTestWidget) {
    return null;
  }
  if (
    isManualTrigger &&
    (publishedVersionId !== workflowVersion.id || isNil(publishedVersionId))
  ) {
    return null;
  }

  if (readonly) {
    return (
      <EditWorkflowOrViewDraftButton
        onCanvas={true}
      ></EditWorkflowOrViewDraftButton>
    );
  }

  // Starting a manual run requires WRITE_RUN (enforced server-side). Hide the action
  // from users who lack it so they cannot fire a run the server would reject.
  if (isManualTrigger && !userHasPermissionToRun) {
    return null;
  }

  return (
    <AboveTriggerButton
      onClick={() => {
        progress.rememberSelection();
        runWorkflow();
      }}
      text={isManualTrigger ? t('Run Workflow') : t('Test Workflow')}
      disable={!triggerHasSampleData && !isManualTrigger}
      loading={isTestingWorkflow}
    />
  );
};

TestWorkflowWidget.displayName = 'TestWorkflowWidget';

export { TestWorkflowWidget };
