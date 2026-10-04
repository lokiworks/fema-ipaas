import { isNil } from '@fema-ipaas/core-utils';
import { WorkflowRetryStrategy, WorkflowTrigger } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';

import { Skeleton } from '@/components/ui/skeleton';
import { workflowsApi } from '@/features/workflows';
import { useValidationFor } from '@/features/workflows/hooks/use-validation-for';

import { RerunGroup, rerunPreviewUtils } from '../utils/rerun-preview-utils';

export function RerunPreview({
  groups,
  strategy,
}: {
  groups: RerunGroup[];
  strategy: WorkflowRetryStrategy;
}) {
  if (groups.length === 0) {
    return null;
  }
  const shown = groups.slice(0, MAX_GROUPS_SHOWN);
  const hidden = groups.length - shown.length;
  return (
    <div
      className="flex flex-col gap-2 rounded-md border p-3 text-xs"
      data-testid="rerun-preview"
    >
      <span className="text-sm font-medium">
        {t('What will happen when you rerun')}
      </span>
      {shown.map((group) => (
        <GroupPreview key={group.key} group={group} strategy={strategy} />
      ))}
      {hidden > 0 && (
        <span className="text-muted-foreground">
          {t('{count, plural, =1 {1 more group} other {# more groups}}', {
            count: hidden,
          })}
        </span>
      )}
    </div>
  );
}

function GroupPreview({
  group,
  strategy,
}: {
  group: RerunGroup;
  strategy: WorkflowRetryStrategy;
}) {
  const target = useTargetVersion({ group, strategy });
  return (
    <div className="flex flex-col gap-1 rounded-md bg-muted/50 p-2">
      <span className="font-medium">
        {t('{name}: {count, plural, =1 {1 run} other {# runs}}', {
          name: group.workflowName ?? group.workflowId,
          count: group.count,
        })}
      </span>
      {target.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <>
          <span>{versionText({ target, strategy })}</span>
          {!isNil(target.trigger) && (
            <WriteStepsText
              trigger={target.trigger}
              group={group}
              strategy={strategy}
            />
          )}
        </>
      )}
    </div>
  );
}

function WriteStepsText({
  trigger,
  group,
  strategy,
}: {
  trigger: WorkflowTrigger;
  group: RerunGroup;
  strategy: WorkflowRetryStrategy;
}) {
  const { writeSteps, isLoading } = useValidationFor(trigger);
  if (isLoading) {
    return <Skeleton className="h-8 w-full" />;
  }
  if (writeSteps.length === 0) {
    return <span>{t('No step that writes data is involved.')}</span>;
  }
  const { executed, kept } = rerunPreviewUtils.splitWriteSteps({
    stepOrder: rerunPreviewUtils.stepOrderOf({ trigger }),
    writeSteps,
    failedStepName: group.failedStepName,
    strategy,
  });
  const names = (steps: typeof writeSteps) =>
    steps.map((step) => step.displayName).join(', ');
  return (
    <>
      {executed.length > 0 && (
        <span>
          {t('Will call and write again: {steps}', { steps: names(executed) })}
        </span>
      )}
      {kept.length > 0 && (
        <span>
          {t('Will not be called again, original results are kept: {steps}', {
            steps: names(kept),
          })}
        </span>
      )}
      {executed.length > 0 && (
        <span className="text-muted-foreground">
          {t('Branches still decide which of these steps actually run.')}
        </span>
      )}
    </>
  );
}

function versionText({
  target,
  strategy,
}: {
  target: TargetVersion;
  strategy: WorkflowRetryStrategy;
}): string {
  if (strategy === WorkflowRetryStrategy.FROM_FAILED_STEP) {
    return isNil(target.number)
      ? t(
          'Continues on the version these runs were on. Later published versions are not used.',
        )
      : t(
          'Continues on v{version}, the version these runs were on. Later published versions are not used.',
          { version: target.number },
        );
  }
  return isNil(target.number)
    ? t('Restarts from the trigger on the latest published version.')
    : t(
        'Restarts from the trigger on the latest published version v{version}.',
        {
          version: target.number,
        },
      );
}

function useTargetVersion({
  group,
  strategy,
}: {
  group: RerunGroup;
  strategy: WorkflowRetryStrategy;
}): TargetVersion {
  const original = strategy === WorkflowRetryStrategy.FROM_FAILED_STEP;
  const workflowQuery = useQuery({
    queryKey: ['rerun-preview-workflow', group.workflowId],
    queryFn: () => workflowsApi.get(group.workflowId),
    enabled: !original,
    staleTime: 30_000,
  });
  const publishedId = workflowQuery.data?.publishedVersionId ?? null;
  const versionId = original ? group.workflowVersionId : publishedId;
  const versionQuery = useQuery({
    queryKey: ['rerun-preview-version', group.workflowId, versionId],
    queryFn: () =>
      workflowsApi.get(group.workflowId, { versionId: versionId ?? undefined }),
    enabled: !isNil(versionId),
    staleTime: 30_000,
  });
  const numbersQuery = useQuery({
    queryKey: ['rerun-preview-numbers', group.workflowId],
    queryFn: () =>
      workflowsApi.listVersions(group.workflowId, {
        cursor: undefined,
        limit: 100,
      }),
    enabled: !original,
    staleTime: 30_000,
  });
  const number = original
    ? group.versionNumber
    : numberOf({ versions: numbersQuery.data?.data ?? [], versionId });
  const isLoading = original
    ? versionQuery.isLoading
    : workflowQuery.isLoading ||
      numbersQuery.isLoading ||
      (!isNil(publishedId) && versionQuery.isLoading);
  return {
    number,
    trigger: versionQuery.data?.version.trigger ?? null,
    isLoading,
  };
}

function numberOf({
  versions,
  versionId,
}: {
  versions: { id: string; state: string; created: string }[];
  versionId: string | null;
}): number | null {
  const target = versions.find((version) => version.id === versionId);
  if (isNil(target)) {
    return null;
  }
  return versions.filter(
    (version) =>
      version.state === target.state &&
      Date.parse(version.created) <= Date.parse(target.created),
  ).length;
}

const MAX_GROUPS_SHOWN = 3;

type TargetVersion = {
  number: number | null;
  trigger: WorkflowTrigger | null;
  isLoading: boolean;
};
