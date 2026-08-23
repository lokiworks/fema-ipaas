import { isNil } from '@fema/core-utils';
import { WorkflowTriggerType } from '@fema/shared';
import { StoreApi } from 'zustand';

import { RightSideBarType } from '@/app/builder/types';
import { executionUtils } from '@/features/executions';

import { BuilderState } from '../builder-hooks';
import { CanvasOrientation } from '../workflow-canvas/utils/types';
import { workflowCanvasUtils } from '../workflow-canvas/utils/workflow-canvas-utils';

export type StepDataPanelView = 'drawer' | 'split';

export type CanvasState = {
  canvasOrientation: CanvasOrientation;
  setCanvasOrientation: (orientation: CanvasOrientation) => void;
  readonly: boolean;
  hideTestWidget: boolean;
  rightSidebar: RightSideBarType;
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
  stepDataPanelView: StepDataPanelView;
  setStepDataPanelView: (view: StepDataPanelView) => void;
  isStepDataPanelOpen: boolean;
  setStepDataPanelOpen: (open: boolean) => void;
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
        const rightSidebar =
          selectedStep === 'trigger' &&
          state.workflowVersion.trigger.type === WorkflowTriggerType.EMPTY
            ? RightSideBarType.NONE
            : RightSideBarType.CONNECTOR_SETTINGS;

        const userPickedDifferentStepDuringRun =
          !options?.fromAutoFocus &&
          !isNil(state.run) &&
          state.selectedStep !== selectedStep;

        return {
          openedConnectorSelectorStepNameOrAddButtonId: null,
          selectedStep,
          rightSidebar,
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
    stepDataPanelView: getStepDataPanelViewFromLocalStorage(),
    setStepDataPanelView: (view: StepDataPanelView) => {
      localStorage.setItem(STEP_DATA_PANEL_VIEW_KEY_IN_LOCAL_STORAGE, view);
      return set(() => ({
        stepDataPanelView: view,
      }));
    },
    isStepDataPanelOpen:
      getTestPanelOpenFromLocalStorage() || !isNil(initialState.run),
    setStepDataPanelOpen: (open: boolean) => {
      localStorage.setItem(
        TEST_PANEL_OPEN_KEY_IN_LOCAL_STORAGE,
        open ? 'open' : 'closed',
      );
      return set(() => ({
        isStepDataPanelOpen: open,
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

const STEP_DATA_PANEL_VIEW_KEY_IN_LOCAL_STORAGE = 'ap.builder.testPanelView';
function getStepDataPanelViewFromLocalStorage(): StepDataPanelView {
  return localStorage.getItem(STEP_DATA_PANEL_VIEW_KEY_IN_LOCAL_STORAGE) ===
    'split'
    ? 'split'
    : 'drawer';
}

const TEST_PANEL_OPEN_KEY_IN_LOCAL_STORAGE = 'ap.builder.testPanelOpen';
function getTestPanelOpenFromLocalStorage(): boolean {
  return localStorage.getItem(TEST_PANEL_OPEN_KEY_IN_LOCAL_STORAGE) === 'open';
}
