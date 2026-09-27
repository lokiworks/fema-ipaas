import { Permission } from '@fema-ipaas/core-utils';
import { EnvironmentWorkflow, ProjectWithLimits } from '@fema-ipaas/shared';

import {
  projectDirectoryHooks,
  projectDirectoryUtils,
} from '@/features/projects/api/project-directory-api';
import { releasesHooks } from '@/features/releases/hooks/releases-hooks';
import { useAuthorization, useProjectRole } from '@/hooks/authorization-hooks';

import { projectWorkspaceHooks } from './project-workspace-hooks';

export function useWorkspaceContext(project: ProjectWithLimits) {
  const { checkAccess } = useAuthorization();
  const { data: myRole } = useProjectRole();
  const tree = projectWorkspaceHooks.useTree(project.id);
  const { data: directory } = projectDirectoryHooks.useDirectory();
  const environments = releasesHooks.useEnvironments({
    projectId: project.id,
    enabled: project.releasesEnabled,
    showErrorDialog: false,
  });
  const environmentByWorkflow = new Map<string, EnvironmentWorkflow>(
    (environments.data?.workflows ?? []).map((item) => [item.workflowId, item]),
  );
  const workflows = tree.data?.workflows ?? [];
  const directoryItem = (directory ?? []).find(
    (item) => item.id === project.id,
  );
  const workflowsLimit =
    directoryItem?.workflowsLimit ?? project.workflowsLimit ?? null;
  const limitReached =
    workflowsLimit !== null && workflows.length >= workflowsLimit;
  return {
    project,
    projectId: project.id,
    role: myRole?.role ?? null,
    releasesEnabled: project.releasesEnabled,
    tree,
    folders: tree.data?.folders ?? [],
    workflows,
    workflowNames: workflows.map((workflow) => workflow.displayName),
    environments: environments.data ?? null,
    environmentByWorkflow,
    limitReached,
    workflowsLimit,
    directoryItem,
    hasEditableProject: (directory ?? []).some((item) =>
      projectDirectoryUtils.canCreateWorkflow(item),
    ),
    permissions: {
      canEdit: checkAccess(Permission.WRITE_WORKFLOW),
      canPublish: checkAccess(Permission.PUBLISH_WORKFLOW),
      canToggle: checkAccess(Permission.UPDATE_WORKFLOW_STATUS),
      canDelete: checkAccess(Permission.DELETE_WORKFLOW),
      canWriteFolders: checkAccess(Permission.WRITE_FOLDER),
      canPromote: checkAccess(Permission.WRITE_PROJECT_RELEASE),
      isOwner: checkAccess(Permission.WRITE_PROJECT),
      canReadRuns: checkAccess(Permission.READ_RUN),
    },
  };
}

export type WorkspaceContext = ReturnType<typeof useWorkspaceContext>;
