import {
  GenericStepOutput,
  ReliabilityEventKind,
  RunLogScope,
  RunRerunBlockReason,
  StepOutputStatus,
  WorkflowActionType,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { runLogUiUtils } from '@/features/run-logs/utils/run-log-ui-utils';

describe('runLogUiUtils', () => {
  it('labels every reliability outcome including withheld retries', () => {
    for (const kind of Object.values(ReliabilityEventKind)) {
      expect(runLogUiUtils.handledKindLabel(kind).length).toBeGreaterThan(0);
    }
  });
  it('labels every rerun block reason', () => {
    Object.values(RunRerunBlockReason).forEach((reason) => {
      expect(runLogUiUtils.blockReasonLabel(reason).length).toBeGreaterThan(0);
    });
  });

  it('writes the unblock time into the blocked-until reason', () => {
    const label = runLogUiUtils.blockReasonLabel(
      RunRerunBlockReason.BLOCKED_UNTIL,
      '2026-10-03T16:00:00.000Z',
    );
    expect(label).toContain('2026');
    expect(label).not.toContain('{time}');
  });

  it('uses the longest project retention as the query window', () => {
    const scope: RunLogScope = {
      projects: [
        {
          id: 'p1',
          displayName: 'A',
          retentionDays: 30,
          rawRetentionDays: 3,
          canRerun: true,
        },
        {
          id: 'p2',
          displayName: 'B',
          retentionDays: 14,
          rawRetentionDays: 3,
          canRerun: false,
        },
      ],
      workflows: [],
      connectors: [],
      tenantRetentionDays: 30,
      tenantRawRetentionDays: 3,
      canManagePrivacy: false,
    };
    expect(runLogUiUtils.maxRetentionDays(scope)).toBe(30);
  });

  it('states both retention tiers with the configured numbers', () => {
    const scope: RunLogScope = {
      projects: [
        {
          id: 'p1',
          displayName: 'A',
          retentionDays: 30,
          rawRetentionDays: 3,
          canRerun: true,
        },
        {
          id: 'p2',
          displayName: 'B',
          retentionDays: 7,
          rawRetentionDays: 3,
          canRerun: true,
        },
      ],
      workflows: [],
      connectors: [],
      tenantRetentionDays: 30,
      tenantRawRetentionDays: 3,
      canManagePrivacy: false,
    };
    const text = runLogUiUtils.retentionText(scope);
    expect(text).toContain('30');
    expect(text).toContain('3');
    expect(text).toContain('B');
    expect(text).not.toContain('{');
    expect(runLogUiUtils.projectRetention({ scope, projectId: 'p2' })).toEqual(
      { logDays: 7, rawDays: 3 },
    );
    expect(
      runLogUiUtils.projectRetention({ scope, projectId: 'unknown' }),
    ).toEqual({ logDays: 30, rawDays: 3 });
    expect(
      runLogUiUtils.projectRetention({ scope: undefined, projectId: 'p1' }),
    ).toBeNull();
  });

  it('falls back to the masked log once the original run data expired', () => {
    expect(
      runLogUiUtils.runDataState({
        logsFileId: 'raw',
        displayLogsFileId: 'masked',
        rawPayloadExpired: false,
      }),
    ).toBe('RAW');
    expect(
      runLogUiUtils.runDataState({
        logsFileId: null,
        displayLogsFileId: 'masked',
        rawPayloadExpired: true,
      }),
    ).toBe('MASKED_ONLY');
    expect(
      runLogUiUtils.runDataState({
        logsFileId: null,
        displayLogsFileId: null,
      }),
    ).toBe('NONE');
    const notice = runLogUiUtils.maskedOnlyNotice({ logDays: 30, rawDays: 3 });
    expect(notice).toContain('3');
    expect(notice).not.toContain('{');
    expect(
      runLogUiUtils.logsGoneText({ logDays: 30, rawDays: 3 }),
    ).not.toContain('{');
  });

  it('lists steps in execution order when the version is unavailable', () => {
    const nodes = runLogUiUtils.stepNodes({
      trigger: undefined,
      loopIndexes: {},
      steps: {
        trigger: GenericStepOutput.create({
          type: WorkflowActionType.CODE,
          status: StepOutputStatus.SUCCEEDED,
          input: {},
          output: { ok: true },
        }).setDuration(12),
        step_1: GenericStepOutput.create({
          type: WorkflowActionType.CODE,
          status: StepOutputStatus.FAILED,
          input: { a: 1 },
        }).setErrorMessage('boom'),
      },
    });
    expect(nodes.map((node) => [node.name, node.status])).toEqual([
      ['trigger', StepOutputStatus.SUCCEEDED],
      ['step_1', StepOutputStatus.FAILED],
    ]);
    expect(nodes[1].errorMessage).toBe('boom');
  });
});
