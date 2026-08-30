import {
  WorkflowAction,
  WorkflowOperationType,
  WorkflowTrigger,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { RefreshCwIcon } from 'lucide-react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { Button } from '@/components/ui/button';
import { ConnectorIcon } from '@/features/connectors';

export function StepOperationSummary({
  step,
  connectorDisplayName,
  logoUrl,
  operationDisplayName,
  readonly,
  hideChangeAction,
}: StepOperationSummaryProps) {
  const openSelector = useBuilderStateContext(
    (state) => state.setOpenedConnectorSelectorStepNameOrAddButtonId,
  );

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex min-w-0 items-center gap-2">
        <ConnectorIcon
          logoUrl={logoUrl}
          displayName={connectorDisplayName}
          showTooltip={false}
          size="md"
        />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">
            {connectorDisplayName}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {operationDisplayName}
          </span>
        </div>
      </div>
      {!readonly && !hideChangeAction && (
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={() =>
            openSelector(
              step.name,
              {
                type: workflowStructureUtil.isTrigger(step.type)
                  ? WorkflowOperationType.UPDATE_TRIGGER
                  : WorkflowOperationType.UPDATE_ACTION,
                stepName: step.name,
              },
              connectorDisplayName,
            )
          }
        >
          <RefreshCwIcon className="size-3.5" />
          {t('Change Operation')}
        </Button>
      )}
    </div>
  );
}

StepOperationSummary.displayName = 'StepOperationSummary';

export type StepOperationSummaryProps = {
  step: WorkflowAction | WorkflowTrigger;
  connectorDisplayName: string;
  logoUrl: string;
  operationDisplayName: string;
  readonly: boolean;
  hideChangeAction?: boolean;
};
