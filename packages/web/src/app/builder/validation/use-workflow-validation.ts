import { WorkflowVersionState } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { workflowsApi } from '@/features/workflows/api/workflows-api';
import {
  useValidationFor,
  WorkflowValidationState,
} from '@/features/workflows/hooks/use-validation-for';

import { useMappingCoverageFindings } from './use-mapping-coverage';

export function useWorkflowValidation(): WorkflowValidationState {
  const trigger = useBuilderStateContext(
    (state) => state.workflowVersion.trigger,
  );
  const debugVerification = useDebugEvidence();
  const mappingCoverage = useMappingCoverageFindings();
  const validation = useValidationFor(
    trigger,
    debugVerification.evidence,
    mappingCoverage,
  );
  return {
    ...validation,
    isLoading: validation.isLoading || debugVerification.isChecking,
  };
}

function useDebugEvidence(): {
  evidence: { executedStepNames: string[] } | null;
  isChecking: boolean;
} {
  const [workflowId, versionId, versionState, saving, lastSavedAt, runStatus] =
    useBuilderStateContext((state) => [
      state.workflow.id,
      state.workflowVersion.id,
      state.workflowVersion.state,
      state.saving,
      state.lastSavedAt,
      state.run?.status ?? null,
    ]);
  const { data, isFetching } = useQuery({
    queryKey: [
      'debug-verification',
      workflowId,
      versionId,
      lastSavedAt,
      runStatus,
    ],
    queryFn: () => workflowsApi.getDebugVerification({ workflowId, versionId }),
    enabled: versionState === WorkflowVersionState.DRAFT && !saving,
    staleTime: 0,
    gcTime: 0,
  });
  return {
    evidence:
      data?.verified === true
        ? { executedStepNames: data.executedStepNames }
        : null,
    isChecking: isFetching,
  };
}
