import {
  WorkflowActionType,
  workflowCanvasUtils as sharedWorkflowCanvasUtils,
  workflowStructureUtil,
} from '@fema-ipaas/shared';
import { useReactFlow, useStore } from '@xyflow/react';
import { t } from 'i18next';
import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useBuilderStateContext } from '../../builder-hooks';

export function ZoomMenu({
  onFitToView,
  onReset,
}: {
  onFitToView: () => void;
  onReset: () => void;
}) {
  const { zoomTo } = useReactFlow();
  const zoom = useStore((state) => state.transform[2]);
  const [trigger, setCollapsedSteps] = useBuilderStateContext((state) => [
    state.workflowVersion.trigger,
    state.setCollapsedSteps,
  ]);
  const collapsibleSteps = workflowStructureUtil
    .getAllSteps(trigger)
    .filter(
      (step) =>
        step.type === WorkflowActionType.LOOP_ON_ITEMS ||
        step.type === WorkflowActionType.ROUTER ||
        step.type === WorkflowActionType.PARALLEL ||
        sharedWorkflowCanvasUtils.hasContinueOnFailureBranches(step),
    )
    .map((step) => step.name);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs tabular-nums"
          aria-label={t('Zoom')}
        >
          {Math.round(zoom * 100)}%
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" side="top">
        {ZOOM_LEVELS.map((level) => (
          <DropdownMenuItem
            key={level}
            onSelect={() => zoomTo(level, { duration: 200 })}
          >
            {Math.round(level * 100)}%
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onFitToView}>
          {t('Fit to view')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onReset}>
          {t('Reset view')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setCollapsedSteps([])}>
          {t('Expand all')}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={collapsibleSteps.length === 0}
          onSelect={() => setCollapsedSteps(collapsibleSteps)}
        >
          {t('Collapse all')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const ZOOM_LEVELS = [1.5, 1, 0.5];
