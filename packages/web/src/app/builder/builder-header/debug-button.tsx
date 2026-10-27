import { isNil } from '@fema-ipaas/core-utils';
import { Permission, WorkflowTriggerType } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { PlayIcon } from 'lucide-react';
import { useState } from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { DebugDialog } from '@/app/builder/debug/debug-dialog';
import { useDebugRunProgress } from '@/app/builder/debug/use-debug-run-progress';
import { LeftSideBarType } from '@/app/builder/types';
import { useBuilderValidation } from '@/app/builder/validation/validation-context';
import { LoadingSpinner } from '@/components/custom/spinner';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { connectorSelectorUtils } from '@/features/connectors';
import { workflowHooks } from '@/features/workflows';
import { useAuthorization } from '@/hooks/authorization-hooks';

export function DebugButton() {
  const [workflowVersion, readonly, setLeftSidebar] = useBuilderStateContext(
    (state) => [state.workflowVersion, state.readonly, state.setLeftSidebar],
  );
  const { checkAccess } = useAuthorization();
  const { errorCount } = useBuilderValidation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const isManualTrigger = connectorSelectorUtils.isManualTrigger({
    connectorName: workflowVersion.trigger.settings.connectorName,
    triggerName: workflowVersion.trigger.settings.triggerName,
  });

  const progress = useDebugRunProgress({ returnsToEditing: true });
  const { mutate: runWorkflow, isPending } =
    workflowHooks.useTestWorkflowOrStartManualTrigger({
      workflowVersionId: workflowVersion.id,
      isForManualTrigger: false,
      onUpdateRun: progress.onUpdateRun,
    });

  if (readonly || !checkAccess(Permission.WRITE_RUN)) {
    return null;
  }

  const isTriggerEmpty =
    workflowVersion.trigger.type === WorkflowTriggerType.EMPTY;
  const disabledReason = isTriggerEmpty
    ? t('Pick a trigger first')
    : errorCount > 0
    ? t(
        '{count, plural, =1 {Fix 1 error before debugging} other {Fix # errors before debugging}}',
        { count: errorCount },
      )
    : null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="tooltip-wrapper" data-tour="builder-test">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={isPending || !isNil(disabledReason)}
              onClick={() => setDialogOpen(true)}
            >
              {isPending ? (
                <LoadingSpinner className="size-3.5" />
              ) : (
                <PlayIcon className="size-3.5" />
              )}
              {t('Debug')}
            </Button>
          </div>
        </TooltipTrigger>
        {!isNil(disabledReason) && (
          <TooltipContent>{disabledReason}</TooltipContent>
        )}
      </Tooltip>
      <DebugDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        isManualTrigger={isManualTrigger}
        onStart={(options) => {
          progress.rememberSelection();
          setLeftSidebar(LeftSideBarType.RUNS);
          runWorkflow(
            isManualTrigger
              ? { environment: options.environment }
              : { payload: options.payload, environment: options.environment },
          );
        }}
      />
    </>
  );
}

DebugButton.displayName = 'DebugButton';
