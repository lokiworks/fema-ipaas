import { isNil, assertNotNullOrUndefined } from '@fema/core-utils';
import {
  WorkflowTriggerType,
  Permission,
  UpdateRunProgressRequest,
} from '@fema/shared';
import { t } from 'i18next';

import { EditWorkflowOrViewDraftButton } from '@/app/builder/builder-header/workflow-status/view-draft-or-edit-workflow-button';
import {
  useBuilderStateContext,
  useBuilderStore,
} from '@/app/builder/builder-hooks';
import { connectorSelectorUtils } from '@/features/connectors';
import { executionUtils } from '@/features/executions';
import { workflowHooks } from '@/features/workflows';
import { useAuthorization } from '@/hooks/authorization-hooks';

import { AboveTriggerButton } from './above-trigger-button';

const TestWorkflowWidget = () => {
  const [
    workflowVersion,
    readonly,
    hideTestWidget,
    setRun,
    publishedVersionId,
  ] = useBuilderStateContext((state) => [
    state.workflowVersion,
    state.readonly,
    state.hideTestWidget,
    state.setRun,
    state.workflow.publishedVersionId,
  ]);
  const builderStore = useBuilderStore();

  const { checkAccess } = useAuthorization();
  const userHasPermissionToRun = checkAccess(Permission.WRITE_RUN);

  const triggerHasSampleData =
    workflowVersion.trigger.type === WorkflowTriggerType.CONNECTOR &&
    !isNil(workflowVersion.trigger.settings.sampleData?.lastTestDate);

  const isManualTrigger = connectorSelectorUtils.isManualTrigger({
    connectorName: workflowVersion.trigger.settings.connectorName,
    triggerName: workflowVersion.trigger.settings.triggerName,
  });

  const { mutate: runWorkflow, isPending: isTestingWorkflow } =
    workflowHooks.useTestWorkflowOrStartManualTrigger({
      workflowVersionId: workflowVersion.id,
      isForManualTrigger: isManualTrigger,
      onUpdateRun: (response: UpdateRunProgressRequest) => {
        assertNotNullOrUndefined(response.execution, 'execution');
        const currentRun = builderStore.getState().run;
        const previousSteps = currentRun?.steps ?? {};
        const startTime = response.execution.startTime ?? currentRun?.startTime;
        const steps = isNil(response.step)
          ? previousSteps
          : executionUtils.updateRunSteps(
              previousSteps,
              response.step.name,
              response.step.path,
              response.step.output,
            );
        setRun({ ...response.execution, startTime, steps }, workflowVersion);
      },
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
