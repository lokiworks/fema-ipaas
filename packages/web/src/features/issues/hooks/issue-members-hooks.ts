import { DefaultProjectRole, ProjectMemberWithUser } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useMemo } from 'react';

import { projectMembersHooks } from '@/features/project-members';

function useIssueMembers() {
  const { data } = projectMembersHooks.useMembers();
  return useMemo(() => {
    const members = data?.data ?? [];
    const assignable = members
      .filter((member) => member.role !== DefaultProjectRole.VIEWER)
      .map(toOption);
    const names = new Map(
      members.map((member) => [member.userId, displayName(member)]),
    );
    const nameOf = (userId: string | null): string => {
      if (userId === null) {
        return t('System');
      }
      return names.get(userId) ?? t('Unknown user');
    };
    return { assignable, nameOf };
  }, [data]);
}

function toOption(member: ProjectMemberWithUser): MemberOption {
  return { id: member.userId, name: displayName(member) };
}

function displayName(member: ProjectMemberWithUser): string {
  const fullName = `${member.user.firstName ?? ''} ${
    member.user.lastName ?? ''
  }`.trim();
  return fullName.length > 0 ? fullName : member.user.email;
}

export const issueMembersHooks = {
  useIssueMembers,
};

export type MemberOption = {
  id: string;
  name: string;
};
