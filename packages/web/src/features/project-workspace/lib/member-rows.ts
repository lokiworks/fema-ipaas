import { DefaultProjectRole, ProjectMemberWithUser } from '@fema-ipaas/shared';

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
    name:
      `${member.user.firstName ?? ''} ${member.user.lastName ?? ''}`.trim() ||
      member.user.email,
    email: member.user.email,
    role: member.role,
    implicit: false,
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
};
