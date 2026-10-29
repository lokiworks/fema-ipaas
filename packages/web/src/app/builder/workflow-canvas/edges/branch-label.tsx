import { isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowActionType,
  BranchExecutionType,
  WorkflowOperationType,
  workflowStructureUtil,
  StepLocationRelativeToParent,
} from '@fema-ipaas/shared';
import { useReactFlow } from '@xyflow/react';
import { t } from 'i18next';
import { CopyPlus, EllipsisVertical, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { defaultStepNames } from '@/features/workflows/utils/default-step-names';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu';
import { cn } from '../../../../lib/utils';
import { useBuilderStateContext } from '../../builder-hooks';
import { useRunPath } from '../use-run-path';
import { workflowCanvasConsts } from '../utils/consts';
import { useDeleteConfirmation } from '../utils/delete-confirmation-store';
import { deleteImpactUtils } from '../utils/delete-impact';
import { runPathUtils } from '../utils/run-path';
import { workflowCanvasUtils } from '../utils/workflow-canvas-utils';
import { workflowScreenshotUtils } from '../utils/workflow-screenshot-utils';

type BaseBranchLabel = {
  label: string;
  targetNodeName: string;
  sourceNodeName: string;
} & (
  | {
      stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_BRANCH;
      branchIndex: number;
    }
  | {
      stepLocationRelativeToParent:
        | StepLocationRelativeToParent.INSIDE_ON_SUCCESS_BRANCH
        | StepLocationRelativeToParent.INSIDE_ON_FAILURE_BRANCH;
    }
);

const BranchLabel = (props: BaseBranchLabel) => {
  const [
    selectedStep,
    selectedBranchIndex,
    selectStepByName,
    setSelectedBranchIndex,
    step,
    applyOperation,
    readonly,
    canvasOrientation,
    workflowVersion,
  ] = useBuilderStateContext((state) => [
    state.selectedStep,
    state.selectedBranchIndex,
    state.selectStepByName,
    state.setSelectedBranchIndex,
    workflowStructureUtil.getStep(
      props.sourceNodeName,
      state.workflowVersion.trigger,
    ),
    state.applyOperation,
    state.readonly,
    state.canvasOrientation,
    state.workflowVersion,
  ]);
  const isHorizontal = canvasOrientation === 'horizontal';

  const isOnSuccessBranch =
    props.stepLocationRelativeToParent ===
    StepLocationRelativeToParent.INSIDE_ON_SUCCESS_BRANCH;
  const isOnFailureBranch =
    props.stepLocationRelativeToParent ===
    StepLocationRelativeToParent.INSIDE_ON_FAILURE_BRANCH;
  const isCofBranch = isOnSuccessBranch || isOnFailureBranch;
  const branchIndex =
    props.stepLocationRelativeToParent ===
    StepLocationRelativeToParent.INSIDE_BRANCH
      ? props.branchIndex
      : null;
  const isInsideRouterBranch = branchIndex !== null;
  const isFallbackBranch =
    isInsideRouterBranch &&
    step?.type === WorkflowActionType.ROUTER &&
    step?.settings.branches[branchIndex]?.branchType ===
      BranchExecutionType.FALLBACK;
  const isOtherwiseBranch =
    (!isInsideRouterBranch && !isCofBranch) || isFallbackBranch;
  const isBranchSelected =
    selectedStep === props.sourceNodeName &&
    isInsideRouterBranch &&
    branchIndex === selectedBranchIndex;
  const { fitView } = useReactFlow();
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState(false);
  const runPath = useRunPath();
  const branchRunState = isNil(runPath)
    ? null
    : runPath.branchStates[
        runPathUtils.branchKey({
          stepName: props.sourceNodeName,
          branchIndex: branchIndex ?? (isOnFailureBranch ? 1 : 0),
          failureBranch: isCofBranch,
        })
      ] ?? null;

  if (isNil(step)) {
    return <></>;
  }

  return (
    <div
      className={cn('h-full flex items-center', {
        'justify-center': !isHorizontal,
        'justify-end': isHorizontal,
      })}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDropdownMenuOpen(true);
      }}
    >
      <div
        className={cn('bg-builder-background pointer-events-auto', {
          'opacity-40': branchRunState === 'skipped',
        })}
        style={{
          paddingTop: workflowCanvasConsts.LABEL_VERTICAL_PADDING / 2 + 'px',
          paddingBottom: workflowCanvasConsts.LABEL_VERTICAL_PADDING / 2 + 'px',
        }}
      >
        <div
          className={cn(
            'flex items-center justify-center gap-0.5 select-none transition-all rounded-md  text-sm border  border-solid bg-primary-100/30 dark:bg-primary-100/15  border-primary/50   px-2 text-primary/80 dark:text-primary/90   hover:text-primary hover:border-primary',
            {
              'border-primary text-primary':
                isBranchSelected || branchRunState === 'taken',
              'ring-2 ring-primary/40': branchRunState === 'taken',
              'bg-border/60 text-foreground/70 dark:text-foreground/70  border-border hover:text-foreground/70 hover:bg-border/60 hover:border-border cursor-default':
                isOtherwiseBranch,
              'text-success-800 bg-success-50 border-success-200 dark:text-success-200 dark:bg-success-900 dark:border-success-800 hover:text-success-800 hover:bg-success-50 hover:border-success-200 cursor-default':
                isOnSuccessBranch,
              'text-destructive-800 bg-destructive-50 border-destructive-200 dark:text-destructive-200 dark:bg-destructive-900 dark:border-destructive-800 hover:text-destructive-800 hover:bg-destructive-50 hover:border-destructive-200 cursor-default':
                isOnFailureBranch,
            },
          )}
          style={{
            height: workflowCanvasConsts.LABEL_HEIGHT + 'px',
            maxWidth:
              workflowCanvasConsts.FEMA_NODE_SIZE.STEP.width - 10 + 'px',
          }}
          onClick={() => {
            if (branchIndex !== null && !isOtherwiseBranch) {
              selectStepByName(props.sourceNodeName);
              setSelectedBranchIndex(branchIndex);
              fitView(
                workflowCanvasUtils.createFocusStepInGraphParams(
                  props.targetNodeName,
                ),
              );
            }
          }}
        >
          <div className="truncate">
            {props.label === 'Otherwise' ? t('Otherwise') : props.label}
          </div>

          {!isOtherwiseBranch &&
            !readonly &&
            step.type === WorkflowActionType.ROUTER && (
              <DropdownMenu
                modal={true}
                open={isDropdownMenuOpen}
                onOpenChange={setIsDropdownMenuOpen}
              >
                <DropdownMenuTrigger asChild>
                  <div
                    {...workflowScreenshotUtils.EXCLUDE_PROPS}
                    className="h-5 shrink-0 border border-transparent hover:border-solid hover:border-primary-300/50 transition-all rounded-full w-5 flex items-center justify-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <EllipsisVertical className="h-4 w-4" />
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (branchIndex === null) return;
                      applyOperation({
                        type: WorkflowOperationType.DUPLICATE_BRANCH,
                        request: {
                          stepName: props.sourceNodeName,
                          branchIndex,
                          copySuffix: defaultStepNames.copySuffix(),
                        },
                      });
                      setIsDropdownMenuOpen(false);
                      selectStepByName(props.sourceNodeName);
                      setSelectedBranchIndex(branchIndex + 1);
                      fitView(
                        workflowCanvasUtils.createFocusStepInGraphParams(
                          props.sourceNodeName,
                        ),
                      );
                    }}
                  >
                    <div className="flex cursor-pointer  flex-row gap-2 items-center">
                      <CopyPlus className="h-4 w-4" />
                      <span>{t('Duplicate Branch')}</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={step.settings.branches.length <= 2}
                    onSelect={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (branchIndex === null) return;
                      const impact = deleteImpactUtils.branchImpactOf({
                        trigger: workflowVersion.trigger,
                        stepName: props.sourceNodeName,
                        branchIndex,
                      });
                      if (deleteImpactUtils.needsConfirmation({ impact })) {
                        setIsDropdownMenuOpen(false);
                        useDeleteConfirmation.getState().open(impact);
                        return;
                      }
                      setSelectedBranchIndex(null);
                      applyOperation({
                        type: WorkflowOperationType.DELETE_BRANCH,
                        request: {
                          stepName: props.sourceNodeName,
                          branchIndex,
                        },
                      });
                      selectStepByName(props.sourceNodeName);
                    }}
                  >
                    <div className="flex cursor-pointer  flex-row gap-2 items-center">
                      <Trash2 className="h-4 w-4 text-destructive" />
                      <span className="text-destructive">
                        {t('Delete Branch')}
                      </span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
        </div>
      </div>
    </div>
  );
};

export { BranchLabel };
