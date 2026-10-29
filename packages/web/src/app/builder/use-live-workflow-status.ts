import { WorkflowStatus } from '@fema-ipaas/shared';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { projectWorkspaceHooks } from '@/features/project-workspace/hooks/project-workspace-hooks';
import { authenticationSession } from '@/lib/authentication-session';

export function useLiveWorkflowStatus(): WorkflowStatus {
  const workflow = useBuilderStateContext((state) => state.workflow);
  const accessibleProjectId =
    workflow.projectId === authenticationSession.getProjectId()
      ? workflow.projectId
      : null;
  const { data: tree } = projectWorkspaceHooks.useTree(accessibleProjectId);
  return (
    tree?.workflows.find((row) => row.id === workflow.id)?.status ??
    workflow.status
  );
}
