import { isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowOperationRequest,
  WorkflowOperationType,
  WorkflowVersion,
  WorkflowVersionState,
  PopulatedWorkflow,
  workflowOperations,
  workflowStructureUtil,
  StepSettings,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';
import { QueryClient } from '@tanstack/react-query';
import { StoreApi } from 'zustand';

import { RightSideBarType } from '@/app/builder/types';
import {
  ConnectorSelectorItem,
  ConnectorSelectorOperation,
  connectorSelectorUtils,
} from '@/features/connectors';
import { workflowsApi, sampleDataHooks } from '@/features/workflows';
import { PromiseQueue } from '@/lib/promise-queue';

import { BuilderState } from '../builder-hooks';
import { workflowCanvasUtils } from '../workflow-canvas/utils/workflow-canvas-utils';

import { UndoHistory, undoHistory } from './undo-history';

export type WorkflowState = {
  workflow: PopulatedWorkflow;
  workflowVersion: WorkflowVersion;
  outputSampleData: Record<string, unknown | undefined>;
  inputSampleData: Record<string, unknown | undefined>;
  saving: boolean;
  renameWorkflowClientSide: (newName: string) => void;
  moveToFolderClientSide: (folderId: string) => void;
  applyOperation: (
    operation: WorkflowOperationRequest,
    onSuccess?: () => void,
  ) => void;
  setWorkflow: (workflow: PopulatedWorkflow) => void;
  setSampleDataLocally: (params: {
    stepName: string;
    type: 'input' | 'output';
    value: unknown;
  }) => void;
  setVersion: (
    workflowVersion: WorkflowVersion,
    shouldReselectInitialStep?: boolean,
  ) => void;
  addOperationListener: (
    listener: (
      workflowVersion: WorkflowVersion,
      operation: WorkflowOperationRequest,
    ) => void,
  ) => void;
  removeOperationListener: (
    listener: (
      workflowVersion: WorkflowVersion,
      operation: WorkflowOperationRequest,
    ) => void,
  ) => void;
  isPublishing: boolean;
  setIsPublishing: (isPublishing: boolean) => void;
  operationListeners: Array<
    (
      workflowVersion: WorkflowVersion,
      operation: WorkflowOperationRequest,
    ) => void
  >;
  history: UndoHistory;
  historyNonce: number;
  applyOperations: (operations: WorkflowOperationRequest[]) => void;
  undo: () => void;
  redo: () => void;
  handleAddingOrUpdatingStep: (props: {
    connectorSelectorItem: ConnectorSelectorItem;
    operation: ConnectorSelectorOperation;
    overrideSettings?: StepSettings;
    selectStepAfter: boolean;
    customLogoUrl?: string;
  }) => string;
};
export type WorkflowInitialState = Pick<
  WorkflowState,
  'workflow' | 'workflowVersion' | 'outputSampleData' | 'inputSampleData'
> & {
  queryClient: QueryClient;
};

export const createWorkflowState = (
  initialState: WorkflowInitialState,
  get: StoreApi<BuilderState>['getState'],
  set: StoreApi<BuilderState>['setState'],
): WorkflowState => {
  const workflowUpdatesQueue = new PromiseQueue();
  const debouncer = createKeyedDebouncer({
    wait: 1000,
    onFire: (updateRequest) => workflowUpdatesQueue.add(updateRequest),
  });
  const debouncedAddToWorkflowUpdatesQueue = (
    key: string,
    updateRequest: () => Promise<void>,
  ) => debouncer.schedule({ key, task: updateRequest });
  const historyControl = { suspended: false };
  const replayToward = (target: WorkflowVersion) => {
    const operations = undoHistory.operationsToReach({
      current: get().workflowVersion,
      target,
    });
    historyControl.suspended = true;
    try {
      operations.forEach((operation) => get().applyOperation(operation));
    } finally {
      historyControl.suspended = false;
    }
  };
  return {
    history: undoHistory.emptyHistory(),
    historyNonce: 0,
    applyOperations: (operations: WorkflowOperationRequest[]) => {
      const before = get().workflowVersion;
      historyControl.suspended = true;
      try {
        operations.forEach((operation) => get().applyOperation(operation));
      } finally {
        historyControl.suspended = false;
      }
      const after = get().workflowVersion;
      if (
        undoHistory.operationsToReach({ current: after, target: before })
          .length === 0
      ) {
        return;
      }
      set((state) => ({
        history: undoHistory.record({
          history: state.history,
          entry: { before, after, mergeKey: null, at: Date.now() },
        }),
      }));
    },
    undo: () => {
      const { history, readonly } = get();
      if (readonly) {
        return;
      }
      const { history: next, entry } = undoHistory.takeUndo(history);
      if (isNil(entry)) {
        return;
      }
      replayToward(entry.before);
      set((state) => ({
        history: next,
        historyNonce: state.historyNonce + 1,
      }));
    },
    redo: () => {
      const { history, readonly } = get();
      if (readonly) {
        return;
      }
      const { history: next, entry } = undoHistory.takeRedo(history);
      if (isNil(entry)) {
        return;
      }
      replayToward(entry.after);
      set((state) => ({
        history: next,
        historyNonce: state.historyNonce + 1,
      }));
    },
    saving: false,
    outputSampleData: initialState.outputSampleData,
    inputSampleData: initialState.inputSampleData,
    workflow: initialState.workflow,
    workflowVersion: initialState.workflowVersion,
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
    moveToFolderClientSide: (folderId: string) => {
      set((state) => {
        return {
          workflow: {
            ...state.workflow,
            folderId,
          },
        };
      });
    },
    setWorkflow: (workflow: PopulatedWorkflow) =>
      set({ workflow, selectedStep: null }),
    setSampleDataLocally: ({
      stepName,
      value,
      type,
    }: {
      stepName: string;
      value: unknown;
      type: 'input' | 'output';
    }) =>
      set((state) => {
        if (type === 'input') {
          return {
            inputSampleData: {
              ...state.inputSampleData,
              [stepName]: value,
            },
          };
        }
        return {
          outputSampleData: {
            ...state.outputSampleData,
            [stepName]: value,
          },
        };
      }),
    setIsPublishing: (isPublishing: boolean) =>
      set((state) => {
        if (isPublishing) {
          state.removeStepSelection();
          state.setReadOnly(true);
        } else {
          state.setReadOnly(false);
        }
        return {
          isPublishing,
        };
      }),
    isPublishing: false,
    applyOperation: (
      operation: WorkflowOperationRequest,
      onSuccess?: () => void,
    ) =>
      set((state) => {
        if (state.readonly) {
          if (operation.type === WorkflowOperationType.UPDATE_NOTE) {
            const newWorkflowVersion = workflowOperations.apply(
              state.workflowVersion,
              operation,
            );
            return {
              workflowVersion: newWorkflowVersion,
            };
          }
          console.warn('Cannot apply operation while readonly');
          return state;
        }
        const newWorkflowVersion = workflowOperations.apply(
          state.workflowVersion,
          operation,
        );
        const shouldRecord =
          !historyControl.suspended &&
          undoHistory.isUndoable(operation) &&
          undoHistory.operationsToReach({
            current: newWorkflowVersion,
            target: state.workflowVersion,
          }).length > 0;
        const history = shouldRecord
          ? undoHistory.record({
              history: state.history,
              entry: {
                before: state.workflowVersion,
                after: newWorkflowVersion,
                mergeKey: undoHistory.mergeKeyOf({
                  before: state.workflowVersion,
                  after: newWorkflowVersion,
                  operation,
                }),
                at: Date.now(),
              },
            })
          : state.history;
        state.operationListeners.forEach((listener) => {
          listener(state.workflowVersion, operation);
        });
        set({ saving: true });
        const updateRequest = async () => {
          try {
            const { version: serverWorkflowVersion } =
              await workflowsApi.update(state.workflow.id, operation, true);
            if (operation.type === WorkflowOperationType.SAVE_SAMPLE_DATA) {
              sampleDataHooks.invalidateSampleData(
                serverWorkflowVersion.id,
                initialState.queryClient,
              );
            }
            set((state) => {
              const updatedWorkflowVersionWithUpdatedSampleData =
                handleUpdatingSampleDataForStepLocallyAfterServerUpdate({
                  operation,
                  localWorkflowVersion: state.workflowVersion,
                  updatedWorkflowVersion: serverWorkflowVersion,
                });
              return {
                workflowVersion: {
                  ...updatedWorkflowVersionWithUpdatedSampleData,
                  id: serverWorkflowVersion.id,
                  state: serverWorkflowVersion.state,
                },
                saving: workflowUpdatesQueue.size() !== 0,
              };
            });
            onSuccess?.();
          } catch (error) {
            console.error(error);
            workflowUpdatesQueue.halt();
          }
        };

        switch (operation.type) {
          case WorkflowOperationType.SAVE_SAMPLE_DATA: {
            debouncer.flush();
            workflowUpdatesQueue.add(updateRequest);
            break;
          }
          case WorkflowOperationType.UPDATE_TRIGGER:
          case WorkflowOperationType.UPDATE_ACTION: {
            debouncedAddToWorkflowUpdatesQueue(
              operation.request.name,
              updateRequest,
            );
            break;
          }
          case WorkflowOperationType.UPDATE_NOTE:
          case WorkflowOperationType.DELETE_NOTE:
          case WorkflowOperationType.ADD_NOTE: {
            debouncedAddToWorkflowUpdatesQueue(
              operation.request.id,
              updateRequest,
            );
            break;
          }
          case WorkflowOperationType.DELETE_ACTION: {
            const inputSampleData = { ...state.inputSampleData };
            const outputSampleData = { ...state.outputSampleData };
            operation.request.names.forEach((name) => {
              delete inputSampleData[name];
              delete outputSampleData[name];
              state.removeStepTestListener(name);
            });
            set(() => {
              return {
                inputSampleData,
                outputSampleData,
              };
            });
            debouncer.flush();
            workflowUpdatesQueue.add(updateRequest);
            break;
          }
          default: {
            debouncer.flush();
            workflowUpdatesQueue.add(updateRequest);
          }
        }

        return { workflowVersion: newWorkflowVersion, history };
      }),
    setVersion: (
      workflowVersion: WorkflowVersion,
      shouldReselectInitialStep: boolean = true,
    ) => {
      const initiallySelectedStep =
        workflowCanvasUtils.determineInitiallySelectedStep(
          null,
          workflowVersion,
        );
      const isEmptyTriggerInitiallySelected =
        initiallySelectedStep === 'trigger' &&
        workflowVersion.trigger.type === WorkflowTriggerType.EMPTY;
      set((state) => ({
        workflowVersion,
        history: undoHistory.emptyHistory(),
        run: null,
        selectedStep: shouldReselectInitialStep
          ? initiallySelectedStep
          : state.selectedStep,
        readonly:
          state.workflow.publishedVersionId !== workflowVersion.id &&
          workflowVersion.state === WorkflowVersionState.LOCKED,
        rightSidebar:
          initiallySelectedStep && !isEmptyTriggerInitiallySelected
            ? RightSideBarType.CONNECTOR_SETTINGS
            : RightSideBarType.NONE,
        selectedBranchIndex: null,
      }));
    },
    operationListeners: [],
    addOperationListener: (
      listener: (
        workflowVersion: WorkflowVersion,
        operation: WorkflowOperationRequest,
      ) => void,
    ) =>
      set((state) => ({
        operationListeners: [...state.operationListeners, listener],
      })),
    removeOperationListener: (
      listener: (
        workflowVersion: WorkflowVersion,
        operation: WorkflowOperationRequest,
      ) => void,
    ) =>
      set((state) => ({
        operationListeners: state.operationListeners.filter(
          (l) => l !== listener,
        ),
      })),
    handleAddingOrUpdatingStep: ({
      connectorSelectorItem,
      operation,
      overrideSettings,
      selectStepAfter,
      customLogoUrl,
    }): string => {
      const {
        applyOperation,
        selectStepByName,
        workflowVersion,
        setOpenedConnectorSelectorStepNameOrAddButtonId,
        removeStepTestListener,
      } = get();
      const defaultValues = connectorSelectorUtils.getDefaultStepValues({
        stepName: connectorSelectorUtils.getStepNameFromOperationType(
          operation,
          workflowVersion,
        ),
        connectorSelectorItem,
        overrideDefaultSettings: overrideSettings,
        customLogoUrl,
      });
      const isTrigger =
        defaultValues.type === WorkflowTriggerType.CONNECTOR ||
        defaultValues.type === WorkflowTriggerType.EMPTY;
      switch (operation.type) {
        case WorkflowOperationType.UPDATE_TRIGGER: {
          if (!isTrigger) {
            break;
          }
          if (workflowVersion.trigger.type === WorkflowTriggerType.EMPTY) {
            set(() => {
              return {
                rightSidebar: RightSideBarType.CONNECTOR_SETTINGS,
              };
            });
          }
          applyOperation({
            type: WorkflowOperationType.UPDATE_TRIGGER,
            request: defaultValues,
          });
          selectStepByName('trigger');
          applyOperation({
            type: WorkflowOperationType.UPDATE_SAMPLE_DATA_INFO,
            request: {
              stepName: 'trigger',
              sampleDataSettings: undefined,
            },
          });
          break;
        }
        case WorkflowOperationType.ADD_ACTION: {
          if (isTrigger) {
            break;
          }
          applyOperation({
            type: WorkflowOperationType.ADD_ACTION,
            request: {
              ...operation.actionLocation,
              action: {
                ...defaultValues,
              },
            },
          });
          if (selectStepAfter) {
            selectStepByName(defaultValues.name);
          }
          break;
        }
        case WorkflowOperationType.UPDATE_ACTION: {
          const currentAction = workflowStructureUtil.getStep(
            operation.stepName,
            workflowVersion.trigger,
          );
          if (isNil(currentAction)) {
            console.error(
              "Trying to update an action that's not in the displayed workflow version",
            );
            break;
          }
          if (
            !workflowStructureUtil.isAction(currentAction.type) ||
            !workflowStructureUtil.isAction(defaultValues.type)
          ) {
            break;
          }
          applyOperation({
            type: WorkflowOperationType.UPDATE_ACTION,
            request: {
              type: defaultValues.type,
              displayName: defaultValues.displayName,
              name: operation.stepName,
              settings: {
                ...defaultValues.settings,
                customLogoUrl,
              },
              valid: defaultValues.valid,
            },
          });
          applyOperation({
            type: WorkflowOperationType.UPDATE_SAMPLE_DATA_INFO,
            request: {
              stepName: operation.stepName,
              sampleDataSettings: undefined,
            },
          });
          removeStepTestListener(operation.stepName);
          break;
        }
      }
      setOpenedConnectorSelectorStepNameOrAddButtonId(null);
      return defaultValues.name;
    },
  };
};
function createKeyedDebouncer({
  wait,
  onFire,
}: {
  wait: number;
  onFire: (task: () => Promise<void>) => void;
}) {
  const pending = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; task: () => Promise<void> }
  >();
  const fire = (key: string) => {
    const entry = pending.get(key);
    if (isNil(entry)) {
      return;
    }
    clearTimeout(entry.timer);
    pending.delete(key);
    onFire(entry.task);
  };
  return {
    schedule: ({ key, task }: { key: string; task: () => Promise<void> }) => {
      const existing = pending.get(key);
      if (!isNil(existing)) {
        clearTimeout(existing.timer);
      }
      pending.set(key, { timer: setTimeout(() => fire(key), wait), task });
    },
    flush: () => {
      [...pending.keys()].forEach(fire);
    },
  };
}

/**Because the server creates the sample data files ids and we need to update the local workflow version with the new sample data files ids so when an update happens again in the future it doesn't get unset */
const handleUpdatingSampleDataForStepLocallyAfterServerUpdate = ({
  operation,
  localWorkflowVersion,
  updatedWorkflowVersion,
}: {
  operation: WorkflowOperationRequest;
  localWorkflowVersion: WorkflowVersion;
  updatedWorkflowVersion: WorkflowVersion;
}) => {
  if (operation.type !== WorkflowOperationType.SAVE_SAMPLE_DATA) {
    return localWorkflowVersion;
  }
  const localStep = workflowStructureUtil.getStep(
    operation.request.stepName,
    localWorkflowVersion.trigger,
  );
  const updatedStep = workflowStructureUtil.getStep(
    operation.request.stepName,
    updatedWorkflowVersion.trigger,
  );
  if (isNil(localStep) || isNil(updatedStep)) {
    console.error(`Step ${operation.request.stepName} not found`);
    return localWorkflowVersion;
  }
  return workflowOperations.apply(localWorkflowVersion, {
    type: WorkflowOperationType.UPDATE_SAMPLE_DATA_INFO,
    request: {
      stepName: operation.request.stepName,
      sampleDataSettings: updatedStep.settings.sampleData,
    },
  });
};
