import { DefaultProjectRole, ProjectMemberWithUser } from '@fema-ipaas/shared';

import { personName } from '@/lib/person-name';

function build({
  members,
  ownerId,
  ownerName,
}: {
  members: ProjectMemberWithUser[];
  ownerId: string | null | undefined;
  ownerName: string | null | undefined;
}): MemberRow[] {
  const rows = members.map((member) => ({
    id: member.id,
    userId: member.userId,
    name: personName.formatWithFallback({
      ...member.user,
      fallback: member.user.email,
    }),
    email: member.user.email,
    role: member.role,
    implicit: false,
    isOwner: member.userId === ownerId,
  }));
  const ownerListed = rows.some((row) => row.userId === ownerId);
  if (ownerListed || !ownerId || !ownerName) {
    return rows;
  }
  return [
    {
      id: `owner-${ownerId}`,
      userId: ownerId,
      name: ownerName,
      email: null,
      role: DefaultProjectRole.ADMIN,
      implicit: true,
      isOwner: true,
    },
    ...rows,
  ];
}

export const memberRows = { build };

export type MemberRow = {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  role: DefaultProjectRole;
  implicit: boolean;
  isOwner: boolean;
};
