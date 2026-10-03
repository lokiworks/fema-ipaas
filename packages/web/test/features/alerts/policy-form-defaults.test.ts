import {
  AlertPolicy,
  AlertTriggerEvent,
  UpsertAlertPolicyRequestBody,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { alertUiUtils } from '@/features/alerts/utils/alert-ui-utils';

describe('alertUiUtils.policyFormDefaults', () => {
  it('leaves quiet hours off for a new policy but keeps a ready window to fill in', () => {
    const values = alertUiUtils.policyFormDefaults({ existing: null });

    expect(values.quietHours).toEqual({
      enabled: false,
      from: '22:00',
      to: '08:00',
      timezone: expect.any(String),
    });
  });

  it('gives a new policy values the request schema accepts once a name and channel are picked', () => {
    const values = alertUiUtils.policyFormDefaults({ existing: null });

    const parsed = UpsertAlertPolicyRequestBody.safeParse({
      ...values,
      name: 'defaults',
      channelIds: ['channel-1'],
    });

    expect(parsed.success).toBe(true);
  });

  it('keeps the quiet hours of an existing policy untouched', () => {
    const quietHours = {
      enabled: true,
      from: '23:00',
      to: '07:00',
      timezone: 'Asia/Shanghai',
    };
    const existing: AlertPolicy = {
      id: 'policy-1',
      created: '2026-10-01T00:00:00.000Z',
      updated: '2026-10-01T00:00:00.000Z',
      tenantId: 'tenant-1',
      name: 'existing',
      enabled: true,
      projectIds: [],
      workflowIds: [],
      events: [AlertTriggerEvent.ISSUE_NEW],
      failureRate: null,
      capacityThresholdPercent: null,
      groupWindowMinutes: 30,
      quietHours,
      escalation: { enabled: false, afterMinutes: 60, channelId: null },
      channelIds: ['channel-1'],
      updatedById: null,
    };

    expect(alertUiUtils.policyFormDefaults({ existing }).quietHours).toEqual(
      quietHours,
    );
  });
});
