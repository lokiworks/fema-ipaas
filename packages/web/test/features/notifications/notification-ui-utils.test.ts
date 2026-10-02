import {
  DefaultProjectRole,
  Notification,
  NotificationType,
  TenantModule,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { notificationUiUtils } from '@/features/notifications/utils/notification-ui-utils';

function notification(overrides: Partial<Notification>): Notification {
  return {
    id: 'n1',
    created: '2026-09-27T00:00:00.000Z',
    updated: '2026-09-27T00:00:00.000Z',
    tenantId: 't1',
    projectId: 'p1',
    recipientId: 'u1',
    type: NotificationType.ISSUE_ASSIGNED,
    title: 'Timeout in Orders sync',
    body: null,
    link: '/projects/p1/issues/i1',
    actorName: 'Lee',
    read: false,
    ...overrides,
  };
}

describe('notificationUiUtils', () => {
  it('builds a headline for every type', () => {
    Object.values(NotificationType).forEach((type) => {
      expect(
        notificationUiUtils.headline(notification({ type })).length,
      ).toBeGreaterThan(0);
    });
  });

  it('shows module labels instead of raw module identifiers', () => {
    const subject = notificationUiUtils.subject(
      notification({
        type: NotificationType.MODULE_ACCESS_APPROVED,
        title: TenantModule.MCP_SERVICES,
      }),
    );
    expect(subject).not.toBe(TenantModule.MCP_SERVICES);
    expect(notificationUiUtils.subject(notification({}))).toBe(
      'Timeout in Orders sync',
    );
  });

  it('shows the connector name and the project role in readable form', () => {
    expect(
      notificationUiUtils.bodyText({
        notification: notification({
          type: NotificationType.CONNECTION_REAUTH_REQUESTED,
          body: '@fema-ipaas/connector-beisen',
        }),
        connectorDisplayName: 'Beisen',
      }),
    ).toBe('Beisen');
    expect(
      notificationUiUtils.bodyText({
        notification: notification({
          type: NotificationType.CONNECTION_BROKEN,
          body: '@fema-ipaas/connector-beisen',
        }),
        connectorDisplayName: undefined,
      }),
    ).toBe('@fema-ipaas/connector-beisen');
    expect(
      notificationUiUtils.bodyText({
        notification: notification({
          type: NotificationType.PROJECT_MEMBER_ADDED,
          body: DefaultProjectRole.DEVELOPER,
        }),
        connectorDisplayName: undefined,
      }),
    ).toBe('Developer');
    expect(
      notificationUiUtils.bodyText({
        notification: notification({ body: null }),
        connectorDisplayName: undefined,
      }),
    ).toBeNull();
    expect(
      notificationUiUtils.bodyText({
        notification: notification({
          type: NotificationType.CAPACITY_THRESHOLD,
          body: '2 / 2 (100.0%)',
        }),
        connectorDisplayName: undefined,
      }),
    ).toBe('2 / 2 (100.0%)');
  });

  it('caps the badge at 99+', () => {
    expect(notificationUiUtils.badgeLabel(7)).toBe('7');
    expect(notificationUiUtils.badgeLabel(120)).toBe('99+');
  });
});
