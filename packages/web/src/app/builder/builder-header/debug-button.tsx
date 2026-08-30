import { isNil, assertNotNullOrUndefined } from '@fema-ipaas/core-utils';
import {
  Permission,
  UpdateRunProgressRequest,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { PlayIcon } from 'lucide-react';

import {
  useBuilderStateContext,
  useBuilderStore,
} from '@/app/builder/builder-hooks';
import { LoadingSpinner } from '@/components/custom/spinner';
import { Button } from '@/components/ui/button';
import { connectorSelectorUtils } from '@/features/connectors';
import { executionUtils } from '@/features/executions';
import { workflowHooks } from '@/features/workflows';
import { useAuthorization } from '@/hooks/authorization-hooks';

export function DebugButton() {
  const [workflowVersion, readonly, setRun] = useBuilderStateContext(
    (state) => [state.workflowVersion, state.readonly, state.setRun],
  );
  const builderStore = useBuilderStore();
  const { checkAccess } = useAuthorization();

  const isManualTrigger = connectorSelectorUtils.isManualTrigger({
    connectorName: workflowVersion.trigger.settings.connectorName,
    triggerName: workflowVersion.trigger.settings.triggerName,
  });

  const { mutate: runWorkflow, isPending } =
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

  if (readonly || !checkAccess(Permission.WRITE_RUN)) {
    return null;
  }

  const triggerHasSampleData =
    workflowVersion.trigger.type === WorkflowTriggerType.CONNECTOR &&
    !isNil(workflowVersion.trigger.settings.sampleData?.lastTestDate);

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={
        isPending ||
        !workflowVersion.valid ||
        (!triggerHasSampleData && !isManualTrigger)
      }
      onClick={() => runWorkflow()}
    >
      {isPending ? (
        <LoadingSpinner className="size-3.5" />
      ) : (
        <PlayIcon className="size-3.5" />
      )}
      {t('Debug')}
    </Button>
  );
}

DebugButton.displayName = 'DebugButton';
