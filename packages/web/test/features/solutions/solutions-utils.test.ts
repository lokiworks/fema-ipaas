import {
  ConnectionScope,
  ConnectionStatus,
  ConnectionType,
  ConnectionWithoutSensitiveData,
  SolutionCheckKind,
  SolutionCheckResult,
  SolutionCheckStatus,
  SolutionInstall,
  SolutionProvider,
  SolutionSummary,
  SolutionVisibility,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { solutionsUtils } from '@/features/solutions/utils/solutions-utils';

const NOW = '2026-10-01T00:00:00.000Z';

function summary({
  id,
  category,
  name,
  createdBy,
  connectorNames = [],
}: {
  id: string;
  category: string;
  name: string;
  createdBy: string | null;
  connectorNames?: string[];
}): SolutionSummary {
  return {
    id,
    created: NOW,
    updated: NOW,
    tenantId: 'tenant',
    provider: SolutionProvider.TENANT,
    name,
    summary: `${name} summary`,
    category,
    visibility: SolutionVisibility.TENANT,
    sourceProjectId: null,
    currentVersion: '1.0',
    createdBy,
    workflowCount: 1,
    connectorNames,
    installCount: 0,
    installedProjectIds: [],
  };
}

function connection({
  externalId,
  status,
}: {
  externalId: string;
  status: ConnectionStatus;
}): ConnectionWithoutSensitiveData {
  return {
    id: externalId,
    created: NOW,
    updated: NOW,
    externalId,
    displayName: externalId,
    type: ConnectionType.SECRET_TEXT,
    connectorName: 'beisen',
    projectIds: [],
    tenantId: 'tenant',
    scope: ConnectionScope.PROJECT,
    status,
    ownerId: null,
    owner: null,
    metadata: null,
    workflowIds: null,
    connectorVersion: '1.0.0',
    preSelectForNewProjects: false,
  };
}

function result({
  key,
  blocking,
  status,
}: {
  key: string;
  blocking: boolean;
  status: SolutionCheckStatus;
}): SolutionCheckResult {
  return {
    key,
    label: key,
    kind: SolutionCheckKind.CONNECTION,
    blocking,
    status,
    message: null,
    detail: null,
    who: null,
    fixSteps: [],
  };
}

function install({
  version,
  latestVersion,
}: {
  version: string;
  latestVersion: string;
}): SolutionInstall {
  return {
    id: 'install',
    created: NOW,
    updated: NOW,
    tenantId: 'tenant',
    projectId: 'project',
    solutionId: 'solution',
    solutionName: 'Solution',
    version,
    latestVersion,
    config: {},
    connections: {},
    workflowIds: [],
    mappingTableIds: [],
    skippedChecks: [],
    installedBy: 'user',
  };
}

const SOLUTIONS = [
  summary({
    id: 'a',
    category: 'HR',
    name: 'Onboarding sync',
    createdBy: 'me',
    connectorNames: ['beisen', 'feishu'],
  }),
  summary({
    id: 'b',
    category: 'Finance',
    name: 'Purchase order',
    createdBy: 'someone',
    connectorNames: ['kingdee'],
  }),
  summary({ id: 'c', category: 'HR', name: 'Attendance', createdBy: null }),
];

describe('solutionsUtils.filterSolutions', () => {
  const base = {
    solutions: SOLUTIONS,
    category: null,
    search: '',
    mineOnly: false,
    userId: 'me',
  };

  it('returns everything without filters', () => {
    expect(solutionsUtils.filterSolutions(base).map((item) => item.id)).toEqual(
      ['a', 'b', 'c'],
    );
  });

  it('filters by category', () => {
    expect(
      solutionsUtils
        .filterSolutions({ ...base, category: 'HR' })
        .map((item) => item.id),
    ).toEqual(['a', 'c']);
  });

  it('searches names, summaries and connector names', () => {
    expect(
      solutionsUtils
        .filterSolutions({ ...base, search: 'kingdee' })
        .map((item) => item.id),
    ).toEqual(['b']);
    expect(
      solutionsUtils
        .filterSolutions({ ...base, search: '  ATTENDANCE ' })
        .map((item) => item.id),
    ).toEqual(['c']);
  });

  it('keeps only own solutions when mineOnly is set', () => {
    expect(
      solutionsUtils
        .filterSolutions({ ...base, mineOnly: true })
        .map((item) => item.id),
    ).toEqual(['a']);
  });

  it('shows no own solutions when the user is unknown', () => {
    expect(
      solutionsUtils.filterSolutions({ ...base, mineOnly: true, userId: null }),
    ).toEqual([]);
  });
});

describe('solutionsUtils.categoriesOf', () => {
  it('lists each category once, sorted', () => {
    expect(solutionsUtils.categoriesOf(SOLUTIONS)).toEqual(['Finance', 'HR']);
  });
});

describe('solutionsUtils.hasNewerVersion', () => {
  it('compares versions numerically', () => {
    expect(
      solutionsUtils.hasNewerVersion(
        install({ version: '1.2', latestVersion: '1.10' }),
      ),
    ).toBe(true);
    expect(
      solutionsUtils.hasNewerVersion(
        install({ version: '1.10', latestVersion: '1.2' }),
      ),
    ).toBe(false);
    expect(
      solutionsUtils.hasNewerVersion(
        install({ version: '1.2', latestVersion: '1.2' }),
      ),
    ).toBe(false);
  });
});

describe('solutionsUtils.effectiveConnections', () => {
  const slots = [
    { connectorName: 'beisen', usedBy: ['onboard'] },
    { connectorName: 'feishu', usedBy: ['onboard'] },
  ];

  it('auto picks the only usable connection of a slot', () => {
    const result = solutionsUtils.effectiveConnections({
      slots,
      selected: {},
      available: {
        beisen: [
          connection({ externalId: 'b1', status: ConnectionStatus.ACTIVE }),
        ],
        feishu: [
          connection({ externalId: 'f1', status: ConnectionStatus.ERROR }),
          connection({ externalId: 'f2', status: ConnectionStatus.ACTIVE }),
        ],
      },
    });
    expect(result).toEqual({ beisen: 'b1', feishu: 'f2' });
  });

  it('leaves a slot empty when several connections are usable', () => {
    const result = solutionsUtils.effectiveConnections({
      slots,
      selected: {},
      available: {
        beisen: [
          connection({ externalId: 'b1', status: ConnectionStatus.ACTIVE }),
          connection({ externalId: 'b2', status: ConnectionStatus.ACTIVE }),
        ],
        feishu: [],
      },
    });
    expect(result).toEqual({});
  });

  it('prefers the explicit selection', () => {
    const result = solutionsUtils.effectiveConnections({
      slots,
      selected: { beisen: 'b2' },
      available: {
        beisen: [
          connection({ externalId: 'b1', status: ConnectionStatus.ACTIVE }),
        ],
        feishu: [],
      },
    });
    expect(result).toEqual({ beisen: 'b2' });
  });
});

describe('solutionsUtils.missingSlots', () => {
  it('returns the slots without a connection', () => {
    const slots = [
      { connectorName: 'beisen', usedBy: [] },
      { connectorName: 'feishu', usedBy: [] },
    ];
    expect(
      solutionsUtils
        .missingSlots({ slots, connections: { beisen: 'b1' } })
        .map((slot) => slot.connectorName),
    ).toEqual(['feishu']);
  });
});

describe('solutionsUtils.checkGate', () => {
  it('blocks when a required check did not pass', () => {
    const gate = solutionsUtils.checkGate({
      results: [
        result({
          key: 'conn',
          blocking: true,
          status: SolutionCheckStatus.FAIL,
        }),
      ],
      acknowledged: ['conn'],
    });
    expect(gate.canContinue).toBe(false);
    expect(gate.failedBlocking.map((item) => item.key)).toEqual(['conn']);
  });

  it('requires acknowledging recommended checks that did not pass', () => {
    const results = [
      result({ key: 'conn', blocking: true, status: SolutionCheckStatus.PASS }),
      result({
        key: 'scope',
        blocking: false,
        status: SolutionCheckStatus.NEEDS_CONFIRM,
      }),
      result({ key: 'ip', blocking: false, status: SolutionCheckStatus.FAIL }),
    ];
    expect(
      solutionsUtils.checkGate({ results, acknowledged: ['scope'] })
        .canContinue,
    ).toBe(false);
    const gate = solutionsUtils.checkGate({
      results,
      acknowledged: ['scope', 'ip'],
    });
    expect(gate.canContinue).toBe(true);
    expect(gate.needsAcknowledgement.map((item) => item.key)).toEqual([
      'scope',
      'ip',
    ]);
  });

  it('continues when everything passed', () => {
    expect(
      solutionsUtils.checkGate({
        results: [
          result({
            key: 'conn',
            blocking: true,
            status: SolutionCheckStatus.PASS,
          }),
        ],
        acknowledged: [],
      }).canContinue,
    ).toBe(true);
  });
});

describe('solutionsUtils.toggleAcknowledged', () => {
  it('adds a key once and removes it again', () => {
    const added = solutionsUtils.toggleAcknowledged({
      acknowledged: ['a'],
      key: 'b',
      checked: true,
    });
    expect(added).toEqual(['a', 'b']);
    expect(
      solutionsUtils.toggleAcknowledged({
        acknowledged: added,
        key: 'b',
        checked: true,
      }),
    ).toEqual(['a', 'b']);
    expect(
      solutionsUtils.toggleAcknowledged({
        acknowledged: added,
        key: 'a',
        checked: false,
      }),
    ).toEqual(['b']);
  });
});

describe('solutionsUtils.workflowPath', () => {
  it('points at the workflow inside the installed project', () => {
    expect(
      solutionsUtils.workflowPath({ projectId: 'p1', workflowId: 'w1' }),
    ).toBe('/projects/p1/workflows/w1');
  });
});

describe('solutionsUtils.capacityMessage', () => {
  it('reports the free slots', () => {
    expect(
      solutionsUtils.capacityMessage({
        workflowLimit: 10,
        currentWorkflowCount: 9,
        needed: 3,
      }),
    ).toBe(
      'Installing needs 3 workflow slots but this project has 1 left (9 of 10 used)',
    );
  });
});

describe('solutionsUtils.checkMessage', () => {
  it('translates known server codes and hides unknown ones', () => {
    expect(solutionsUtils.checkMessage('connectionMissing')).toBe(
      'The selected connection no longer exists',
    );
    expect(solutionsUtils.checkMessage('something-else')).toBeNull();
    expect(solutionsUtils.checkMessage(null)).toBeNull();
  });
});
