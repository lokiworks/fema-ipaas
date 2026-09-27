import { connectionAccessUtils, ConnectionPermission } from '@fema-ipaas/shared';

type PrimaryConnectionAction = 'reconnect' | 'edit' | 'view';

function getPrimaryAction({
  myPermission,
  isActive,
}: {
  myPermission: ConnectionPermission;
  isActive: boolean;
}): PrimaryConnectionAction {
  if (!connectionAccessUtils.canManage(myPermission)) {
    return 'view';
  }
  return isActive ? 'edit' : 'reconnect';
}

function getScopeDisplay({
  allProjects,
  projects,
}: {
  allProjects: boolean;
  projects: { id: string; displayName: string }[];
}): {
  allProjects: boolean;
  first: { id: string; displayName: string } | null;
  remainder: { id: string; displayName: string }[];
} {
  if (allProjects) {
    return { allProjects: true, first: null, remainder: [] };
  }
  const [first, ...remainder] = projects;
  return { allProjects: false, first: first ?? null, remainder };
}

function buildDeleteConsequences({
  workflows,
  hiddenWorkflowCount,
  mcpServiceCount,
  projectConfigCount,
  shareCount,
}: {
  workflows: { displayName: string }[];
  hiddenWorkflowCount: number;
  mcpServiceCount: number;
  projectConfigCount: number;
  shareCount: number;
}): {
  workflowCount: number;
  workflowSampleNames: string[];
  hasMoreWorkflows: boolean;
  mcpServiceCount: number;
  projectConfigCount: number;
  shareCount: number;
} {
  const workflowSampleNames = workflows.slice(0, 3).map((workflow) => workflow.displayName);
  const workflowCount = workflows.length + hiddenWorkflowCount;
  return {
    workflowCount,
    workflowSampleNames,
    hasMoreWorkflows: workflowCount > workflowSampleNames.length,
    mcpServiceCount,
    projectConfigCount,
    shareCount,
  };
}

export const connectionAccessUiUtils = {
  getPrimaryAction,
  getScopeDisplay,
  buildDeleteConsequences,
};
