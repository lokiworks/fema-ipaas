import {
  CodeAction,
  DefaultProjectRole,
  EmptyTrigger,
  ProjectMemberWithUser,
  TenantRole,
  UserStatus,
  WorkflowActionType,
  WorkflowTriggerType,
  WorkflowVersion,
  WorkflowVersionState,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import {
  EnvironmentStatus,
  PromotionBlocker,
  releaseUiUtils,
} from '@/features/releases/utils/release-ui-utils';
import {
  StepChangeKind,
  versionDiff,
} from '@/features/releases/utils/version-diff';

const codeStep = ({
  name,
  code,
  nextAction,
}: {
  name: string;
  code: string;
  nextAction?: CodeAction;
}): CodeAction => ({
  name,
  valid: true,
  displayName: name,
  lastUpdatedDate: '2026-01-01T00:00:00.000Z',
  type: WorkflowActionType.CODE,
  settings: {
    sourceCode: { code, packageJson: '{}' },
    input: {},
    errorHandlingOptions: {},
  },
  nextAction,
});

const triggerWith = (firstAction?: CodeAction): EmptyTrigger => ({
  name: 'trigger',
  valid: false,
  displayName: 'Trigger',
  type: WorkflowTriggerType.EMPTY,
  settings: {},
  lastUpdatedDate: '2026-01-01T00:00:00.000Z',
  nextAction: firstAction,
});

describe('versionDiff.diffSteps', () => {
  it('reports added, modified and removed steps', () => {
    const before = triggerWith(
      codeStep({
        name: 'step_1',
        code: 'a',
        nextAction: codeStep({ name: 'step_2', code: 'b' }),
      }),
    );
    const after = triggerWith(
      codeStep({
        name: 'step_1',
        code: 'changed',
        nextAction: codeStep({ name: 'step_3', code: 'c' }),
      }),
    );
    const changes = versionDiff.diffSteps({ before, after });
    expect(changes.map((change) => [change.kind, change.name])).toEqual([
      [StepChangeKind.ADDED, 'step_3'],
      [StepChangeKind.MODIFIED, 'step_1'],
      [StepChangeKind.REMOVED, 'step_2'],
    ]);
  });

  it('treats every step as added when nothing was published before', () => {
    const after = triggerWith(codeStep({ name: 'step_1', code: 'a' }));
    const changes = versionDiff.diffSteps({ before: null, after });
    expect(
      changes.every((change) => change.kind === StepChangeKind.ADDED),
    ).toBe(true);
    expect(changes).toHaveLength(2);
  });
});

const versionWith = ({
  displayName = 'Onboarding',
  trigger,
}: {
  displayName?: string;
  trigger: EmptyTrigger;
}): WorkflowVersion => ({
  id: 'v1',
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
  workflowId: 'wf',
  displayName,
  trigger,
  agentIds: [],
  connectionIds: [],
  state: WorkflowVersionState.DRAFT,
  valid: true,
  notes: [],
  schemaVersion: null,
  backupFiles: null,
});

describe('versionDiff.hasChanges', () => {
  const published = versionWith({
    trigger: triggerWith(codeStep({ name: 'step_1', code: 'a' })),
  });

  it('is false when the draft only differs in test data or timestamps', () => {
    const draft = versionWith({
      trigger: {
        ...triggerWith(codeStep({ name: 'step_1', code: 'a' })),
        lastUpdatedDate: '2026-02-02T00:00:00.000Z',
      },
    });
    expect(versionDiff.hasChanges({ before: published, after: draft })).toBe(
      false,
    );
  });

  it('is true when a step was edited', () => {
    const draft = versionWith({
      trigger: triggerWith(codeStep({ name: 'step_1', code: 'b' })),
    });
    expect(versionDiff.hasChanges({ before: published, after: draft })).toBe(
      true,
    );
  });

  it('is true when the workflow was renamed', () => {
    const draft = versionWith({
      displayName: 'Onboarding v2',
      trigger: triggerWith(codeStep({ name: 'step_1', code: 'a' })),
    });
    expect(versionDiff.hasChanges({ before: published, after: draft })).toBe(
      true,
    );
  });

  it('is true when steps only changed order', () => {
    const before = versionWith({
      trigger: triggerWith(
        codeStep({
          name: 'step_1',
          code: 'a',
          nextAction: codeStep({ name: 'step_2', code: 'b' }),
        }),
      ),
    });
    const after = versionWith({
      trigger: triggerWith(
        codeStep({
          name: 'step_2',
          code: 'b',
          nextAction: codeStep({ name: 'step_1', code: 'a' }),
        }),
      ),
    });
    expect(versionDiff.hasChanges({ before, after })).toBe(true);
  });
});

describe('releaseUiUtils.promotionBlocker', () => {
  it('blocks workflows that were never deployed to test', () => {
    expect(
      releaseUiUtils.promotionBlocker({
        testVersionId: null,
        productionVersionId: 'v1',
        pendingReleaseId: null,
      }),
    ).toBe(PromotionBlocker.NO_TEST_DEPLOYMENT);
  });

  it('blocks while a promotion is waiting for approval', () => {
    expect(
      releaseUiUtils.promotionBlocker({
        testVersionId: 'v2',
        productionVersionId: 'v1',
        pendingReleaseId: 'release',
      }),
    ).toBe(PromotionBlocker.PENDING_APPROVAL);
  });

  it('blocks when production already runs the test version', () => {
    expect(
      releaseUiUtils.promotionBlocker({
        testVersionId: 'v2',
        productionVersionId: 'v2',
        pendingReleaseId: null,
      }),
    ).toBe(PromotionBlocker.SAME_AS_PRODUCTION);
  });

  it('allows promoting a test version that is not in production', () => {
    expect(
      releaseUiUtils.promotionBlocker({
        testVersionId: 'v2',
        productionVersionId: null,
        pendingReleaseId: null,
      }),
    ).toBeNull();
  });
});

describe('releaseUiUtils.approvalRequired', () => {
  it('needs approval only when approvers are set', () => {
    expect(releaseUiUtils.approvalRequired(['approver'])).toBe(true);
    expect(releaseUiUtils.approvalRequired([])).toBe(false);
  });
});

describe('releaseUiUtils.environmentStatus', () => {
  const base = {
    versionId: 'v2',
    isDraft: false,
    testVersionId: 'v2',
    productionVersionId: 'v1',
  };

  it('reports drafts as not deployed', () => {
    expect(releaseUiUtils.environmentStatus({ ...base, isDraft: true })).toBe(
      EnvironmentStatus.NOT_DEPLOYED,
    );
  });

  it('tells test, production and both apart', () => {
    expect(releaseUiUtils.environmentStatus(base)).toBe(EnvironmentStatus.TEST);
    expect(
      releaseUiUtils.environmentStatus({ ...base, testVersionId: 'v3' }),
    ).toBe(EnvironmentStatus.NONE);
    expect(releaseUiUtils.environmentStatus({ ...base, versionId: 'v1' })).toBe(
      EnvironmentStatus.PRODUCTION,
    );
    expect(
      releaseUiUtils.environmentStatus({ ...base, productionVersionId: 'v2' }),
    ).toBe(EnvironmentStatus.TEST_AND_PRODUCTION);
  });
});

describe('releaseUiUtils.testWebhookUrl', () => {
  it('appends the test environment path to the webhook prefix', () => {
    expect(
      releaseUiUtils.testWebhookUrl({
        webhookUrlPrefix: 'https://ipaas.example.com/api/v1/webhooks/',
        workflowId: 'wf1',
      }),
    ).toBe('https://ipaas.example.com/api/v1/webhooks/wf1/test-env');
  });
});

describe('releaseUiUtils.approverCandidates', () => {
  const member = ({
    userId,
    role,
    firstName,
  }: {
    userId: string;
    role: DefaultProjectRole;
    firstName: string;
  }): ProjectMemberWithUser => ({
    id: `member-${userId}`,
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    projectId: 'project',
    userId,
    role,
    user: {
      id: userId,
      email: `${userId}@example.com`,
      firstName,
      lastName: '',
      status: UserStatus.ACTIVE,
      externalId: null,
      tenantId: 'tenant',
      tenantRole: TenantRole.MEMBER,
      lastActiveDate: null,
      imageUrl: null,
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-01-01T00:00:00.000Z',
    },
  });

  it('lists the owner first, then admins and developers', () => {
    const candidates = releaseUiUtils.approverCandidates({
      ownerId: 'owner',
      members: [
        member({
          userId: 'dev',
          role: DefaultProjectRole.DEVELOPER,
          firstName: 'Dev',
        }),
        member({
          userId: 'viewer',
          role: DefaultProjectRole.VIEWER,
          firstName: 'Vi',
        }),
        member({
          userId: 'owner',
          role: DefaultProjectRole.ADMIN,
          firstName: 'Olga',
        }),
        member({
          userId: 'op',
          role: DefaultProjectRole.OPERATOR,
          firstName: 'Op',
        }),
      ],
    });
    expect(candidates).toEqual([
      { userId: 'owner', name: 'Olga', isOwner: true },
      { userId: 'dev', name: 'Dev', isOwner: false },
    ]);
  });

  it('keeps the owner even when they are not a member', () => {
    const candidates = releaseUiUtils.approverCandidates({
      ownerId: 'owner',
      members: [],
    });
    expect(candidates).toEqual([
      { userId: 'owner', name: null, isOwner: true },
    ]);
  });
});
