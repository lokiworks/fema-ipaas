import { QueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import { Socket } from 'socket.io-client';
import { create, useStore } from 'zustand';

import { CanvasState, createCanvasState } from './state/canvas-state';
import {
  createConnectorSelectorState,
  ConnectorSelectorState,
} from './state/connector-selector-state';
import { createNotesState, NotesState } from './state/notes-state';
import { createRunState, RunState } from './state/run-state';
import { createStepFormState, StepFormState } from './state/step-form-state';
import { createWorkflowState, WorkflowState } from './state/workflow-state';

export const BuilderStateContext = createContext<BuilderStore | null>(null);

export function useBuilderStore(): BuilderStore {
  const store = useContext(BuilderStateContext);
  if (!store)
    throw new Error('Missing BuilderStateContext.Provider in the tree');
  return store;
}

export function useBuilderStateContext<T>(
  selector: (state: BuilderState) => T,
): T {
  return useStore(useBuilderStore(), selector);
}

export type BuilderState = WorkflowState &
  ConnectorSelectorState &
  RunState &
  CanvasState &
  StepFormState &
  NotesState;
export type BuilderInitialState = Pick<
  BuilderState,
  | 'workflow'
  | 'workflowVersion'
  | 'readonly'
  | 'hideTestWidget'
  | 'run'
  | 'outputSampleData'
  | 'inputSampleData'
> & {
  socket: Socket;
  queryClient: QueryClient;
};

export type BuilderStore = ReturnType<typeof createBuilderStore>;
export const createBuilderStore = (initialState: BuilderInitialState) =>
  create<BuilderState>((set, get) => {
    const workflowState = createWorkflowState(initialState, get, set);
    const connectorSelectorState = createConnectorSelectorState(get, set);
    const runState = createRunState(initialState, get, set);
    const canvasState = createCanvasState(initialState, set);
    const stepFormState = createStepFormState(set);
    const notesState = createNotesState(get, set);
    return {
      ...workflowState,
      ...notesState,
      ...runState,
      ...connectorSelectorState,
      ...canvasState,
      ...stepFormState,
    };
  });
