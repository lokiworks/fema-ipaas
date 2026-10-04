import {
  ReleaseChangeAction,
  ReleaseChangeWithDetails,
  ReleaseSystemComment,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { releaseUiUtils } from '@/features/releases/utils/release-ui-utils';
import { versionReleaseInfo } from '@/features/releases/utils/version-release-info';

const change = (
  overrides: Partial<ReleaseChangeWithDetails> &
    Pick<ReleaseChangeWithDetails, 'id' | 'action' | 'created'>,
): ReleaseChangeWithDetails => ({
  updated: overrides.created,
  projectId: 'project',
  workflowId: 'workflow',
  actorId: 'user',
  fromVersionId: null,
  toVersionId: null,
  restoredVersionId: null,
  note: null,
  comment: null,
  approverIds: [],
  releaseId: null,
  environmentsEnabled: null,
  actorName: 'Alice',
  approverNames: [],
  workflowDisplayName: 'Flow',
  fromVersionNumber: null,
  toVersionNumber: null,
  restoredVersionNumber: null,
  ...overrides,
});

describe('versionReleaseInfo.byVersion', () => {
  it('keeps the latest production and test record of each version', () => {
    const info = versionReleaseInfo.byVersion([
      change({
        id: 'a',
        action: ReleaseChangeAction.DEPLOYED_TO_TEST,
        created: '2026-10-01T10:00:00.000Z',
        toVersionId: 'v1',
        note: 'first test',
      }),
      change({
        id: 'b',
        action: ReleaseChangeAction.DEPLOYED_TO_TEST,
        created: '2026-10-01T12:00:00.000Z',
        toVersionId: 'v1',
        note: 'second test',
      }),
      change({
        id: 'c',
        action: ReleaseChangeAction.APPROVED,
        created: '2026-10-02T09:00:00.000Z',
        toVersionId: 'v1',
        note: 'go live',
      }),
    ]);
    expect(info['v1']?.test?.note).toBe('second test');
    expect(info['v1']?.production?.note).toBe('go live');
  });

  it('names the requester next to the approver who made a promotion go live', () => {
    const info = versionReleaseInfo.byVersion([
      change({
        id: 'a',
        action: ReleaseChangeAction.REQUESTED,
        created: '2026-10-01T10:00:00.000Z',
        toVersionId: 'v1',
        releaseId: 'release-1',
        actorName: 'Alice',
      }),
      change({
        id: 'b',
        action: ReleaseChangeAction.APPROVED,
        created: '2026-10-01T11:00:00.000Z',
        toVersionId: 'v1',
        releaseId: 'release-1',
        actorName: 'Owner',
      }),
    ]);
    expect(info['v1']?.requestedBy).toBe('Alice');
    expect(info['v1']?.production?.actorName).toBe('Owner');
  });

  it('ignores records that do not publish a version', () => {
    const info = versionReleaseInfo.byVersion([
      change({
        id: 'a',
        action: ReleaseChangeAction.REQUESTED,
        created: '2026-10-01T10:00:00.000Z',
        toVersionId: 'v1',
      }),
      change({
        id: 'b',
        action: ReleaseChangeAction.ENVIRONMENTS_UPDATED,
        created: '2026-10-01T11:00:00.000Z',
      }),
    ]);
    expect(info).toEqual({});
  });

  it('counts a rollback as the production publish of the new version', () => {
    const info = versionReleaseInfo.byVersion([
      change({
        id: 'a',
        action: ReleaseChangeAction.ROLLED_BACK,
        created: '2026-10-03T10:00:00.000Z',
        toVersionId: 'v4',
        restoredVersionId: 'v2',
        restoredVersionNumber: 2,
      }),
    ]);
    expect(info['v4']?.production?.restoredVersionNumber).toBe(2);
    expect(info['v4']?.test).toBeNull();
  });
});

describe('releaseUiUtils.commentText', () => {
  it('translates the comments the server writes itself and keeps human ones', () => {
    expect(
      releaseUiUtils.commentText(ReleaseSystemComment.WITHDRAWN_BY_ROLLBACK),
    ).toBe(ReleaseSystemComment.WITHDRAWN_BY_ROLLBACK);
    expect(releaseUiUtils.commentText('looks good')).toBe('looks good');
  });
});
