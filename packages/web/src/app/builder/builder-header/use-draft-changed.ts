import { isNil } from '@fema-ipaas/core-utils';
import { useQuery } from '@tanstack/react-query';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { versionDiff } from '@/features/releases';
import { workflowsApi } from '@/features/workflows';

export function useDraftChanged(): boolean | null {
  const [workflowId, publishedVersionId, draft] = useBuilderStateContext(
    (state) => [
      state.workflow.id,
      state.workflow.publishedVersionId,
      state.workflowVersion,
    ],
  );
  const { data: published } = useQuery({
    queryKey: ['workflow-version-compare', workflowId, publishedVersionId],
    queryFn: async () =>
      (
        await workflowsApi.get(workflowId, {
          versionId: publishedVersionId ?? undefined,
        })
      ).version,
    enabled: !isNil(publishedVersionId),
  });
  if (isNil(publishedVersionId)) {
    return true;
  }
  if (isNil(published) || published.id === draft.id) {
    return null;
  }
  return versionDiff.hasChanges({ before: published, after: draft });
}
