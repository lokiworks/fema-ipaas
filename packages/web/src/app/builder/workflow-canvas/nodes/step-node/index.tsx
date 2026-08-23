import { useDraggable } from '@dnd-kit/core';
import {
  WorkflowOperationType,
  WorkflowTriggerType,
  Step,
  workflowStructureUtil,
} from '@fema/shared';
import { Handle, NodeProps, Position } from '@xyflow/react';
import React, { useMemo } from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { ConnectorSelector } from '@/app/builder/connectors-selector';
import { LoopIterationInput } from '@/app/builder/run-details/loop-iteration-input';
import { RightSideBarType } from '@/app/builder/types';
import { stepsHooks } from '@/features/connectors';
import { cn } from '@/lib/utils';

import { workflowCanvasConsts } from '../../utils/consts';
import { ApStepNode } from '../../utils/types';
import { workflowCanvasUtils } from '../../utils/workflow-canvas-utils';

import { StepNodeChevron } from './step-node-chevron';
import { StepNodeDisplayName } from './step-node-display-name';
import { StepNodeLogo } from './step-node-logo';
import { ApStepNodeSkippedStatus } from './step-node-skipped-status';
import { ApStepNodeStatusInDraft } from './step-node-status-in-draft';
import { ApStepNodeStatusInRun } from './step-node-status-in-run';
import { TriggerWidget } from './trigger-widget';

const ApStepCanvasNode = React.memo(
  ({ data: { step } }: NodeProps & Omit<ApStepNode, 'position'>) => {
    const [
      selectStepByName,
      isSelected,
      isDragging,
      readonly,
      workflowVersion,
      setSelectedBranchIndex,
      isConnectorSelectorOpened,
      setOpenedConnectorSelectorStepNameOrAddButtonId,
      isRightSidebarOpen,
      canvasOrientation,
    ] = useBuilderStateContext((state) => [
      state.selectStepByName,
      state.selectedStep === step.name,
      state.activeDraggingStep === step.name,
      state.readonly,
      state.workflowVersion,
      state.setSelectedBranchIndex,
      state.openedConnectorSelectorStepNameOrAddButtonId === step.name,
      state.setOpenedConnectorSelectorStepNameOrAddButtonId,
      state.rightSidebar !== RightSideBarType.NONE,
      state.canvasOrientation,
    ]);
    const isHorizontal = canvasOrientation === 'horizontal';
    const { stepMetadata } = stepsHooks.useStepMetadata({
      step,
    });
    const stepIndex = useMemo(
      () =>
        workflowStructureUtil.getStepNumber(workflowVersion.trigger, step.name),
      [step, workflowVersion],
    );
    const isTrigger = workflowStructureUtil.isTrigger(step.type);
    const isSkipped = workflowCanvasUtils.isSkipped(
      step.name,
      workflowVersion.trigger,
    );
    const chevronClickOverride =
      step.type === WorkflowTriggerType.EMPTY
        ? () => setOpenedConnectorSelectorStepNameOrAddButtonId(step.name)
        : undefined;

    const { attributes, listeners, setNodeRef } = useDraggable({
      id: step.name,
      disabled: isTrigger || readonly,
      data: {
        type: workflowCanvasConsts.DRAGGED_STEP_TAG,
      },
    });

    const handleStepClick = (
      e: React.MouseEvent<HTMLDivElement, MouseEvent>,
      stopPropagation = true,
    ) => {
      selectStepByName(step.name);
      setSelectedBranchIndex(null);
      if (stopPropagation) {
        e.stopPropagation();
      }
    };
    const handleContextMenu = (
      e: React.MouseEvent<HTMLDivElement, MouseEvent>,
    ) => {
      handleStepClick(e, false);
      setOpenedConnectorSelectorStepNameOrAddButtonId(null);
      if (isRightSidebarOpen || !e.nativeEvent.isTrusted) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();

      // we need to delay the context menu to ensure the right sidebar is opened first
      const relativeX = e.clientX - rect.left;
      const relativeY = e.clientY - rect.top;

      setTimeout(() => {
        const currentRect = target.getBoundingClientRect();
        const screenX = currentRect.left + relativeX;
        const screenY = currentRect.top + relativeY;
        const contextMenuEvent = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: screenX,
          clientY: screenY,
          button: 2,
          buttons: 2,
        });
        target.dispatchEvent(contextMenuEvent);
      }, workflowCanvasConsts.SIDEBAR_ANIMATION_DURATION + 50);
    };

    const stepNodeDivAttributes = isConnectorSelectorOpened ? {} : attributes;
    const stepNodeDivListeners = isConnectorSelectorOpened ? {} : listeners;

    return (
      <div
        {...{
          [`data-${workflowCanvasConsts.STEP_CONTEXT_MENU_ATTRIBUTE}`]:
            step.name,
        }}
        style={{
          height: `${workflowCanvasConsts.STEP_NODE_SIZE[canvasOrientation].height}px`,
          width: `${workflowCanvasConsts.STEP_NODE_SIZE[canvasOrientation].width}px`,
          maxWidth: `${workflowCanvasConsts.STEP_NODE_SIZE[canvasOrientation].width}px`,
        }}
        onContextMenu={(e) => handleContextMenu(e)}
        className={cn(
          'transition-all border-box rounded-md border border-solid border-border relative overflow-visible  group',
          {
            'border-primary': isSelected,
            'bg-background': !isDragging,
            'border-none': isDragging,
            'shadow-none': isDragging,
            'bg-accent': isSkipped,
            'rounded-tl-none': isTrigger && !isHorizontal,
            'hover:border-ring': !isSelected,
          },
        )}
        onClick={(e) => handleStepClick(e)}
        key={step.name}
        ref={isConnectorSelectorOpened ? null : setNodeRef}
        {...stepNodeDivAttributes}
        {...stepNodeDivListeners}
      >
        {isTrigger && <TriggerWidget isSelected={isSelected} />}
        <LoopIterationInput stepName={step.name} />
        <ApStepNodeStatusInRun stepName={step.name} />
        <ApStepNodeSkippedStatus stepName={step.name} />
        <ApStepNodeStatusInDraft stepName={step.name} />
        <div
          className={cn('h-full w-full', {
            'px-3 overflow-hidden': !isHorizontal,
          })}
        >
          {!isDragging && (
            <ConnectorSelector
              operation={{
                type: getConnectorSelectorOperationType(step),
                stepName: step.name,
              }}
              id={step.name}
              openSelectorOnClick={false}
              stepToReplaceConnectorDisplayName={stepMetadata?.displayName}
            >
              {isHorizontal ? (
                <div
                  className="flex items-center justify-center h-full w-full"
                  onClick={(e) => handleStepClick(e)}
                >
                  <StepNodeLogo
                    isSkipped={isSkipped}
                    logoUrl={stepMetadata?.logoUrl ?? ''}
                    displayName={stepMetadata?.displayName ?? ''}
                  />
                </div>
              ) : (
                <div
                  className="flex items-center justify-center h-full w-full gap-[10px]"
                  onClick={(e) => handleStepClick(e)}
                >
                  <StepNodeLogo
                    isSkipped={isSkipped}
                    logoUrl={stepMetadata?.logoUrl ?? ''}
                    displayName={stepMetadata?.displayName ?? ''}
                  />
                  <StepNodeDisplayName
                    stepDisplayName={step.displayName}
                    stepIndex={stepIndex}
                    isSkipped={isSkipped}
                    connectorDisplayName={stepMetadata?.displayName ?? ''}
                    stepName={step.name}
                  />
                  {!readonly && (
                    <StepNodeChevron onClickOverride={chevronClickOverride} />
                  )}
                </div>
              )}
            </ConnectorSelector>
          )}
          {isHorizontal && (
            <div
              style={{
                width: `${workflowCanvasConsts.HORIZONTAL_STEP_LABEL_WIDTH}px`,
              }}
              className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 flex justify-center pointer-events-none"
            >
              <div className="flex flex-col items-center min-w-0 pointer-events-auto">
                <StepNodeDisplayName
                  stepDisplayName={step.displayName}
                  stepIndex={stepIndex}
                  isSkipped={isSkipped}
                  connectorDisplayName={stepMetadata?.displayName ?? ''}
                  stepName={step.name}
                />
              </div>
            </div>
          )}
          {isHorizontal && !readonly && !isDragging && (
            <div className="absolute top-0 right-0  translate-x-[30px] z-10">
              <StepNodeChevron onClickOverride={chevronClickOverride} />
            </div>
          )}

          <Handle
            type="source"
            style={workflowCanvasConsts.HANDLE_STYLING}
            position={isHorizontal ? Position.Right : Position.Bottom}
          />
          <Handle
            type="target"
            style={workflowCanvasConsts.HANDLE_STYLING}
            position={isHorizontal ? Position.Left : Position.Top}
          />
        </div>
      </div>
    );
  },
);

ApStepCanvasNode.displayName = 'ApStepCanvasNode';
export { ApStepCanvasNode };

function getConnectorSelectorOperationType(step: Step) {
  if (workflowStructureUtil.isTrigger(step.type)) {
    return WorkflowOperationType.UPDATE_TRIGGER;
  }
  return WorkflowOperationType.UPDATE_ACTION;
}
