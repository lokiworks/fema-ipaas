import { ConnectionPermission } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { connectionAccessUiUtils } from '@/features/connections/utils/connection-access-utils';

describe('connectionAccessUiUtils.getPrimaryAction', () => {
  it('returns view for a member with USE permission', () => {
    expect(
      connectionAccessUiUtils.getPrimaryAction({
        myPermission: ConnectionPermission.USE,
        isActive: true,
      }),
    ).toBe('view');
  });

  it('returns edit for a manager when the connection is active', () => {
    expect(
      connectionAccessUiUtils.getPrimaryAction({
        myPermission: ConnectionPermission.OWNER,
        isActive: true,
      }),
    ).toBe('edit');
    expect(
      connectionAccessUiUtils.getPrimaryAction({
        myPermission: ConnectionPermission.EDIT,
        isActive: true,
      }),
    ).toBe('edit');
  });

  it('returns reconnect for a manager when the connection is not active', () => {
    expect(
      connectionAccessUiUtils.getPrimaryAction({
        myPermission: ConnectionPermission.OWNER,
        isActive: false,
      }),
    ).toBe('reconnect');
  });
});

describe('connectionAccessUiUtils.getScopeDisplay', () => {
  it('marks all-projects scope with no project list', () => {
    expect(
      connectionAccessUiUtils.getScopeDisplay({
        allProjects: true,
        projects: [{ id: 'p1', displayName: 'Project 1' }],
      }),
    ).toEqual({ allProjects: true, first: null, remainder: [] });
  });

  it('splits the first project from the remainder for project scope', () => {
    const projects = [
      { id: 'p1', displayName: 'Project 1' },
      { id: 'p2', displayName: 'Project 2' },
      { id: 'p3', displayName: 'Project 3' },
    ];
    expect(
      connectionAccessUiUtils.getScopeDisplay({ allProjects: false, projects }),
    ).toEqual({
      allProjects: false,
      first: projects[0],
      remainder: [projects[1], projects[2]],
    });
  });

  it('returns a null first project when the scope has no projects', () => {
    expect(
      connectionAccessUiUtils.getScopeDisplay({ allProjects: false, projects: [] }),
    ).toEqual({ allProjects: false, first: null, remainder: [] });
  });
});

describe('connectionAccessUiUtils.buildDeleteConsequences', () => {
  it('counts hidden workflows in the total and caps the sample at three names', () => {
    const workflows = [
      { displayName: 'a' },
      { displayName: 'b' },
      { displayName: 'c' },
      { displayName: 'd' },
    ];
    const result = connectionAccessUiUtils.buildDeleteConsequences({
      workflows,
      hiddenWorkflowCount: 2,
      mcpServiceCount: 1,
      projectConfigCount: 0,
      shareCount: 3,
    });
    expect(result).toEqual({
      workflowCount: 6,
      workflowSampleNames: ['a', 'b', 'c'],
      hasMoreWorkflows: true,
      mcpServiceCount: 1,
      projectConfigCount: 0,
      shareCount: 3,
    });
  });

  it('reports no extra workflows when the sample covers every reference', () => {
    const result = connectionAccessUiUtils.buildDeleteConsequences({
      workflows: [{ displayName: 'a' }],
      hiddenWorkflowCount: 0,
      mcpServiceCount: 0,
      projectConfigCount: 0,
      shareCount: 0,
    });
    expect(result.workflowCount).toBe(1);
    expect(result.hasMoreWorkflows).toBe(false);
  });
});
