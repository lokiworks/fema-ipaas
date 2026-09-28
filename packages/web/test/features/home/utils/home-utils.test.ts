import {
  ColorName,
  DefaultProjectRole,
  ExecutionStatus,
  ProjectDirectoryItem,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { homeUtils } from '@/features/home/utils/home-utils';

describe('homeUtils.greetingKey', () => {
  it('maps hours to the five greetings', () => {
    expect(homeUtils.greetingKey(0)).toBe('It is late at night');
    expect(homeUtils.greetingKey(5)).toBe('It is late at night');
    expect(homeUtils.greetingKey(6)).toBe('Good morning');
    expect(homeUtils.greetingKey(10)).toBe('Good morning');
    expect(homeUtils.greetingKey(11)).toBe('Good noon');
    expect(homeUtils.greetingKey(12)).toBe('Good noon');
    expect(homeUtils.greetingKey(13)).toBe('Good afternoon');
    expect(homeUtils.greetingKey(17)).toBe('Good afternoon');
    expect(homeUtils.greetingKey(18)).toBe('Good evening');
    expect(homeUtils.greetingKey(23)).toBe('Good evening');
  });
});

describe('homeUtils.localMidnight', () => {
  it('returns the start of the local day', () => {
    const midnight = homeUtils.localMidnight(new Date(2026, 8, 27, 15, 42));
    expect(midnight.getFullYear()).toBe(2026);
    expect(midnight.getMonth()).toBe(8);
    expect(midnight.getDate()).toBe(27);
    expect(midnight.getHours()).toBe(0);
    expect(midnight.getMinutes()).toBe(0);
  });
});

describe('homeUtils.successRate', () => {
  it('divides succeeded by finished runs', () => {
    expect(homeUtils.successRate({ succeeded: 9, finished: 12 })).toBe(0.75);
  });

  it('is null when nothing finished', () => {
    expect(homeUtils.successRate({ succeeded: 0, finished: 0 })).toBeNull();
  });

  it('formats as a percentage with one decimal', () => {
    expect(homeUtils.formatRate(0.75)).toBe('75%');
    expect(homeUtils.formatRate(2 / 3)).toBe('66.7%');
    expect(homeUtils.formatRate(null)).toBe('-');
  });
});

describe('homeUtils.visibleHourly', () => {
  const hourly = Array.from({ length: 24 }, (_, hour) => hour);

  it('shows buckets up to the current hour', () => {
    const since = new Date(2026, 8, 27, 0, 0);
    const now = new Date(2026, 8, 27, 9, 30);
    expect(homeUtils.visibleHourly({ hourly, since, now })).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('shows at least two buckets right after midnight', () => {
    const since = new Date(2026, 8, 27, 0, 0);
    const now = new Date(2026, 8, 27, 0, 5);
    expect(homeUtils.visibleHourly({ hourly, since, now })).toEqual([0, 1]);
  });

  it('never shows more than 24 buckets', () => {
    const since = new Date(2026, 8, 27, 0, 0);
    const now = new Date(2026, 8, 28, 3, 0);
    expect(homeUtils.visibleHourly({ hourly, since, now })).toHaveLength(24);
  });
});

describe('homeUtils.visibleRecentVisits', () => {
  const visit = (id: string, projectId: string, visitedAt: number) => ({
    type: 'workflow' as const,
    id,
    projectId,
    name: id,
    visitedAt,
  });

  it('drops visits from projects the user left, newest first, capped', () => {
    const result = homeUtils.visibleRecentVisits({
      visits: [
        visit('a', 'p1', 1),
        visit('b', 'gone', 5),
        visit('c', 'p2', 3),
        visit('d', 'p1', 4),
      ],
      memberProjectIds: ['p1', 'p2'],
      limit: 2,
    });
    expect(result.map((item) => item.id)).toEqual(['d', 'c']);
  });
});

describe('homeUtils links', () => {
  it('links data stores to the project data store page', () => {
    expect(
      homeUtils.recentVisitHref({
        type: 'dataStore',
        id: 'ds1',
        projectId: 'p1',
      }),
    ).toBe('/projects/p1/data-stores?id=ds1');
    expect(
      homeUtils.recentVisitHref({
        type: 'workflow',
        id: 'w1',
        projectId: 'p1',
      }),
    ).toBe('/projects/p1/workflows/w1');
  });

  it('builds runs links the runs page understands', () => {
    const since = '2026-09-26T16:00:00.000Z';
    const all = new URL(
      homeUtils.runsHref({ projectId: 'p1', since, failedOnly: false }),
      'http://x',
    );
    expect(all.pathname).toBe('/projects/p1/runs');
    expect(all.searchParams.get('createdAfter')).toBe(since);
    expect(all.searchParams.getAll('status')).toEqual([]);
    const failed = new URL(
      homeUtils.runsHref({ projectId: 'p1', since, failedOnly: true }),
      'http://x',
    );
    expect(failed.searchParams.getAll('status')).toContain(
      ExecutionStatus.TIMEOUT,
    );
    expect(failed.searchParams.getAll('status')).toContain(
      ExecutionStatus.FAILED,
    );
  });
});

describe('homeUtils.roleLabelKey', () => {
  it('uses the project role names', () => {
    expect(homeUtils.roleLabelKey(DefaultProjectRole.ADMIN)).toBe('Owner');
    expect(homeUtils.roleLabelKey(DefaultProjectRole.DEVELOPER)).toBe(
      'Can edit',
    );
    expect(homeUtils.roleLabelKey(DefaultProjectRole.OPERATOR)).toBe('On call');
    expect(homeUtils.roleLabelKey(DefaultProjectRole.VIEWER)).toBe('Can view');
  });
});

describe('homeUtils.pickTargetProject', () => {
  const project = (id: string): ProjectDirectoryItem => ({
    id,
    displayName: id,
    description: null,
    icon: { color: ColorName.RED },
    ownerId: 'o',
    ownerName: null,
    created: '',
    updated: '',
    myRole: DefaultProjectRole.DEVELOPER,
    workflowCount: 0,
    runningCount: 0,
    memberCount: 1,
    workflowsLimit: null,
    monthlyRunsLimit: null,
    releasesEnabled: false,
  });

  it('prefers the current project when it can take workflows', () => {
    const projects = [project('a'), project('b')];
    expect(
      homeUtils.pickTargetProject({
        projects,
        currentProjectId: 'b',
        canCreate: () => true,
      })?.id,
    ).toBe('b');
    expect(
      homeUtils.pickTargetProject({
        projects,
        currentProjectId: 'b',
        canCreate: (item) => item.id === 'a',
      })?.id,
    ).toBe('a');
    expect(
      homeUtils.pickTargetProject({
        projects,
        currentProjectId: null,
        canCreate: () => false,
      }),
    ).toBeNull();
  });
});

describe('homeUtils.nextBatch', () => {
  it('rotates through templates four at a time', () => {
    expect(homeUtils.nextBatch({ total: 6, batch: 0, size: 4 })).toEqual([
      0, 1, 2, 3,
    ]);
    expect(homeUtils.nextBatch({ total: 6, batch: 1, size: 4 })).toEqual([
      4, 5, 0, 1,
    ]);
    expect(homeUtils.nextBatch({ total: 3, batch: 0, size: 4 })).toEqual([
      0, 1, 2,
    ]);
    expect(homeUtils.nextBatch({ total: 0, batch: 0, size: 4 })).toEqual([]);
  });
});
