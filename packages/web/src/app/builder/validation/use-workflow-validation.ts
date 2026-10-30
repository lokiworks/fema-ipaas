import { WorkflowVersionState } from '@fema-ipaas/shared';
import { useMemo } from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { stepTestState } from '@/app/builder/state/step-test-state';
import {
  useValidationFor,
  WorkflowValidationState,
} from '@/features/workflows/hooks/use-validation-for';
import { StepTestStatus } from '@/features/workflows/utils/workflow-validator';

import { useMappingCoverageFindings } from './use-mapping-coverage';

export function useWorkflowValidation(): WorkflowValidationState {
  const trigger = useBuilderStateContext(
    (state) => state.workflowVersion.trigger,
  );
  const stepTestStatuses = useStepTestStatuses();
  const mappingCoverage = useMappingCoverageFindings();
  return useValidationFor(trigger, stepTestStatuses, mappingCoverage);
}

export function useStepTestStatuses(): Record<string, StepTestStatus> | null {
  const [trigger, isDraft, debugTestedSteps, errorLogs] =
    useBuilderStateContext((state) => [
      state.workflowVersion.trigger,
      state.workflowVersion.state === WorkflowVersionState.DRAFT,
      state.debugTestedSteps,
      state.errorLogs,
    ]);
  return useMemo(
    () =>
      isDraft
        ? stepTestState.statusesOf({ trigger, debugTestedSteps, errorLogs })
        : null,
    [isDraft, trigger, debugTestedSteps, errorLogs],
  );
}
