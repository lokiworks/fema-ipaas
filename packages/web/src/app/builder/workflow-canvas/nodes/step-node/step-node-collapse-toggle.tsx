import {
  Step,
  WorkflowActionType,
  workflowCanvasUtils as sharedWorkflowCanvasUtils,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { cn } from '@/lib/utils';

import { workflowScreenshotUtils } from '../../utils/workflow-screenshot-utils';

export function StepNodeCollapseToggle({ step }: { step: Step }) {
  const [isCollapsed, toggleCollapsedStep] = useBuilderStateContext((state) => [
    state.collapsedSteps.includes(step.name),
    state.toggleCollapsedStep,
  ]);
  if (!isCollapsible(step)) {
    return null;
  }
  const hiddenCount = workflowStructureUtil.getAllChildSteps(step).length - 1;
  const label = isCollapsed
    ? t(
        '{count, plural, =1 {Expand 1 hidden step} other {Expand # hidden steps}}',
        {
          count: hiddenCount,
        },
      )
    : t('Collapse');
  return (
    <button
      type="button"
      {...{
        [workflowScreenshotUtils.SCREENSHOT_EXCLUDE_ATTRIBUTE]: 'ignore-me',
      }}
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        toggleCollapsedStep(step.name);
      }}
      className={cn(
        'absolute bottom-1 right-1 z-10 flex h-4 items-center gap-0.5 rounded-sm border bg-background px-1 text-[10px] leading-none text-muted-foreground hover:text-foreground',
        isCollapsed && 'border-primary/40 text-primary',
      )}
    >
      {isCollapsed ? (
        <>
          <ChevronsUpDown className="size-2.5" />
          {hiddenCount}
        </>
      ) : (
        <ChevronsDownUp className="size-2.5" />
      )}
    </button>
  );
}

function isCollapsible(step: Step): boolean {
  return (
    step.type === WorkflowActionType.LOOP_ON_ITEMS ||
    step.type === WorkflowActionType.ROUTER ||
    step.type === WorkflowActionType.PARALLEL ||
    sharedWorkflowCanvasUtils.hasContinueOnFailureBranches(step)
  );
}
