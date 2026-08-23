// @vitest-environment jsdom
import { ConnectorsFilterType, WorkspaceType } from '@fema-ipaas/shared';
import type { WorkspaceWithLimits } from '@fema-ipaas/shared';
import {
  and,
  createCollection,
  createLiveQueryCollection,
  eq,
  like,
  localOnlyCollectionOptions,
  or,
} from '@tanstack/react-db';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/authentication-session', () => ({
  authenticationSession: {
    switchToWorkspace: vi.fn(),
    getCurrentUserId: vi.fn().mockReturnValue('userCurrent'),
    getWorkspaceId: vi.fn().mockReturnValue('proj1'),
  },
}));

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock('@tanstack/query-db-collection', () => ({
  queryCollectionOptions: vi.fn().mockReturnValue({
    getKey: (item: WorkspaceWithLimits) => item.id,
    sync: { sync: () => () => {}, getSyncMetadata: () => ({}) },
    startSync: false,
    gcTime: 0,
  }),
}));

const CURRENT_USER_ID = 'userCurrent';
const OTHER_USER_ID = 'userOther';

function makeWorkspace(
  id: string,
  type: WorkspaceType,
  ownerId: string,
  displayName = `Workspace ${id}`,
): WorkspaceWithLimits {
  return {
    id,
    created: '2024-01-01T00:00:00.000Z',
    updated: '2024-01-01T00:00:00.000Z',
    type,
    ownerId,
    displayName,
    tenantId: 'tenant1',
    maxConcurrentJobs: null,
    icon: { color: 'BLUE' as never },
    externalId: null,
    releasesEnabled: false,
    notifyWorkflowOwnerOnFailure: false,
    metadata: null,
    plan: {
      id: `plan${id}`,
      created: '2024-01-01T00:00:00.000Z',
      updated: '2024-01-01T00:00:00.000Z',
      workspaceId: id,
      locked: false,
      name: 'default',
      connectorsFilterType: ConnectorsFilterType.NONE,
      connectors: [],
    },
    analytics: {
      totalUsers: 0,
      activeUsers: 0,
      totalWorkflows: 0,
      activeWorkflows: 0,
    },
  };
}

function makeSource(workspaces: WorkspaceWithLimits[]) {
  return createCollection(
    localOnlyCollectionOptions({
      getKey: (item: WorkspaceWithLimits) => item.id,
      initialData: workspaces,
    }),
  );
}

function idsFrom(
  collection: ReturnType<typeof createLiveQueryCollection>,
): string[] {
  return ([...collection.values()] as WorkspaceWithLimits[]).map((p) => p.id);
}

describe('getWorkspaceName', () => {
  let getWorkspaceName: (p: WorkspaceWithLimits) => string;

  beforeEach(async () => {
    ({ getWorkspaceName } = await import('./workspace-collection'));
  });

  it('returns "Personal Workspace" for a PERSONAL type workspace', () => {
    const workspace = makeWorkspace(
      'p1',
      WorkspaceType.PERSONAL,
      CURRENT_USER_ID,
    );
    expect(getWorkspaceName(workspace)).toBe('Personal Workspace');
  });

  it('returns the displayName for a TEAM type workspace', () => {
    const workspace = makeWorkspace(
      't1',
      WorkspaceType.TEAM,
      CURRENT_USER_ID,
      'Marketing',
    );
    expect(getWorkspaceName(workspace)).toBe('Marketing');
  });

  it('ignores displayName for PERSONAL workspaces', () => {
    const workspace = makeWorkspace(
      'p2',
      WorkspaceType.PERSONAL,
      CURRENT_USER_ID,
      'ShouldBeIgnored',
    );
    expect(getWorkspaceName(workspace)).toBe('Personal Workspace');
  });
});

describe('useAll filter', () => {
  function query(workspaces: WorkspaceWithLimits[], userId: string | null) {
    const source = makeSource(workspaces);
    return idsFrom(
      createLiveQueryCollection({
        query: (q) =>
          q
            .from({ workspace: source })
            .where(({ workspace }) =>
              or(
                eq(workspace.type, WorkspaceType.TEAM),
                and(
                  eq(workspace.type, WorkspaceType.PERSONAL),
                  eq(workspace.ownerId, userId),
                ),
              ),
            )
            .select(({ workspace }) => ({ ...workspace })),
        startSync: true,
      }),
    );
  }

  it('includes a TEAM workspace owned by the current user', () => {
    expect(
      query(
        [makeWorkspace('t1', WorkspaceType.TEAM, CURRENT_USER_ID)],
        CURRENT_USER_ID,
      ),
    ).toContain('t1');
  });

  it('includes a TEAM workspace owned by another user', () => {
    expect(
      query(
        [makeWorkspace('t1', WorkspaceType.TEAM, OTHER_USER_ID)],
        CURRENT_USER_ID,
      ),
    ).toContain('t1');
  });

  it("includes the current user's PERSONAL workspace", () => {
    expect(
      query(
        [makeWorkspace('pMine', WorkspaceType.PERSONAL, CURRENT_USER_ID)],
        CURRENT_USER_ID,
      ),
    ).toContain('pMine');
  });

  it("excludes another user's PERSONAL workspace", () => {
    expect(
      query(
        [makeWorkspace('pOther', WorkspaceType.PERSONAL, OTHER_USER_ID)],
        CURRENT_USER_ID,
      ),
    ).not.toContain('pOther');
  });

  it('excludes all PERSONAL workspaces from other users', () => {
    expect(
      query(
        [
          makeWorkspace('p1', WorkspaceType.PERSONAL, OTHER_USER_ID),
          makeWorkspace('p2', WorkspaceType.PERSONAL, 'userThird'),
        ],
        CURRENT_USER_ID,
      ),
    ).toHaveLength(0);
  });

  it('shows TEAM workspaces and only own PERSONAL from a full tenant collection', () => {
    const workspaces = [
      makeWorkspace('teamA', WorkspaceType.TEAM, 'tenantOwner'),
      makeWorkspace('teamB', WorkspaceType.TEAM, 'tenantOwner'),
      makeWorkspace('personalMine', WorkspaceType.PERSONAL, CURRENT_USER_ID),
      makeWorkspace('personalOther1', WorkspaceType.PERSONAL, OTHER_USER_ID),
      makeWorkspace('personalOther2', WorkspaceType.PERSONAL, 'userThird'),
    ];

    const ids = query(workspaces, CURRENT_USER_ID);

    expect(ids).toContain('teamA');
    expect(ids).toContain('teamB');
    expect(ids).toContain('personalMine');
    expect(ids).not.toContain('personalOther1');
    expect(ids).not.toContain('personalOther2');
    expect(ids).toHaveLength(3);
  });
});

describe('useAllTenantWorkspaces filter', () => {
  const allWorkspaces = [
    makeWorkspace('t1', WorkspaceType.TEAM, 'owner', 'Alpha'),
    makeWorkspace('t2', WorkspaceType.TEAM, 'owner', 'Beta'),
    makeWorkspace('p1', WorkspaceType.PERSONAL, CURRENT_USER_ID, 'Personal'),
    makeWorkspace(
      'p2',
      WorkspaceType.PERSONAL,
      OTHER_USER_ID,
      'Other Personal',
    ),
  ];

  function query(
    workspaces: WorkspaceWithLimits[],
    filters?: { displayName?: string; type?: WorkspaceType[] },
  ) {
    const source = makeSource(workspaces);
    return idsFrom(
      createLiveQueryCollection({
        query: (q) => {
          let builder = q.from({ workspace: source });

          if (filters?.displayName) {
            builder = builder.where(({ workspace }) =>
              like(workspace.displayName, `%${filters.displayName}%`),
            ) as typeof builder;
          }

          if (filters?.type && filters.type.length > 0) {
            builder = builder.where(({ workspace }) => {
              const types = filters.type!;
              if (types.length === 1) return eq(workspace.type, types[0]);
              const conditions = types.map((t) => eq(workspace.type, t)) as [
                ReturnType<typeof eq>,
                ReturnType<typeof eq>,
                ...ReturnType<typeof eq>[],
              ];
              return or(...conditions);
            }) as typeof builder;
          }

          return builder.select(({ workspace }) => ({ ...workspace }));
        },
        startSync: true,
      }),
    );
  }

  it('returns all workspaces when no filters are applied', () => {
    expect(query(allWorkspaces)).toHaveLength(4);
  });

  it('filters by displayName substring', () => {
    const ids = query(allWorkspaces, { displayName: 'eta' });
    expect(ids).toContain('t2');
    expect(ids).not.toContain('t1');
  });

  it('filters to only TEAM workspaces when type is [TEAM]', () => {
    const ids = query(allWorkspaces, { type: [WorkspaceType.TEAM] });
    expect(ids).toContain('t1');
    expect(ids).toContain('t2');
    expect(ids).not.toContain('p1');
    expect(ids).not.toContain('p2');
  });

  it('filters to only PERSONAL workspaces when type is [PERSONAL]', () => {
    const ids = query(allWorkspaces, { type: [WorkspaceType.PERSONAL] });
    expect(ids).toContain('p1');
    expect(ids).toContain('p2');
    expect(ids).not.toContain('t1');
    expect(ids).not.toContain('t2');
  });

  it('returns all workspaces when both types are specified', () => {
    expect(
      query(allWorkspaces, {
        type: [WorkspaceType.TEAM, WorkspaceType.PERSONAL],
      }),
    ).toHaveLength(4);
  });
});

describe('useCurrentWorkspace filter', () => {
  function query(
    workspaces: WorkspaceWithLimits[],
    workspaceId: string | null,
  ) {
    const source = makeSource(workspaces);
    return idsFrom(
      createLiveQueryCollection({
        query: (q) =>
          q
            .from({ workspace: source })
            .where(({ workspace }) => eq(workspace.id, workspaceId))
            .select(({ workspace }) => ({ ...workspace }))
            .findOne(),
        startSync: true,
      }),
    );
  }

  it('returns the matching workspace', () => {
    const workspaces = [
      makeWorkspace('proj1', WorkspaceType.TEAM, 'owner'),
      makeWorkspace('proj2', WorkspaceType.TEAM, 'owner'),
    ];
    const ids = query(workspaces, 'proj1');
    expect(ids).toContain('proj1');
    expect(ids).not.toContain('proj2');
  });

  it('returns nothing when the ID is not in the collection', () => {
    const workspaces = [makeWorkspace('proj1', WorkspaceType.TEAM, 'owner')];
    expect(query(workspaces, 'projMissing')).toHaveLength(0);
  });
});

describe('useHasAccessToWorkspace filter', () => {
  function hasAccess(
    workspaces: WorkspaceWithLimits[],
    workspaceId: string,
  ): boolean {
    const source = makeSource(workspaces);
    const result = createLiveQueryCollection({
      query: (q) =>
        q
          .from({ workspace: source })
          .where(({ workspace }) => eq(workspace.id, workspaceId))
          .select(({ workspace }) => ({ ...workspace }))
          .findOne(),
      startSync: true,
    });
    return [...result.values()].length > 0;
  }

  it('returns true when the workspace exists', () => {
    expect(
      hasAccess([makeWorkspace('proj1', WorkspaceType.TEAM, 'owner')], 'proj1'),
    ).toBe(true);
  });

  it('returns false when the workspace does not exist', () => {
    expect(
      hasAccess(
        [makeWorkspace('proj1', WorkspaceType.TEAM, 'owner')],
        'projMissing',
      ),
    ).toBe(false);
  });

  it('returns false for an empty collection', () => {
    expect(hasAccess([], 'proj1')).toBe(false);
  });
});

describe('setCurrentWorkspace', () => {
  let switchToWorkspace: ReturnType<typeof vi.fn>;
  let setCurrentWorkspace: (workspaceId: string, pathName?: string) => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    const session = await import('../../../lib/authentication-session');
    switchToWorkspace = session.authenticationSession
      .switchToWorkspace as ReturnType<typeof vi.fn>;
    ({
      workspaceCollectionUtils: { setCurrentWorkspace },
    } = await import('./workspace-collection'));
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });
  });

  it('calls switchToWorkspace with the given workspace ID', () => {
    setCurrentWorkspace('projNew');
    expect(switchToWorkspace).toHaveBeenCalledWith('projNew');
  });

  it('does not navigate when no pathName is provided', () => {
    window.location.href = 'http://original';
    setCurrentWorkspace('projNew');
    expect(window.location.href).toBe('http://original');
  });

  it('replaces the workspace ID segment in the pathname and navigates', () => {
    setCurrentWorkspace('projNew', '/workspaces/projOld/workflows');
    expect(window.location.href).toBe('/workspaces/projNew/workflows');
  });

  it('works at different route depths', () => {
    setCurrentWorkspace('projNew', '/workspaces/projAbc123/automations');
    expect(window.location.href).toBe('/workspaces/projNew/automations');
  });

  it('does not modify paths without a /workspaces/:id segment', () => {
    setCurrentWorkspace('projNew', '/tenant/workspaces');
    expect(window.location.href).toBe('/tenant/workspaces');
  });
});
