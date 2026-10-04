import { workflowStructureUtil } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { workflowsApi } from '@/features/workflows';

import {
  FieldChange,
  StepChange,
  StepChangeKind,
  versionDiff,
} from '../utils/version-diff';

export function StepDiff({
  workflowId,
  versionId,
  previousVersionId,
}: StepDiffProps) {
  const { entries, isLoading } = useStepChanges({
    workflowId,
    versionId,
    previousVersionId,
  });
  if (isLoading) {
    return <Skeleton className="h-16 w-full" />;
  }
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('No step changes compared with the published version.')}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {entries.map(({ change, fields }) => (
        <li
          key={`${change.kind}-${change.name}`}
          className="flex flex-col gap-1"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={kindVariant(change.kind)}>
              {kindLabel(change.kind)}
            </Badge>
            <span>{change.displayName}</span>
            <span className="text-xs text-muted-foreground font-mono">
              {change.name}
            </span>
          </div>
          {fields.length > 0 && (
            <ul className="ml-2 flex flex-col gap-1 rounded-md border bg-muted/30 p-2 text-xs font-mono">
              {fields.map((field) => (
                <li key={field.path} className="flex flex-col">
                  <span className="text-muted-foreground">{field.path}</span>
                  <span className="text-destructive break-all">
                    − {field.before ?? t('(empty)')}
                  </span>
                  <span className="text-success break-all">
                    + {field.after ?? t('(empty)')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function useStepChanges({
  workflowId,
  versionId,
  previousVersionId,
}: StepDiffProps): { entries: StepChangeEntry[]; isLoading: boolean } {
  const { data: target, isLoading: loadingTarget } = useQuery({
    queryKey: ['release-version', workflowId, versionId],
    queryFn: () => workflowsApi.get(workflowId, { versionId }),
  });
  const { data: previous, isLoading: loadingPrevious } = useQuery({
    queryKey: ['release-version', workflowId, previousVersionId],
    queryFn: () =>
      workflowsApi.get(workflowId, {
        versionId: previousVersionId ?? undefined,
      }),
    enabled: !!previousVersionId,
  });
  if (!target || loadingTarget || (previousVersionId && loadingPrevious)) {
    return { entries: [], isLoading: true };
  }
  const changes = versionDiff.diffSteps({
    before: previous?.version.trigger ?? null,
    after: target.version.trigger,
  });
  const beforeSteps = new Map(
    (previous
      ? workflowStructureUtil.getAllSteps(previous.version.trigger)
      : []
    ).map((step) => [step.name, step]),
  );
  const afterSteps = new Map(
    workflowStructureUtil
      .getAllSteps(target.version.trigger)
      .map((step) => [step.name, step]),
  );
  return {
    isLoading: false,
    entries: changes.map((change) => ({
      change,
      fields:
        change.kind === StepChangeKind.MODIFIED
          ? versionDiff.fieldChanges({
              before: beforeSteps.get(change.name) ?? null,
              after: afterSteps.get(change.name) ?? null,
            })
          : [],
    })),
  };
}

function kindLabel(kind: StepChangeKind): string {
  return CHANGE_LABELS[kind]();
}

function kindVariant(kind: StepChangeKind): 'success' | 'info' | 'destructive' {
  return CHANGE_VARIANTS[kind];
}

const CHANGE_LABELS: Record<StepChangeKind, () => string> = {
  [StepChangeKind.ADDED]: () => t('Added'),
  [StepChangeKind.MODIFIED]: () => t('Modified'),
  [StepChangeKind.REMOVED]: () => t('Removed'),
};

const CHANGE_VARIANTS: Record<
  StepChangeKind,
  'success' | 'info' | 'destructive'
> = {
  [StepChangeKind.ADDED]: 'success',
  [StepChangeKind.MODIFIED]: 'info',
  [StepChangeKind.REMOVED]: 'destructive',
};

export const stepChangeHooks = { useStepChanges };

export const stepChangeUtils = { kindLabel, kindVariant };

type StepDiffProps = {
  workflowId: string;
  versionId: string;
  previousVersionId: string | null | undefined;
};

type StepChangeEntry = {
  change: StepChange;
  fields: FieldChange[];
};

export type { StepChangeEntry };
