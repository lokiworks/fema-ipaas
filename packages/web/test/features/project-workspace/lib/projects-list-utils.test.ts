import {
  ColorName,
  DefaultProjectRole,
  ProjectDirectoryItem,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { projectsListUtils } from '@/features/project-workspace/lib/projects-list-utils';
import { runsLinks } from '@/features/project-workspace/lib/runs-links';

function item(
  id: string,
  myRole: DefaultProjectRole | null,
  description: string | null,
): ProjectDirectoryItem {
  return {
    id,
    displayName: `Project ${id}`,
    description,
    icon: { color: ColorName.BLUE },
    ownerId: 'o',
    ownerName: 'Owner',
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    myRole,
    workflowCount: 0,
    runningCount: 0,
    memberCount: 1,
    workflowsLimit: null,
    monthlyRunsLimit: null,
    releasesEnabled: false,
  };
}

const items = [
  item('a', DefaultProjectRole.ADMIN, 'HR onboarding'),
  item('b', null, 'Finance'),
];

describe('projectsListUtils.filter', () => {
  it('shows only member projects on the mine tab', () => {
    expect(
      projectsListUtils
        .filter({ items, tab: 'mine', query: '' })
        .map((p) => p.id),
    ).toEqual(['a']);
    expect(
      projectsListUtils
        .filter({ items, tab: 'all', query: '' })
        .map((p) => p.id),
    ).toEqual(['a', 'b']);
  });

  it('searches names and descriptions', () => {
    expect(
      projectsListUtils
        .filter({ items, tab: 'all', query: 'finance' })
        .map((p) => p.id),
    ).toEqual(['b']);
  });
});

describe('runsLinks.forProject', () => {
  it('builds the runs page link with filters', () => {
    const link = runsLinks.forProject({
      projectId: 'p1',
      createdAfter: '2026-01-01T00:00:00.000Z',
      failedOnly: true,
    });
    expect(link.startsWith('/projects/p1/runs?')).toBe(true);
    expect(link).toContain('status=FAILED');
    expect(link).toContain('status=TIMEOUT');
    expect(link).toContain('createdAfter=');
  });

  it('omits the query string without filters', () => {
    expect(runsLinks.forProject({ projectId: 'p1' })).toBe('/projects/p1/runs');
  });
});
