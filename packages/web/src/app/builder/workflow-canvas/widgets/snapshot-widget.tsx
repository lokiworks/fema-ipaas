import { Permission } from '@fema-ipaas/core-utils';
import { WorkflowOperationType } from '@fema-ipaas/shared';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { ArrowLeft, CopyPlus, History } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { workflowHooks, workflowsApi } from '@/features/workflows';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';

import { useBuilderStateContext } from '../../builder-hooks';
import { versionNumbers } from '../../workflow-versions/version-numbers';

import LargeWidgetWrapper from './large-widget-wrapper';

export function SnapshotWidget({ versionId }: { versionId: string }) {
  const navigate = useNavigate();
  const [workflow, workflowVersion] = useBuilderStateContext((state) => [
    state.workflow,
    state.workflowVersion,
  ]);
  const { checkAccess } = useAuthorization();
  const { data: versions } = workflowHooks.useListWorkflowVersions(workflow.id);
  const label = useMemo(
    () =>
      versionNumbers.label({
        numbers: versionNumbers.numberVersions(versions?.data ?? []),
        versionId,
      }) ?? '',
    [versions, versionId],
  );
  const { mutate: copy, isPending } = useMutation({
    mutationFn: async () => {
      const displayName = t('{name} (copy of {version})', {
        name: workflowVersion.displayName,
        version: label,
      });
      const created = await workflowsApi.create({
        displayName,
        projectId: workflow.projectId,
        folderId: workflow.folderId ?? undefined,
      });
      await workflowsApi.update(created.id, {
        type: WorkflowOperationType.IMPORT_WORKFLOW,
        request: {
          displayName,
          trigger: workflowVersion.trigger,
          schemaVersion: workflowVersion.schemaVersion,
          notes: workflowVersion.notes,
        },
      });
      return created.id;
    },
    onSuccess: (workflowId) =>
      navigate(
        authenticationSession.appendProjectRoutePrefix(
          `/workflows/${workflowId}`,
        ),
      ),
  });
  return (
    <LargeWidgetWrapper containerClassName="border-warning/40 bg-warning/5">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <History className="size-4 shrink-0 text-warning" />
        <span>
          {t(
            'You are viewing the snapshot of {version}. It is read only; to change it, create a copy from this version.',
            { version: label },
          )}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {checkAccess(Permission.WRITE_WORKFLOW) && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            loading={isPending}
            onClick={() => copy()}
          >
            <CopyPlus className="size-3.5" />
            {t('Create a copy from this version')}
          </Button>
        )}
        <Button
          size="sm"
          className="gap-1"
          onClick={() =>
            navigate(
              authenticationSession.appendProjectRoutePrefix(
                `/workflows/${workflow.id}`,
              ),
            )
          }
        >
          <ArrowLeft className="size-3.5" />
          {t('Back to current version')}
        </Button>
      </div>
    </LargeWidgetWrapper>
  );
}
