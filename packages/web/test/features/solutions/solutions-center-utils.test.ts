import {
  SolutionCheckKind,
  SolutionConfigType,
  SolutionProvider,
  SolutionSummary,
  SolutionVisibility,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { solutionsUtils } from '@/features/solutions/utils/solutions-utils';

function official({
  id,
  installCount,
  updated,
}: {
  id: string;
  installCount: number;
  updated: string;
}): SolutionSummary {
  return {
    id,
    created: updated,
    updated,
    tenantId: null,
    provider: SolutionProvider.OFFICIAL,
    name: id,
    summary: id,
    category: 'HR',
    visibility: SolutionVisibility.TENANT,
    sourceProjectId: null,
    currentVersion: '1.0',
    createdBy: null,
    workflowCount: 1,
    connectorNames: [],
    installCount,
    installedProjectIds: [],
  };
}

describe('solutionsUtils.sortForCenter', () => {
  const solutions = [
    official({
      id: 'never',
      installCount: 0,
      updated: '2026-10-27T00:00:00.000Z',
    }),
    official({
      id: 'once',
      installCount: 1,
      updated: '2026-10-03T00:00:00.000Z',
    }),
    official({
      id: 'twice',
      installCount: 2,
      updated: '2026-10-01T00:00:00.000Z',
    }),
  ];

  it('puts the most installed solution first when sorting by popularity', () => {
    expect(
      solutionsUtils
        .sortForCenter({ solutions, byInstalls: true })
        .map((solution) => solution.id),
    ).toEqual(['twice', 'once', 'never']);
  });

  it('puts the latest solution first when sorting by newest', () => {
    expect(
      solutionsUtils
        .sortForCenter({ solutions, byInstalls: false })
        .map((solution) => solution.id),
    ).toEqual(['never', 'once', 'twice']);
  });
});

describe('solutionsUtils.splitChecks', () => {
  it('keeps checks that need installed resources out of the install checks', () => {
    const checks = [
      { key: 'a', afterInstall: undefined },
      { key: 'b', afterInstall: true },
      { key: 'c', afterInstall: false },
    ];
    const split = solutionsUtils.splitChecks(checks);
    expect(split.beforeInstall.map((check) => check.key)).toEqual(['a', 'c']);
    expect(split.afterInstall.map((check) => check.key)).toEqual(['b']);
  });
});

describe('solutionsUtils.isConfigRequired', () => {
  const item = {
    key: 'k',
    label: 'K',
    options: [],
    defaultValue: '',
    affectsWorkflows: [],
    patches: [],
  };

  it('marks text items required unless they opt out, matching the install validation', () => {
    expect(
      solutionsUtils.isConfigRequired({
        ...item,
        type: SolutionConfigType.TEXT,
      }),
    ).toBe(true);
    expect(
      solutionsUtils.isConfigRequired({
        ...item,
        type: SolutionConfigType.TEXT,
        required: false,
      }),
    ).toBe(false);
    expect(
      solutionsUtils.isConfigRequired({
        ...item,
        type: SolutionConfigType.SELECT,
      }),
    ).toBe(false);
  });

  it('explains a dependency that is not installed yet', () => {
    expect(solutionsUtils.checkMessage('solutionNotInstalled')).not.toBeNull();
    expect(SolutionCheckKind.SOLUTION).toBe('SOLUTION');
  });
});
