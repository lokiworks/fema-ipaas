import { isNil } from '@fema-ipaas/core-utils';
import { Permission } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { useDebugRunProgress } from '@/app/builder/debug/use-debug-run-progress';
import { connectorSelectorUtils } from '@/features/connectors';
import { workflowHooks } from '@/features/workflows';
import { useAuthorization } from '@/hooks/authorization-hooks';

import { AboveTriggerButton } from './above-trigger-button';

const TestWorkflowWidget = () => {
  const [workflowVersion, hideTestWidget, publishedVersionId] =
    useBuilderStateContext((state) => [
      state.workflowVersion,
      state.hideTestWidget,
      state.workflow.publishedVersionId,
    ]);

  const { checkAccess } = useAuthorization();
  const userHasPermissionToRun = checkAccess(Permission.WRITE_RUN);

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

  if (
    !isManualTrigger ||
    !workflowVersion.valid ||
    hideTestWidget ||
    !userHasPermissionToRun ||
    isNil(publishedVersionId) ||
    publishedVersionId !== workflowVersion.id
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
