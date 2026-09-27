import { isNil, Permission } from '@fema-ipaas/core-utils';
import { WorkflowVersionState } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Cloud, LoaderCircle } from 'lucide-react';
import { useMemo } from 'react';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { useBuilderSnapshotVersionId } from '@/app/builder/snapshot-context';
import { versionNumbers } from '@/app/builder/workflow-versions/version-numbers';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { projectCollectionUtils } from '@/features/projects';
import { releasesHooks } from '@/features/releases';
import { workflowHooks } from '@/features/workflows';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

export function WorkflowStateTags() {
  const [workflow, workflowVersion, editLockHolder] = useBuilderStateContext(
    (state) => [state.workflow, state.workflowVersion, state.editLockHolder],
  );
  const snapshotVersionId = useBuilderSnapshotVersionId();
  const { project } = projectCollectionUtils.useCurrentProject();
  const { checkAccess } = useAuthorization();
  const canEdit = checkAccess(Permission.WRITE_WORKFLOW);
  const numbers = useVersionNumbers(workflow.id);
  const { data: overview } = releasesHooks.useEnvironments({
    projectId: project.id,
    enabled:
      project.releasesEnabled && checkAccess(Permission.READ_PROJECT_RELEASE),
    showErrorDialog: false,
  });
  const pendingReleaseId =
    overview?.workflows.find((row) => row.workflowId === workflow.id)
      ?.pendingReleaseId ?? null;

  if (!isNil(snapshotVersionId)) {
    return (
      <StateTag tone="primary">
        {t('Snapshot {version}', {
          version:
            versionNumbers.label({ numbers, versionId: snapshotVersionId }) ??
            '',
        })}
      </StateTag>
    );
  }

  const hasDeployment =
    !isNil(workflow.publishedVersionId) ||
    (project.releasesEnabled && !isNil(workflow.testVersionId));
  const hasUnpublishedChanges =
    hasDeployment && workflowVersion.state === WorkflowVersionState.DRAFT;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {hasUnpublishedChanges && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <StateTag tone="warning">{t('Unpublished updates')}</StateTag>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {project.releasesEnabled
              ? t('Your edits are not deployed to test yet')
              : t(
                  'Your edits are not published yet; runs still use the previous version',
                )}
          </TooltipContent>
        </Tooltip>
      )}
      {!hasDeployment && (
        <StateTag tone="outline">{t('Not published')}</StateTag>
      )}
      {!isNil(pendingReleaseId) && (
        <StateTag tone="info">{t('Promotion pending approval')}</StateTag>
      )}
      {!canEdit && <StateTag tone="outline">{t('Read only')}</StateTag>}
      {!isNil(editLockHolder) && (
        <StateTag tone="warning">
          {t('{name} is editing', { name: editLockHolder.userDisplayName })}
        </StateTag>
      )}
    </div>
  );
}

export function WorkflowMetaLine() {
  const [workflow, workflowVersion, saving, readonly] = useBuilderStateContext(
    (state) => [
      state.workflow,
      state.workflowVersion,
      state.saving,
      state.readonly,
    ],
  );
  const snapshotVersionId = useBuilderSnapshotVersionId();
  const { project } = projectCollectionUtils.useCurrentProject();
  const numbers = useVersionNumbers(workflow.id);
  const isEditing =
    isNil(snapshotVersionId) &&
    !readonly &&
    workflowVersion.state === WorkflowVersionState.DRAFT;
  const productionLabel = versionNumbers.label({
    numbers,
    versionId: workflow.publishedVersionId,
  });
  const testLabel = versionNumbers.label({
    numbers,
    versionId: workflow.testVersionId,
  });

  return (
    <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
      {!isNil(workflowVersion.updated) && (
        <span className="truncate">
          {t('Last updated')}:{' '}
          {formatUtils.formatDate(new Date(workflowVersion.updated))}
        </span>
      )}
      {isEditing && (
        <span className="flex shrink-0 items-center gap-1">
          {saving ? (
            <>
              <LoaderCircle className="size-3 animate-spin" />
              {t('Saving...')}
            </>
          ) : (
            <>
              <Cloud className="size-3" />
              {t('Saved automatically')}
            </>
          )}
        </span>
      )}
      {isNil(snapshotVersionId) &&
        (project.releasesEnabled ? (
          <span className="shrink-0">
            {t('Test {test} · Production {production}', {
              test: testLabel ?? t('not published'),
              production: productionLabel ?? t('not published'),
            })}
          </span>
        ) : (
          productionLabel && (
            <span className="shrink-0">
              {t('Live version {version}', { version: productionLabel })}
            </span>
          )
        ))}
    </div>
  );
}

function useVersionNumbers(workflowId: string): Record<string, number> {
  const { data } = workflowHooks.useListWorkflowVersions(workflowId);
  return useMemo(() => versionNumbers.numberVersions(data?.data ?? []), [data]);
}

function StateTag({
  tone,
  children,
}: {
  tone: 'primary' | 'warning' | 'info' | 'outline';
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] leading-4',
        tone === 'primary' && 'border-primary/40 bg-primary/10 text-primary',
        tone === 'warning' && 'border-warning/40 bg-warning/10 text-warning',
        tone === 'info' && 'border-blue-500/40 bg-blue-500/10 text-blue-600',
        tone === 'outline' && 'border-border text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}
