import {
  InvitationStatus,
  InvitationType,
  UserInvitationWithLink,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { invitationUtils } from '@/features/invitations/utils/invitation-utils';

function invitation(
  overrides: Partial<UserInvitationWithLink>,
): UserInvitationWithLink {
  return {
    id: 'invitation-1',
    created: '2026-10-02T00:00:00.000Z',
    updated: '2026-10-02T00:00:00.000Z',
    email: 'new@example.com',
    type: InvitationType.PROJECT,
    status: InvitationStatus.PENDING,
    tenantId: 'tenant-1',
    projectId: 'project-1',
    projectRoleId: 'Viewer',
    tenantRole: null,
    ...overrides,
  };
}

describe('invitationUtils.needsManualDelivery', () => {
  it('asks the inviter to hand over the link when no email was sent and the invitee has not joined', () => {
    expect(
      invitationUtils.needsManualDelivery(
        invitation({ link: 'http://app/invitation?token=abc' }),
      ),
    ).toBe(true);
  });

  it('does not when the invitee was added straight away', () => {
    expect(
      invitationUtils.needsManualDelivery(
        invitation({
          status: InvitationStatus.ACCEPTED,
          link: 'http://app/invitation?token=abc',
        }),
      ),
    ).toBe(false);
  });

  it('does not when the server emailed the invitee and returned no link', () => {
    expect(invitationUtils.needsManualDelivery(invitation({}))).toBe(false);
    expect(invitationUtils.needsManualDelivery(invitation({ link: '' }))).toBe(
      false,
    );
  });
});
