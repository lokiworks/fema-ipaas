import { DefaultProjectRole, ProjectDirectoryItem } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

function list(): Promise<ProjectDirectoryItem[]> {
  return api.get<ProjectDirectoryItem[]>('/v1/projects/directory');
}

function canEdit(item: Pick<ProjectDirectoryItem, 'myRole'>): boolean {
  return (
    item.myRole === DefaultProjectRole.ADMIN ||
    item.myRole === DefaultProjectRole.DEVELOPER
  );
}

function isFull(
  item: Pick<ProjectDirectoryItem, 'workflowsLimit' | 'workflowCount'>,
): boolean {
  const limit = item.workflowsLimit ?? null;
  return limit !== null && item.workflowCount >= limit;
}

function isMember(item: Pick<ProjectDirectoryItem, 'myRole'>): boolean {
  return Boolean(item.myRole);
}

export const projectDirectoryUtils = {
  canEdit,
  isFull,
  isMember,
  canCreateWorkflow: (item: ProjectDirectoryItem) =>
    canEdit(item) && !isFull(item),
};

export const projectDirectoryHooks = {
  useDirectory: ({ primary = false }: { primary?: boolean } = {}) =>
    useQuery({
      queryKey: PROJECT_DIRECTORY_QUERY_KEY,
      queryFn: list,
      meta: primary
        ? { showErrorDialog: true, loadSubsetOptions: {} }
        : undefined,
    }),
};

export const PROJECT_DIRECTORY_QUERY_KEY = ['project-directory'];
