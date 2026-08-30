import { isNil } from '@fema-ipaas/core-utils';
import { WorkflowOperationType, WorkflowTriggerType } from '@fema-ipaas/shared';
import { StoreApi } from 'zustand';

import { LeftSideBarType, RightSideBarType } from '@/app/builder/types';
import { executionUtils } from '@/features/executions';

import { BuilderState } from '../builder-hooks';
import { CanvasOrientation } from '../workflow-canvas/utils/types';
import { workflowCanvasUtils } from '../workflow-canvas/utils/workflow-canvas-utils';

export type CanvasState = {
  canvasOrientation: CanvasOrientation;
  setCanvasOrientation: (orientation: CanvasOrientation) => void;
  readonly: boolean;
  hideTestWidget: boolean;
  rightSidebar: RightSideBarType;
  leftSidebar: LeftSideBarType;
  selectedStep: string | null;
  activeDraggingStep: string | null;
  selectedBranchIndex: number | null;
  userManuallySelectedStepDuringRun: boolean;
  showMinimap: boolean;
  setShowMinimap: (showMinimap: boolean) => void;
  setSelectedBranchIndex: (index: number | null) => void;
  exitStepSettings: () => void;
  renameWorkflowClientSide: (newName: string) => void;
  setRightSidebar: (rightSidebar: RightSideBarType) => void;
  setLeftSidebar: (leftSidebar: LeftSideBarType) => void;
  removeStepSelection: () => void;
  selectStepByName: (
    stepName: string,
    options?: { fromAutoFocus?: boolean },
  ) => void;
  resumeLiveFollow: () => void;
  setActiveDraggingStep: (stepName: string | null) => void;
  setReadOnly: (readOnly: boolean) => void;
  selectedNodes: string[];
  setSelectedNodes: (nodes: string[]) => void;
  panningMode: 'grab' | 'pan';
  setPanningMode: (mode: 'grab' | 'pan') => void;
  isFocusInsideListMapperModeInput: boolean;
  setIsFocusInsideListMapperModeInput: (
    isFocusInsideListMapperModeInput: boolean,
  ) => void;
  deselectStep: () => void;
};

type CanvasStateInitialState = Pick<
  BuilderState,
  'readonly' | 'hideTestWidget' | 'run' | 'workflowVersion'
>;

export const createCanvasState = (
  initialState: CanvasStateInitialState,
  set: StoreApi<BuilderState>['setState'],
): CanvasState => {
  const failedStepNameInRun = initialState.run?.steps
    ? executionUtils.findLastStepWithStatus(
        initialState.run.status,
        initialState.run.steps,
      )
    : null;
  const initiallySelectedStep =
    workflowCanvasUtils.determineInitiallySelectedStep(
      failedStepNameInRun,
      initialState.workflowVersion,
    );
  const isEmptyTriggerInitiallySelected =
    initiallySelectedStep === 'trigger' &&
    initialState.workflowVersion.trigger.type === WorkflowTriggerType.EMPTY;
  return {
    canvasOrientation: getCanvasOrientationFromLocalStorage(),
    setCanvasOrientation: (orientation: CanvasOrientation) => {
      localStorage.setItem(
        CANVAS_ORIENTATION_KEY_IN_LOCAL_STORAGE,
        orientation,
      );
      return set(() => ({
        canvasOrientation: orientation,
      }));
    },
    showMinimap: false,
    setShowMinimap: (showMinimap: boolean) => set({ showMinimap }),
    readonly: initialState.readonly,
    hideTestWidget: initialState.hideTestWidget ?? false,
    selectedStep: initiallySelectedStep,
    activeDraggingStep: null,
    rightSidebar:
      initiallySelectedStep && !isEmptyTriggerInitiallySelected
        ? RightSideBarType.CONNECTOR_SETTINGS
        : RightSideBarType.NONE,
    leftSidebar: LeftSideBarType.NONE,
    removeStepSelection: () =>
      set({
        selectedStep: null,
        rightSidebar: RightSideBarType.NONE,
        selectedBranchIndex: null,
      }),

    setActiveDraggingStep: (stepName: string | null) =>
      set({
        activeDraggingStep: stepName,
      }),
    setSelectedBranchIndex: (branchIndex: number | null) =>
      set({
        selectedBranchIndex: branchIndex,
      }),
    setReadOnly: (readonly: boolean) => set({ readonly }),
    renameWorkflowClientSide: (newName: string) => {
      set((state) => {
        return {
          workflowVersion: {
            ...state.workflowVersion,
            displayName: newName,
          },
        };
      });
    },
    selectStepByName: (
      selectedStep: string,
      options?: { fromAutoFocus?: boolean },
    ) => {
      set((state) => {
        const selectedNodes = isNil(selectedStep) ? [] : [selectedStep];
        const isUnconfiguredTrigger =
          selectedStep === 'trigger' &&
          state.workflowVersion.trigger.type === WorkflowTriggerType.EMPTY;

        const userPickedDifferentStepDuringRun =
          !options?.fromAutoFocus &&
          !isNil(state.run) &&
          state.selectedStep !== selectedStep;

        return {
          openedConnectorSelectorStepNameOrAddButtonId: isUnconfiguredTrigger
            ? selectedStep
            : null,
          connectorSelectorOperation: isUnconfiguredTrigger
            ? { type: WorkflowOperationType.UPDATE_TRIGGER }
            : null,
          selectedConnectorMetadataInConnectorSelector: null,
          selectedStep,
          rightSidebar: isUnconfiguredTrigger
            ? RightSideBarType.NONE
            : RightSideBarType.CONNECTOR_SETTINGS,
          leftSidebar: isUnconfiguredTrigger
            ? LeftSideBarType.CONNECTOR_PICKER
            : state.leftSidebar,
          selectedBranchIndex: null,
          selectedNodes,
          chatDrawerOpenSource: null,
          userManuallySelectedStepDuringRun:
            state.userManuallySelectedStepDuringRun ||
            userPickedDifferentStepDuringRun,
        };
      });
    },
    resumeLiveFollow: () =>
      set((state) => {
        if (isNil(state.run) || isNil(state.run.steps)) {
          return { userManuallySelectedStepDuringRun: false };
        }
        return {
          userManuallySelectedStepDuringRun: false,
          loopsIndexes: executionUtils.snapLoopsToLatestIteration(
            state.run,
            state.loopsIndexes,
          ),
        };
      }),
    userManuallySelectedStepDuringRun: false,
    exitStepSettings: () =>
      set(() => ({
        rightSidebar: RightSideBarType.NONE,
        selectedStep: null,
        selectedBranchIndex: null,
      })),
    setRightSidebar: (rightSidebar: RightSideBarType) => set({ rightSidebar }),
    setLeftSidebar: (leftSidebar: LeftSideBarType) => set({ leftSidebar }),
    selectedBranchIndex: null,
    selectedNodes: [],
    setSelectedNodes: (nodes) => {
      return set(() => ({
        selectedNodes: nodes,
      }));
    },
    deselectStep: () => {
      return set(() => ({
        rightSidebar: RightSideBarType.NONE,
        selectedBranchIndex: null,
        selectedStep: null,
      }));
    },
    panningMode: getPanningModeFromLocalStorage(),
    setPanningMode: (mode: 'grab' | 'pan') => {
      localStorage.setItem(DEFAULT_PANNING_MODE_KEY_IN_LOCAL_STORAGE, mode);
      return set(() => ({
        panningMode: mode,
      }));
    },
    isFocusInsideListMapperModeInput: false,
    setIsFocusInsideListMapperModeInput: (
      isFocusInsideListMapperModeInput: boolean,
    ) => {
      return set(() => ({
        isFocusInsideListMapperModeInput,
      }));
    },
  };
};

const CANVAS_ORIENTATION_KEY_IN_LOCAL_STORAGE = 'ap.builder.canvasOrientation';
function getCanvasOrientationFromLocalStorage(): CanvasOrientation {
  return localStorage.getItem(CANVAS_ORIENTATION_KEY_IN_LOCAL_STORAGE) ===
    'horizontal'
    ? 'horizontal'
    : 'vertical';
}

const DEFAULT_PANNING_MODE_KEY_IN_LOCAL_STORAGE = 'defaultPanningMode';
function getPanningModeFromLocalStorage(): 'grab' | 'pan' {
  return localStorage.getItem(DEFAULT_PANNING_MODE_KEY_IN_LOCAL_STORAGE) ===
    'grab'
    ? 'grab'
    : 'pan';
}
