import { isNil } from '@fema-ipaas/core-utils';
import { WorkflowActionType, WorkflowTriggerType } from '@fema-ipaas/shared';
import { useCallback, useRef, useSyncExternalStore } from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { cn } from '@/lib/utils';

import { WorkflowStepInputOutput } from '../run-details/workflow-step-input-output';
import { TestStepContainer } from '../test-step';
import { workflowCanvasConsts } from '../workflow-canvas/utils/consts';

const DISMISS_IGNORE_SELECTOR = [
  '[data-test-panel-trigger]',
  '[data-radix-popper-content-wrapper]',
  '[role="dialog"]',
  '[data-slot="resizable-handle"]',
  '[data-panel-resize-handle-id]',
].join(',');

type StepDataPanelHostProps = {
  mode: 'drawer' | 'split';
  workflowId: string;
  workflowVersionId: string;
  workspaceId?: string;
  stepType: WorkflowActionType | WorkflowTriggerType;
  showGenerateSampleData: boolean;
  showStepInputOutFromRun: boolean;
  saving: boolean;
};

const StepDataPanelHost = ({
  mode,
  workflowId,
  workflowVersionId,
  workspaceId,
  stepType,
  showGenerateSampleData,
  showStepInputOutFromRun,
  saving,
}: StepDataPanelHostProps) => {
  const [setStepDataPanelOpen, isStepDataPanelOpen, run] =
    useBuilderStateContext((state) => [
      state.setStepDataPanelOpen,
      state.isStepDataPanelOpen,
      state.run,
    ]);
  const drawerRef = useRef<HTMLDivElement>(null);

  const subscribeToOutsideDismiss = useCallback(
    (notify: () => void) => {
      if (mode !== 'drawer' || !isStepDataPanelOpen) return () => {};
      const handlePointerDown = (event: PointerEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (drawerRef.current?.contains(target)) return;
        if (target.closest(DISMISS_IGNORE_SELECTOR)) return;
        if (
          target.closest(
            `[data-${workflowCanvasConsts.STEP_CONTEXT_MENU_ATTRIBUTE}]`,
          ) &&
          !isNil(run)
        )
          return;
        setStepDataPanelOpen(false);
        notify();
      };
      document.addEventListener('pointerdown', handlePointerDown);
      return () =>
        document.removeEventListener('pointerdown', handlePointerDown);
    },
    [mode, isStepDataPanelOpen, setStepDataPanelOpen, run],
  );

  useSyncExternalStore(subscribeToOutsideDismiss, () => isStepDataPanelOpen);

  return (
    <div
      ref={drawerRef}
      className={cn(
        'group relative h-full w-full bg-background flex flex-col overflow-hidden border border-border',
        mode === 'drawer' && 'rounded-t-xl shadow-lg border-b-0 border-x-0',
        mode === 'split' && 'rounded-t-xl border-b-0',
      )}
      role={mode === 'drawer' ? 'dialog' : undefined}
    >
      {showGenerateSampleData && workspaceId && (
        <TestStepContainer
          type={stepType}
          workflowId={workflowId}
          workflowVersionId={workflowVersionId}
          workspaceId={workspaceId}
          isSaving={saving}
        />
      )}
      {showStepInputOutFromRun && <WorkflowStepInputOutput />}
    </div>
  );
};

StepDataPanelHost.displayName = 'StepDataPanelHost';
export { StepDataPanelHost };
