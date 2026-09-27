import { McpServer } from '@fema-ipaas/shared';
import { t } from 'i18next';

function addServerDisabledReason({
  isTenantAdmin,
  editableProjectCount,
}: {
  isTenantAdmin: boolean;
  editableProjectCount: number;
}): string | null {
  if (isTenantAdmin || editableProjectCount > 0) {
    return null;
  }
  return t(
    'You need to be a tenant admin, or be able to edit at least one project',
  );
}

function isAvailableInProject({
  server,
  projectId,
}: {
  server: Pick<McpServer, 'allProjects' | 'projectIds'>;
  projectId: string;
}): boolean {
  return server.allProjects || server.projectIds.includes(projectId);
}

function scopeText({
  server,
}: {
  server: Pick<McpServer, 'allProjects' | 'projects'>;
}): string {
  if (server.allProjects) {
    return t('All projects');
  }
  if (server.projects.length === 1) {
    return server.projects[0].displayName;
  }
  return t('{count} projects', { count: server.projects.length });
}

export const mcpServerAccessUtils = {
  addServerDisabledReason,
  isAvailableInProject,
  scopeText,
};
