import { describe, expect, it } from 'vitest';

import { mcpServerAccessUtils } from '@/features/mcp-servers/utils/mcp-server-access-utils';

describe('mcpServerAccessUtils', () => {
  it('allows adding a server for a tenant admin with no editable projects', () => {
    expect(
      mcpServerAccessUtils.addServerDisabledReason({
        isTenantAdmin: true,
        editableProjectCount: 0,
      }),
    ).toBeNull();
  });

  it('allows adding a server for a non-admin with an editable project', () => {
    expect(
      mcpServerAccessUtils.addServerDisabledReason({
        isTenantAdmin: false,
        editableProjectCount: 1,
      }),
    ).toBeNull();
  });

  it('blocks adding a server otherwise, with a reason', () => {
    const reason = mcpServerAccessUtils.addServerDisabledReason({
      isTenantAdmin: false,
      editableProjectCount: 0,
    });
    expect(reason).not.toBeNull();
    expect(reason?.length).toBeGreaterThan(0);
  });

  it('is available in a project scoped to all projects', () => {
    expect(
      mcpServerAccessUtils.isAvailableInProject({
        server: { allProjects: true, projectIds: [] },
        projectId: 'proj-1',
      }),
    ).toBe(true);
  });

  it('is available in a project explicitly listed', () => {
    expect(
      mcpServerAccessUtils.isAvailableInProject({
        server: { allProjects: false, projectIds: ['proj-1'] },
        projectId: 'proj-1',
      }),
    ).toBe(true);
    expect(
      mcpServerAccessUtils.isAvailableInProject({
        server: { allProjects: false, projectIds: ['proj-2'] },
        projectId: 'proj-1',
      }),
    ).toBe(false);
  });

  it('describes scope text for all projects', () => {
    expect(
      mcpServerAccessUtils.scopeText({
        server: { allProjects: true, projects: [] },
      }),
    ).toBe('All projects');
  });

  it('describes scope text for a single project by name', () => {
    expect(
      mcpServerAccessUtils.scopeText({
        server: {
          allProjects: false,
          projects: [{ id: 'proj-1', displayName: 'Marketing' }],
        },
      }),
    ).toBe('Marketing');
  });

  it('describes scope text for multiple projects by count', () => {
    expect(
      mcpServerAccessUtils.scopeText({
        server: {
          allProjects: false,
          projects: [
            { id: 'proj-1', displayName: 'Marketing' },
            { id: 'proj-2', displayName: 'Sales' },
          ],
        },
      }),
    ).toContain('2');
  });
});
