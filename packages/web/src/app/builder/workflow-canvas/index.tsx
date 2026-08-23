import { isNil } from '@fema-ipaas/core-utils';
import {
  workflowCanvasUtils as sharedWorkflowCanvasUtils,
  WorkflowActionType,
  workflowStructureUtil,
  WorkflowTriggerType,
  WorkflowVersion,
  Note,
  Step,
} from '@fema-ipaas/shared';
import {
  ReactFlow,
  Background,
  SelectionMode,
  OnSelectionChangeParams,
  useStoreApi,
  PanOnScrollMode,
  useKeyPress,
  BackgroundVariant,
  getNodesBounds,
  CoordinateExtent,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import React, { useCallback, useMemo, useRef, useState } from 'react';

import { useBuilderStateContext } from '../builder-hooks';
import { useHandleKeyPressOnCanvas } from '../shortcuts';
import { useCursorPosition } from '../state/cursor-position-context';

import {
  CanvasContextMenu,
  ContextMenuType,
} from './context-menu/canvas-context-menu';
import { workflowCanvasHooks } from './hooks';
import { workflowCanvasConsts } from './utils/consts';
import { workflowCanvasUtils } from './utils/workflow-canvas-utils';
import { AboveWorkflowWidgets } from './widgets';
import Minimap from './widgets/minimap';
import { useShowChevronNextToSelection } from './widgets/selection-chevron-button';
import { WorkflowDragLayer } from './workflow-drag-layer';

export const WorkflowCanvas = React.memo(
  ({
    setHasCanvasBeenInitialised,
  }: {
    setHasCanvasBeenInitialised: (value: boolean) => void;
  }) => {
    const [
      workflowVersion,
      setSelectedNodes,
      selectedNodes,
      selectedStep,
      panningMode,
      selectStepByName,
      rightSidebar,
      notes,
      canvasOrientation,
    ] = useBuilderStateContext((state) => {
      return [
        state.workflowVersion,
        state.setSelectedNodes,
        state.selectedNodes,
        state.selectedStep,
        state.panningMode,
        state.selectStepByName,
        state.rightSidebar,
        state.workflowVersion.notes,
        state.canvasOrientation,
      ];
    });
    const containerRef = useRef<HTMLDivElement>(null);
    useShowChevronNextToSelection();
    workflowCanvasHooks.useFocusOnStep();
    useHandleKeyPressOnCanvas();
    workflowCanvasHooks.useResizeCanvas(
      containerRef,
      setHasCanvasBeenInitialised,
    );
    const reactFlowStore = useStoreApi();
    const isShiftKeyPressed = useKeyPress('Shift');
    const inGrabPanningMode = !isShiftKeyPressed && panningMode === 'grab';
    const onSelectionChange = useCallback(
      (ev: OnSelectionChangeParams) => {
        const selectedNodes = ev.nodes.map((n) => n.id);
        if (selectedNodes.length === 0 && selectedStep) {
          selectedNodes.push(selectedStep);
        }
        setSelectedNodes(selectedNodes);
      },
      [setSelectedNodes, selectedStep],
    );
    const graphKey = `${createGraphKey(
      workflowVersion,
      notes,
      selectedStep ?? '',
    )}-${canvasOrientation}`;
    const graph = useMemo(() => {
      return workflowCanvasUtils.createWorkflowGraph({
        version: workflowVersion,
        notes,
        orientation: canvasOrientation,
      });
    }, [graphKey]);
    const [contextMenuType, setContextMenuType] = useState<ContextMenuType>(
      ContextMenuType.CANVAS,
    );

    const onContextMenu = useCallback(
      (ev: React.MouseEvent<HTMLDivElement>) => {
        if (
          ev.target instanceof HTMLElement ||
          ev.target instanceof SVGElement
        ) {
          const stepElement = ev.target.closest(
            `[data-${workflowCanvasConsts.STEP_CONTEXT_MENU_ATTRIBUTE}]`,
          );
          const stepName = stepElement?.getAttribute(
            `data-${workflowCanvasConsts.STEP_CONTEXT_MENU_ATTRIBUTE}`,
          );

          if (stepElement && stepName) {
            selectStepByName(stepName);
            reactFlowStore.getState().addSelectedNodes([stepName]);
          }
          const targetIsSelectionChevron = ev.target.closest(
            `[data-${workflowCanvasConsts.SELECTION_RECT_CHEVRON_ATTRIBUTE}]`,
          );
          const targetIsSelectionRect = ev.target.classList.contains(
            workflowCanvasConsts.NODE_SELECTION_RECT_CLASS_NAME,
          );
          const showStepContextMenu =
            stepElement || targetIsSelectionRect || targetIsSelectionChevron;
          if (showStepContextMenu) {
            setContextMenuType(ContextMenuType.STEP);
          } else {
            setContextMenuType(ContextMenuType.CANVAS);
          }
          const shouldRemoveSelectionRect =
            !targetIsSelectionRect && !targetIsSelectionChevron;
          if (shouldRemoveSelectionRect) {
            document
              .querySelector(
                `.${workflowCanvasConsts.NODE_SELECTION_RECT_CLASS_NAME}`,
              )
              ?.remove();
          }
        }
      },
      [setSelectedNodes, selectedNodes, rightSidebar],
    );

    const onSelectionEnd = useCallback(() => {
      const isUnselectingNodes =
        document.querySelector(
          `.${workflowCanvasConsts.NODE_SELECTION_RECT_CLASS_NAME}`,
        ) !== null;
      if (isUnselectingNodes) {
        reactFlowStore.getState().addSelectedNodes([]);
        return;
      }
      const selectedSteps = selectedNodes
        .map((node) =>
          workflowStructureUtil.getStep(node, workflowVersion.trigger),
        )
        .filter((step) => !isNil(step));
      selectedSteps.forEach((step) => {
        if (
          step.type === WorkflowActionType.LOOP_ON_ITEMS ||
          step.type === WorkflowActionType.ROUTER ||
          sharedWorkflowCanvasUtils.hasContinueOnFailureBranches(step)
        ) {
          const childrenNotSelected = workflowStructureUtil
            .getAllChildSteps(step)
            .filter((c) => isNil(selectedNodes.find((n) => n === c.name)));
          selectedSteps.push(...childrenNotSelected);
        }
      });
      const step = selectedStep
        ? workflowStructureUtil.getStep(selectedStep, workflowVersion.trigger)
        : null;
      if (selectedNodes.length === 0 && step) {
        selectedSteps.push(step);
      }
      reactFlowStore
        .getState()
        .addSelectedNodes(selectedSteps.map((step) => step.name));
    }, [selectedNodes, reactFlowStore, selectedStep]);

    const { setCursorPosition } = useCursorPosition();
    const translateExtent = useMemo(() => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight + 100;
      const nodes = graph.nodes;
      const graphRectangle = getNodesBounds(nodes);
      const start = {
        x: graphRectangle.x - windowWidth,
        y: graphRectangle.y - windowHeight,
      };
      const end = {
        x: graphRectangle.x + graphRectangle.width + windowWidth,
        y: graphRectangle.y + graphRectangle.height + windowHeight,
      };
      const extent: CoordinateExtent = [
        [start.x, start.y],
        [end.x, end.y],
      ];
      return extent;
    }, [graphKey]);

    return (
      <div
        ref={containerRef}
        className="size-full relative overflow-hidden z-30 bg-builder-background"
        onMouseMove={(event) => {
          const cursorPosition = { x: event.clientX, y: event.clientY };
          setCursorPosition(cursorPosition);
        }}
      >
        <WorkflowDragLayer>
          <CanvasContextMenu contextMenuType={contextMenuType}>
            <ReactFlow
              key={`canvas-${canvasOrientation}`}
              className="bg-builder-background"
              onContextMenu={onContextMenu}
              onPaneClick={() => {
                reactFlowStore.getState().unselectNodesAndEdges();
              }}
              translateExtent={translateExtent}
              nodeTypes={workflowCanvasConsts.nodeTypes}
              nodes={graph.nodes}
              edgeTypes={workflowCanvasConsts.edgeTypes}
              edges={graph.edges}
              draggable={false}
              edgesFocusable={false}
              elevateEdgesOnSelect={false}
              maxZoom={1.5}
              minZoom={0.5}
              panOnDrag={inGrabPanningMode ? [0, 1] : [1]}
              zoomOnDoubleClick={false}
              panOnScroll={true}
              panOnScrollMode={PanOnScrollMode.Free}
              fitView={false}
              nodesConnectable={false}
              elementsSelectable={true}
              nodesDraggable={false}
              nodesFocusable={false}
              selectionKeyCode={inGrabPanningMode ? 'Shift' : null}
              multiSelectionKeyCode={inGrabPanningMode ? 'Shift' : null}
              selectionOnDrag={inGrabPanningMode ? false : true}
              selectNodesOnDrag={true}
              selectionMode={SelectionMode.Partial}
              onSelectionChange={onSelectionChange}
              onSelectionEnd={onSelectionEnd}
            >
              <AboveWorkflowWidgets></AboveWorkflowWidgets>
              <Background
                gap={10}
                size={1}
                variant={BackgroundVariant.Dots}
                bgColor={`var(--builder-background)`}
                color={`var(--builder-background-pattern)`}
              />
              <Minimap key={graphKey} />
            </ReactFlow>
          </CanvasContextMenu>
        </WorkflowDragLayer>
      </div>
    );
  },
);

WorkflowCanvas.displayName = 'WorkflowCanvas';
const getChildrenKey = (step: Step) => {
  switch (step.type) {
    case WorkflowActionType.LOOP_ON_ITEMS:
      return step.firstLoopAction ? step.firstLoopAction.name : '';
    case WorkflowActionType.ROUTER:
      return step.children.reduce((routerKey, child) => {
        const childrenKey = child
          ? workflowStructureUtil
              .getAllSteps(child)
              .reduce(
                (childKey, grandChild) => `${childKey}-${grandChild.name}`,
                '',
              )
          : 'null';
        return `${routerKey}-${childrenKey}`;
      }, '');
    case WorkflowActionType.CODE:
    case WorkflowActionType.CONNECTOR: {
      const cofEnabled =
        sharedWorkflowCanvasUtils.hasContinueOnFailureBranches(step);
      const branches = step.continueOnFailureBranches;
      const onSuccessKey = branches?.onSuccess
        ? workflowStructureUtil
            .getAllSteps(branches.onSuccess)
            .reduce((acc, s) => `${acc}-${s.name}`, '')
        : 'null';
      const onFailureKey = branches?.onFailure
        ? workflowStructureUtil
            .getAllSteps(branches.onFailure)
            .reduce((acc, s) => `${acc}-${s.name}`, '')
        : 'null';
      return `cof:${cofEnabled}-success:${onSuccessKey}-failure:${onFailureKey}`;
    }
  }
};
const createGraphKey = (
  workflowVersion: WorkflowVersion,
  notes: Note[],
  selectedStep: string,
) => {
  const workflowGraphKey = workflowStructureUtil
    .getAllSteps(workflowVersion.trigger)
    .reduce((acc, step) => {
      const branchesNames =
        step.type === WorkflowActionType.ROUTER
          ? step.settings.branches.map((branch) => branch.branchName).join('-')
          : '0';
      const childrenKey = getChildrenKey(step);
      return `${acc}-${step.displayName}-${step.type}-${
        step.nextAction ? step.nextAction.name : ''
      }-${
        step.type === WorkflowActionType.CONNECTOR ||
        step.type === WorkflowTriggerType.CONNECTOR
          ? `${step.settings.connectorName}-${step.settings.connectorVersion}`
          : ''
      }-${branchesNames}-${childrenKey}}`;
    }, '');
  const notesGraphKey = notes
    .map((note) => `${note.id}-${note.position.x}-${note.position.y}`)
    .join('-');
  return `${workflowVersion.id}-${workflowGraphKey}-${notesGraphKey}-${selectedStep}`;
};
