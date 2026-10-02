import { isNil } from '@fema-ipaas/core-utils';
import { useQuery } from '@tanstack/react-query';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { versionDiff } from '@/features/releases';
import { workflowsApi } from '@/features/workflows';

export function useDraftChanged({
  baselineVersionId,
}: {
  baselineVersionId: string | null | undefined;
}): boolean | null {
  const [workflowId, draft] = useBuilderStateContext((state) => [
    state.workflow.id,
    state.workflowVersion,
  ]);
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
  if (isNil(baselineVersionId)) {
    return true;
  }
  if (isNil(baseline) || baseline.id === draft.id) {
    return null;
  }
  return versionDiff.hasChanges({ before: baseline, after: draft });
}
