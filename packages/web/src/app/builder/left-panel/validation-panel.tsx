import { WorkflowTriggerType, workflowStructureUtil } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { CircleAlertIcon, CircleCheckIcon } from 'lucide-react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { SidebarHeader } from '@/app/builder/sidebar-header';
import { LeftSideBarType } from '@/app/builder/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

export function ValidationPanel() {
  const [selectStepByName, setLeftSidebar, openPicker] = useBuilderStateContext(
    (state) => [
      state.selectStepByName,
      state.setLeftSidebar,
      state.setOpenedConnectorSelectorStepNameOrAddButtonId,
    ],
  );

  const invalidSteps = useInvalidSteps();

  return (
    <div className="flex h-full w-full flex-col">
      <SidebarHeader onClose={() => setLeftSidebar(LeftSideBarType.NONE)}>
        <span className="truncate font-semibold">{t('Validation')}</span>
      </SidebarHeader>
      <Separator orientation="horizontal" />
      <ScrollArea className="min-h-0 flex-1">
        {invalidSteps.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <CircleCheckIcon className="size-6 text-success-600" />
            <span className="text-sm text-muted-foreground">
              {t('Every step is configured.')}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 p-2">
            {invalidSteps.map((step) => (
              <button
                key={step.name}
                type="button"
                onClick={() => {
                  selectStepByName(step.name);
                  if (step.type === WorkflowTriggerType.EMPTY) {
                    openPicker(step.name);
                  }
                }}
                className="flex items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{step.displayName}</span>
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {step.name}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

ValidationPanel.displayName = 'ValidationPanel';

export function useInvalidSteps() {
  const workflowVersion = useBuilderStateContext(
    (state) => state.workflowVersion,
  );
  return workflowStructureUtil
    .getAllSteps(workflowVersion.trigger)
    .filter((step) => !('skip' in step && step.skip) && !step.valid);
}
