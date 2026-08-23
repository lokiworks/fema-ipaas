import { DragMoveEvent, useDndMonitor, useDroppable } from '@dnd-kit/core';
import { isNil } from '@fema/core-utils';
import { Handle, Position } from '@xyflow/react';
import { Plus } from 'lucide-react';
import React, { useId, useState } from 'react';

import { ConnectorSelector } from '@/app/builder/connectors-selector';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useBuilderStateContext } from '../../builder-hooks';
import { workflowCanvasConsts } from '../utils/consts';
import { ApBigAddButtonNode } from '../utils/types';
import { workflowCanvasUtils } from '../utils/workflow-canvas-utils';

const ApBigAddButtonCanvasNode = React.memo(
  ({ data, id }: Omit<ApBigAddButtonNode, 'position'>) => {
    const [isIsStepInsideDropzone, setIsStepInsideDropzone] = useState(false);
    const [
      readonly,
      activeDraggingStep,
      isConnectorSelectorOpened,
      canvasOrientation,
    ] = useBuilderStateContext((state) => [
      state.readonly,
      state.activeDraggingStep,
      state.openedConnectorSelectorStepNameOrAddButtonId === id,
      state.canvasOrientation,
    ]);
    const isHorizontal = canvasOrientation === 'horizontal';
    const draggableId = useId();
    const { setNodeRef } = useDroppable({
      id: draggableId,
      data: {
        accepts: workflowCanvasConsts.DRAGGED_STEP_TAG,
        ...data,
      },
    });
    const isShowingDropIndicator = !isNil(activeDraggingStep);
    useDndMonitor({
      onDragMove(event: DragMoveEvent) {
        setIsStepInsideDropzone(event.over?.id === draggableId);
      },
      onDragEnd() {
        setIsStepInsideDropzone(false);
      },
    });
    const stepNodeSize = workflowCanvasConsts.STEP_NODE_SIZE[canvasOrientation];
    return (
      <>
        {
          <div
            style={{
              height: `${stepNodeSize.height}px`,
              width: `${stepNodeSize.width}px`,
            }}
            className="flex justify-center items-center "
          >
            {!readonly && (
              //we use transparent colors when opening the connector selector, so to not show the pattern of the background inside the button, we wrap the big add button in a div with the background color
              <div className="bg-builder-background">
                <div
                  style={{
                    height: `${workflowCanvasConsts.FEMA_NODE_SIZE.BIG_ADD_BUTTON.height}px`,
                    width: `${workflowCanvasConsts.FEMA_NODE_SIZE.BIG_ADD_BUTTON.width}px`,
                  }}
                  className=" cursor-auto border-none flex items-center justify-center relative "
                >
                  <div
                    style={{
                      height: `${workflowCanvasConsts.FEMA_NODE_SIZE.BIG_ADD_BUTTON.height}px`,
                      width: `${workflowCanvasConsts.FEMA_NODE_SIZE.BIG_ADD_BUTTON.width}px`,
                    }}
                    id={id}
                    className={cn('rounded-lg bg-background relative', {
                      'bg-primary/80':
                        isShowingDropIndicator || isConnectorSelectorOpened,
                      'shadow-add-button':
                        isIsStepInsideDropzone || isConnectorSelectorOpened,
                      'transition-all':
                        isIsStepInsideDropzone ||
                        isConnectorSelectorOpened ||
                        isShowingDropIndicator,
                    })}
                  >
                    {!isShowingDropIndicator && (
                      <ConnectorSelector
                        operation={workflowCanvasUtils.createAddOperationFromAddButtonData(
                          data,
                        )}
                        id={id}
                      >
                        <span>
                          <Button
                            variant="transparent"
                            className="w-full h-full flex items-center hover:bg-accent-foreground rounded-lg border-border border-solid border"
                          >
                            <Plus
                              className={cn('w-6 h-6 text-foreground ', {
                                'opacity-0':
                                  isShowingDropIndicator ||
                                  isConnectorSelectorOpened,
                              })}
                            />
                          </Button>
                        </span>
                      </ConnectorSelector>
                    )}
                  </div>
                  {isShowingDropIndicator && (
                    //this is an invisible div that is used to show the drop indicator when the step is being dragged over the big add button, it is a rectangle so there is more leanancy to drop the step on the big add button
                    <div
                      style={{
                        height: `${stepNodeSize.height}px`,
                        width: `${stepNodeSize.width}px`,
                        top: `-${
                          stepNodeSize.height / 2 -
                          workflowCanvasConsts.FEMA_NODE_SIZE.BIG_ADD_BUTTON
                            .width /
                            2
                        }px`,
                      }}
                      className=" absolute "
                      ref={setNodeRef}
                    >
                      {' '}
                    </div>
                  )}
                </div>
              </div>
            )}
            {readonly && (
              <div
                style={{
                  height: `${stepNodeSize.height}px`,
                  width: `${stepNodeSize.width}px`,
                }}
                className=" cursor-auto  flex items-center justify-center relative "
              >
                <svg
                  height={stepNodeSize.height}
                  width={stepNodeSize.width}
                  className="overflow-visible border-transparent "
                  style={{
                    stroke: 'var(--xy-edge-stroke, var(--xy-edge-stroke))',
                  }}
                  shapeRendering="auto"
                >
                  <g>
                    <path
                      d={
                        isHorizontal
                          ? `M -10 ${stepNodeSize.height / 2} h ${
                              stepNodeSize.width + 14
                            }`
                          : `M ${stepNodeSize.width / 2} -10 v ${
                              stepNodeSize.height + 14
                            }`
                      }
                      fill="transparent"
                      strokeWidth="1.5"
                    />
                  </g>
                </svg>
              </div>
            )}
          </div>
        }

        <Handle
          type="source"
          position={isHorizontal ? Position.Right : Position.Bottom}
          style={workflowCanvasConsts.HANDLE_STYLING}
        />
        <Handle
          type="target"
          position={isHorizontal ? Position.Left : Position.Top}
          style={workflowCanvasConsts.HANDLE_STYLING}
        />
      </>
    );
  },
);

ApBigAddButtonCanvasNode.displayName = 'ApBigAddButtonCanvasNode';
export { ApBigAddButtonCanvasNode };
