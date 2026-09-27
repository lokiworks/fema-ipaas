import { WorkflowVersionState } from '@fema-ipaas/shared';

import { versionNumbers } from '@/app/builder/workflow-versions/version-numbers';

describe('versionNumbers', () => {
  const versions = [
    {
      id: 'draft',
      created: '2026-03-01T00:00:00.000Z',
      state: WorkflowVersionState.DRAFT,
    },
    {
      id: 'b',
      created: '2026-02-01T00:00:00.000Z',
      state: WorkflowVersionState.LOCKED,
    },
    {
      id: 'a',
      created: '2026-01-01T00:00:00.000Z',
      state: WorkflowVersionState.LOCKED,
    },
  ];

  it('numbers locked versions in creation order and skips drafts', () => {
    expect(versionNumbers.numberVersions(versions)).toEqual({ a: 1, b: 2 });
  });

  it('labels known versions and returns null otherwise', () => {
    const numbers = versionNumbers.numberVersions(versions);
    expect(versionNumbers.label({ numbers, versionId: 'b' })).toBe('v2');
    expect(versionNumbers.label({ numbers, versionId: 'draft' })).toBeNull();
    expect(versionNumbers.label({ numbers, versionId: null })).toBeNull();
  });
});
