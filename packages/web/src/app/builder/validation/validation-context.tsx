import { createContext, useContext } from 'react';

import {
  useWorkflowValidation,
  WorkflowValidationState,
} from './use-workflow-validation';

const ValidationContext = createContext<WorkflowValidationState | null>(null);

export function BuilderValidationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const validation = useWorkflowValidation();
  return (
    <ValidationContext.Provider value={validation}>
      {children}
    </ValidationContext.Provider>
  );
}

export function useBuilderValidation(): WorkflowValidationState {
  const value = useContext(ValidationContext);
  return value ?? EMPTY_VALIDATION;
}

const EMPTY_VALIDATION: WorkflowValidationState = {
  issues: [],
  errorCount: 0,
  warningCount: 0,
  writeSteps: [],
  isLoading: false,
};
