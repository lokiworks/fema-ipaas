import { InvitationStatus, UserInvitationWithLink } from '@fema-ipaas/shared';

function needsManualDelivery(invitation: UserInvitationWithLink): boolean {
  return (
    invitation.status === InvitationStatus.PENDING &&
    typeof invitation.link === 'string' &&
    invitation.link.length > 0
  );
}

export const invitationUtils = { needsManualDelivery };
