import { isNil } from '@fema-ipaas/core-utils';
import { WorkflowVersion, WorkflowVersionState } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { versionDiff } from '@/features/releases';
import { workflowsApi } from '@/features/workflows';

export function useActualDraft({
  enabled = true,
}: {
  enabled?: boolean;
} = {}): WorkflowVersion | null {
  const [workflowId, viewed] = useBuilderStateContext((state) => [
    state.workflow.id,
    state.workflowVersion,
  ]);
  const viewingDraft = viewed.state === WorkflowVersionState.DRAFT;
  const { data: latest } = useQuery({
    queryKey: ['workflow-latest-version', workflowId],
    queryFn: async () => (await workflowsApi.get(workflowId)).version,
    enabled: enabled && !viewingDraft,
    staleTime: 0,
  });
  return viewingDraft ? viewed : latest ?? null;
}

export function useDraftChanged({
  baselineVersionId,
  ofActualDraft = false,
}: {
  baselineVersionId: string | null | undefined;
  ofActualDraft?: boolean;
}): boolean | null {
  const [workflowId, viewed] = useBuilderStateContext((state) => [
    state.workflow.id,
    state.workflowVersion,
  ]);
  const actualDraft = useActualDraft({ enabled: ofActualDraft });
  const draft = ofActualDraft ? actualDraft : viewed;
  const { data: baseline } = useQuery({
    queryKey: ['workflow-version-compare', workflowId, baselineVersionId],
    queryFn: async () =>
      (
        await workflowsApi.get(workflowId, {
          versionId: baselineVersionId ?? undefined,
        })
      ).version,
    enabled: !isNil(baselineVersionId),
  });
  return useMemo(() => {
    if (isNil(baselineVersionId)) {
      return true;
    }
    if (isNil(baseline) || isNil(draft) || baseline.id === draft.id) {
      return null;
    }
    return versionDiff.hasChanges({ before: baseline, after: draft });
  }, [baselineVersionId, baseline, draft]);
}
