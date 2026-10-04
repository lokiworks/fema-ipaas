import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import {
  useValidationFor,
  WorkflowValidationState,
} from '@/features/workflows/hooks/use-validation-for';

export function useWorkflowValidation(): WorkflowValidationState {
  const trigger = useBuilderStateContext(
    (state) => state.workflowVersion.trigger,
  );
  return useValidationFor(trigger);
}
