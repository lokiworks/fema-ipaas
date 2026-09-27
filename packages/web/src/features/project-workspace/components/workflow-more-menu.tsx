import {
  ProjectTreeWorkflow,
  WorkflowOperationType,
  WorkflowStatus,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  CirclePause,
  CirclePlay,
  CloudUpload,
  CopyPlus,
  Download,
  FolderInput,
  Info,
  LayoutTemplate,
  Rocket,
  ScrollText,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { releaseUiUtils } from '@/features/releases';
import { ReleaseRequestDialog } from '@/features/releases/components/release-request-dialog';
import { GenerateTemplateDialog } from '@/features/templates/components/generate-template-dialog';

import { projectWorkspaceApi } from '../api/project-workspace-api';
import { projectWorkspaceHooks } from '../hooks/project-workspace-hooks';
import { WorkspaceContext } from '../hooks/use-workspace-context';
import { workspaceUtils } from '../lib/workspace-utils';

import { ActionMenu, ActionMenuEntry } from './action-menu';
import { BatchPublishDialog } from './batch-publish-dialog';
import { TypeToConfirmDialog } from './type-to-confirm-dialog';
import {
  CopyWorkflowDialog,
  MoveWorkflowsDialog,
  WorkflowInfoDialog,
} from './workflow-dialogs';

export function WorkflowMoreMenu({
  workflow,
  context,
  triggerClassName,
}: {
  workflow: ProjectTreeWorkflow;
  context: WorkspaceContext;
  triggerClassName?: string;
}) {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const { mutate: update, isPending: isUpdating } =
    projectWorkspaceHooks.useUpdateWorkflow();
  const { mutate: removeMany, isPending: isDeleting } =
    projectWorkspaceHooks.useDeleteWorkflows();
  const { permissions, releasesEnabled, projectId, folders } = context;
  const environment = context.environmentByWorkflow.get(workflow.id);
  const close = () => setDialog(null);

  const promoteBlocker = releasesEnabled
    ? releaseUiUtils.promotionBlocker({
        testVersionId: environment?.testVersionId,
        productionVersionId: environment?.productionVersionId,
        pendingReleaseId: environment?.pendingReleaseId,
      })
    : null;

  const exportWorkflow = async () => {
    const file = await projectWorkspaceApi
      .exportWorkflow(workflow.id)
      .catch(() => null);
    if (file === null) {
      toast.error(t('Something went wrong'));
      return;
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = workspaceUtils.exportFileName(workflow.displayName);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success(
      t('Exported {file}', {
        file: workspaceUtils.exportFileName(workflow.displayName),
      }),
    );
  };

  const startWorkflow = () =>
    update(
      {
        workflowId: workflow.id,
        request: {
          type: WorkflowOperationType.CHANGE_STATUS,
          request: { status: WorkflowStatus.ENABLED },
        },
      },
      {
        onSuccess: () =>
          toast.success(
            releasesEnabled
              ? t('Production is running again')
              : t('Workflow started'),
          ),
      },
    );

  const stopWorkflow = () =>
    update(
      {
        workflowId: workflow.id,
        request: {
          type: WorkflowOperationType.CHANGE_STATUS,
          request: { status: WorkflowStatus.DISABLED },
        },
      },
      {
        onSuccess: () => {
          toast.success(
            releasesEnabled
              ? t('Production stopped')
              : t('Workflow stopped'),
          );
          close();
        },
      },
    );

  const logsItem: ActionMenuEntry = {
    key: 'logs',
    label: t('View logs'),
    icon: ScrollText,
    disabledReason: permissions.canReadRuns ? null : t('No access'),
    onSelect: () =>
      navigate(`/projects/${projectId}/runs?workflowId=${workflow.id}`),
  };
  const infoItem: ActionMenuEntry = {
    key: 'info',
    label: t('Basic info'),
    icon: Info,
    onSelect: () => setDialog('info'),
  };
  const exportItem: ActionMenuEntry = {
    key: 'export',
    label: t('Export'),
    icon: Download,
    onSelect: () => void exportWorkflow(),
  };

  const startReason = workflow.published
    ? null
    : releasesEnabled
    ? t('Not promoted to production yet')
    : t('The workflow has no published version yet, so it cannot start');

  const items: ActionMenuEntry[] = permissions.canEdit
    ? [
        {
          key: 'publish',
          label: releasesEnabled ? t('Publish to test') : t('Publish'),
          icon: CloudUpload,
          disabledReason: permissions.canPublish ? null : t('No access'),
          onSelect: () => setDialog('publish'),
        },
        ...(releasesEnabled
          ? [
              {
                key: 'promote',
                label: t('Promote to production'),
                icon: Rocket,
                disabledReason: promoteBlocker
                  ? releaseUiUtils.promotionBlockerText(promoteBlocker)
                  : permissions.canPromote
                  ? null
                  : t('No access'),
                onSelect: () => setDialog('promote'),
              },
            ]
          : []),
        workflow.status === WorkflowStatus.ENABLED
          ? {
              key: 'stop',
              label: releasesEnabled
                ? t('Stop production')
                : t('Stop workflow'),
              icon: CirclePause,
              disabledReason: permissions.canToggle ? null : t('No access'),
              onSelect: () => setDialog('stop'),
            }
          : {
              key: 'start',
              label: releasesEnabled
                ? t('Start production')
                : t('Start workflow'),
              icon: CirclePlay,
              disabledReason:
                startReason ?? (permissions.canToggle ? null : t('No access')),
              onSelect: startWorkflow,
            },
        infoItem,
        logsItem,
        'divider',
        {
          key: 'copy',
          label: t('Create copy'),
          icon: CopyPlus,
          disabledReason: context.limitReached
            ? t('The project has reached its workflow limit')
            : null,
          onSelect: () => setDialog('copy'),
        },
        {
          key: 'move',
          label: t('Move to folder'),
          icon: FolderInput,
          disabledReason:
            folders.length === 0 ? t('The project has no folders yet') : null,
          onSelect: () => setDialog('move'),
        },
        exportItem,
        {
          key: 'template',
          label: t('Generate template'),
          icon: LayoutTemplate,
          disabledReason: workflow.published
            ? null
            : t('Available after the workflow is published'),
          onSelect: () => setDialog('template'),
        },
        'divider',
        {
          key: 'delete',
          label: t('Delete'),
          icon: Trash2,
          destructive: true,
          disabledReason: permissions.canDelete ? null : t('No access'),
          onSelect: () => setDialog('delete'),
        },
      ]
    : [
        infoItem,
        logsItem,
        {
          key: 'copy',
          label: t('Create copy'),
          icon: CopyPlus,
          description: context.hasEditableProject
            ? t('Copy to a project you can edit')
            : undefined,
          disabledReason: context.hasEditableProject
            ? null
            : t('You have no project you can edit'),
          onSelect: () => setDialog('copy'),
        },
        exportItem,
      ];

  return (
    <>
      <ActionMenu
        items={items}
        label={t('More actions')}
        triggerClassName={triggerClassName}
      />
      {dialog === 'info' && (
        <WorkflowInfoDialog
          open
          onOpenChange={(open) => !open && close()}
          workflow={workflow}
          siblingNames={context.workflowNames.filter(
            (name) => name !== workflow.displayName,
          )}
          canEdit={permissions.canEdit}
        />
      )}
      {dialog === 'publish' && (
        <BatchPublishDialog
          open
          onOpenChange={(open) => !open && close()}
          projectId={projectId}
          workflowIds={[workflow.id]}
        />
      )}
      {dialog === 'promote' && (
        <ReleaseRequestDialog
          open
          onOpenChange={(open) => !open && close()}
          workflowId={workflow.id}
        />
      )}
      {dialog === 'copy' && (
        <CopyWorkflowDialog
          open
          onOpenChange={(open) => !open && close()}
          projectId={projectId}
          workflow={workflow}
        />
      )}
      {dialog === 'move' && (
        <MoveWorkflowsDialog
          open
          onOpenChange={(open) => !open && close()}
          projectId={projectId}
          workflowIds={[workflow.id]}
          folders={folders}
          currentFolderId={workflow.folderId ?? null}
        />
      )}
      {dialog === 'template' && (
        <GenerateTemplateDialog
          open
          onOpenChange={(open) => !open && close()}
          workflowId={workflow.id}
          projectId={projectId}
          workflowName={workflow.displayName}
        />
      )}
      {dialog === 'stop' && (
        <TypeToConfirmDialog
          open
          onOpenChange={(open) => !open && close()}
          title={
            releasesEnabled
              ? t('Stop running in production?')
              : t('Stop this workflow?')
          }
          description={
            releasesEnabled
              ? t(
                  'Production stops handling new events. The test environment is not affected.',
                )
              : t(
                  'The workflow stops handling new events. Runs already in progress finish.',
                )
          }
          actionLabel={t('Stop')}
          isPending={isUpdating}
          onConfirm={stopWorkflow}
        />
      )}
      {dialog === 'delete' && (
        <TypeToConfirmDialog
          open
          onOpenChange={(open) => !open && close()}
          title={t('Delete workflow {name}?', { name: workflow.displayName })}
          description={
            releasesEnabled
              ? t(
                  'This cannot be undone. Pending promotion requests of this workflow are withdrawn automatically.',
                )
              : t('This cannot be undone.')
          }
          confirmText={workflow.displayName}
          actionLabel={t('Delete')}
          isPending={isDeleting}
          onConfirm={() =>
            removeMany(
              { projectId, workflowIds: [workflow.id] },
              {
                onSuccess: () => {
                  toast.success(t('Deleted'));
                  close();
                },
              },
            )
          }
        />
      )}
    </>
  );
}

type DialogKind =
  | 'info'
  | 'publish'
  | 'promote'
  | 'copy'
  | 'move'
  | 'template'
  | 'stop'
  | 'delete';
